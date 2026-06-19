const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const User = require("../models/User");
const { recordFinanceActivity } = require("../utils/financeActivity");
const { sendMail }             = require("../utils/mailer");
const { buildInvoiceEmail }    = require("../utils/invoiceMailTemplate");
const { generatePdfBuffer }    = require("../utils/pdfGenerator");
const https                    = require("https");

const DEFAULT_GST_RATE = 18;

function toNumber(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function parseDate(v) {
  if (v === undefined || v === null || v === "") return undefined;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const iso =
    s.includes("-") && s.length === 10 && s.split("-")[0].length === 4;
  if (iso) return new Date(s);
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year))
      return new Date(year, month, day);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function normalizeGstRate(v) {
  const n = toNumber(v);
  if (n === undefined) return DEFAULT_GST_RATE;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

async function generateInvoiceNo() {
  const latest = await Invoice.findOne({ invoiceNo: /INV-\d+/i })
    .sort({ createdAt: -1 })
    .lean();
  if (!latest?.invoiceNo) return "INV-00001";
  const match = String(latest.invoiceNo).match(/INV-(\d+)/i);
  const current = match ? Number(match[1]) : 0;
  const next = (Number.isFinite(current) ? current : 0) + 1;
  return `INV-${String(next).padStart(5, "0")}`;
}

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { client: new RegExp(q, "i") },
        { invoiceNo: new RegExp(q, "i") },
      ];
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    // Attach payment totals to each invoice so the UI can compute
    // collected vs outstanding (including partial payments).
    const invoiceNos = (items || []).map((i) => i.invoiceNo).filter(Boolean);
    let paymentMap = {};
    if (invoiceNos.length > 0) {
      const aggs = await Payment.aggregate([
        { $match: { invoiceRef: { $in: invoiceNos } } },
        { $group: { _id: "$invoiceRef", totalPaid: { $sum: "$amount" } } },
      ]);
      paymentMap = aggs.reduce((acc, a) => {
        acc[a._id] = a.totalPaid;
        return acc;
      }, {});
    }

    const nextItems = (items || []).map((inv) => {
      const paidAmount = paymentMap[inv.invoiceNo] ?? 0;
      const totalNum = Number(inv.total) || 0;
      const outstanding = Math.max(0, totalNum - paidAmount);
      return { ...inv, paidAmount, outstanding };
    });

    res.json({
      items: nextItems,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("Invoices list error:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Invoice.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: "Invoice not found" });
    res.json(doc);
  } catch (err) {
    console.error("Invoice get error:", err);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const baseAmount = toNumber(body.baseAmount) ?? 0;
    const gstRate = normalizeGstRate(body.gstRate);
    const gst = Math.round((baseAmount * gstRate) / 100);
    const total = baseAmount + gst;
    const invoiceNoRaw =
      body.invoiceNo != null ? String(body.invoiceNo).trim() : "";
    const payload = {
      invoiceNo: invoiceNoRaw || (await generateInvoiceNo()),
      client: body.client != null ? String(body.client).trim() : "",
      clientEmail: body.clientEmail != null ? String(body.clientEmail).trim() : "",
      clientPhone: body.clientPhone != null ? String(body.clientPhone).trim() : "",
      type: body.type === "Training" ? "Training" : "Company",
      category: ["Revenue", "Training", "Placement", "Services"].includes(body.category)
        ? body.category
        : "Revenue",
      baseAmount,
      gstRate,
      gst,
      total,
      status: "Pending",
      paymentMethod: "",
      invoiceDate: parseDate(body.invoiceDate),
      dueDate: parseDate(body.dueDate),
      paidDate: undefined,
      description:
        body.description != null ? String(body.description).trim() : "",
      dealId: body.dealId || undefined,
    };
    const doc = await Invoice.create(payload);

    // ── Send invoice email to client (non-blocking) ──────────────────────────
    const recipientEmail = (body.clientEmail || '').trim();
    if (recipientEmail) {
      try {
        // Find company logo from the Admin profile
        let companyLogoUrl = null;
        try {
          const adminUser = await User.findOne({ role: "Admin" });
          if (adminUser) {
            if (adminUser.companyLogo && adminUser.companyLogo.startsWith("http")) {
              companyLogoUrl = adminUser.companyLogo;
            } else if (adminUser.companyLogoFileId) {
              companyLogoUrl = `https://lh3.googleusercontent.com/d/${adminUser.companyLogoFileId}=s400`;
            }
          }
        } catch (logoErr) {
          console.error("[invoice] Failed to fetch admin company logo:", logoErr.message || logoErr);
        }

        const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
        const payUrl = `${backendUrl}/finance/pay/${doc.invoiceNo}`;
        const { subject, html, text } = buildInvoiceEmail(doc, companyLogoUrl, payUrl);
        
        // Generate PDF
        console.log(`[invoice] Generating PDF for invoice ${doc.invoiceNo}...`);
        const pdfBuffer = await generatePdfBuffer(html);

        const mailResult = await sendMail({
          to:      recipientEmail,
          subject,
          html,
          text,
          from:    process.env.MAIL_FROM || process.env.SMTP_USER,
          attachments: [
            {
              filename: `Invoice-${doc.invoiceNo}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            }
          ]
        });
        if (mailResult.ok) {
          console.log(`[invoice] ✅ Invoice email sent to ${recipientEmail} for ${doc.invoiceNo}`);
        } else {
          console.warn(`[invoice] ⚠️  Invoice email failed for ${recipientEmail}:`, mailResult.error);
        }
      } catch (mailErr) {
        // Never let email errors block the API response
        console.error('[invoice] Email send error (non-fatal):', mailErr.message || mailErr);
      }
    } else {
      console.log(`[invoice] ℹ️  No clientEmail provided — skipping invoice email for ${doc.invoiceNo}`);
    }
    try {
      await recordFinanceActivity(req, {
        type: "invoice_created",
        title: `Invoice created: ${doc.invoiceNo}`,
        subtitle: `${doc.client || "Client"} · ₹${Number(doc.total || 0).toFixed(2)}`,
        icon: "invoice",
        metadata: {
          invoiceId: doc._id,
          invoiceNo: doc.invoiceNo,
          category: doc.category,
        },
      });
    } catch (err) {
      console.error("Failed to log invoice finance activity:", err);
    }
    res.status(201).json(doc);
  } catch (err) {
    console.error("Invoice create error:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to create invoice" });
  }
}

async function update(req, res) {
  try {
    const doc = await Invoice.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Invoice not found" });
    const body = req.body || {};
    if (body.invoiceNo !== undefined)
      doc.invoiceNo = String(body.invoiceNo).trim();
    if (body.client !== undefined) doc.client = String(body.client).trim();
    if (body.clientEmail !== undefined) doc.clientEmail = String(body.clientEmail).trim();
    if (body.clientPhone !== undefined) doc.clientPhone = String(body.clientPhone).trim();
    if (body.type !== undefined)
      doc.type = body.type === "Training" ? "Training" : "Company";
    if (body.category !== undefined) {
      doc.category = ["Revenue", "Training", "Placement", "Services"].includes(body.category)
        ? body.category
        : "Revenue";
    }
    const hasBaseAmount = body.baseAmount !== undefined;
    const hasGstRate = body.gstRate !== undefined;
    if (hasBaseAmount) doc.baseAmount = toNumber(body.baseAmount) ?? 0;
    if (hasGstRate) doc.gstRate = normalizeGstRate(body.gstRate);
    if (hasBaseAmount || hasGstRate) {
      const baseAmount = Number(doc.baseAmount) || 0;
      const gstRate = normalizeGstRate(doc.gstRate);
      doc.gstRate = gstRate;
      doc.gst = Math.round((baseAmount * gstRate) / 100);
      doc.total = baseAmount + doc.gst;
    }
    // status, paymentMethod, and paidDate are automatically managed by payments and not directly updated here
    if (body.invoiceDate !== undefined)
      doc.invoiceDate = parseDate(body.invoiceDate);
    if (body.dueDate !== undefined) doc.dueDate = parseDate(body.dueDate);
    if (body.description !== undefined)
      doc.description = String(body.description).trim();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error("Invoice update error:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to update invoice" });
  }
}

async function remove(req, res) {
  try {
    const doc = await Invoice.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Invoice not found" });
    res.json({ message: "Invoice deleted", id: doc._id });
  } catch (err) {
    console.error("Invoice delete error:", err);
    res
      .status(500)
      .json({ message: err.message || "Failed to delete invoice" });
  }
}

// ─── Stripe API Helper (uses standard Node https module) ────────────────────
function stripeRequest(path, method, body = null, secretKey) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : new URLSearchParams(body).toString()) : '';
    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${secretKey}`
      }
    };
    if (method === 'POST') {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error?.message || `Stripe API error: ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Stripe response: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (method === 'POST' && postData) {
      req.write(postData);
    }
    req.end();
  });
}

// ─── Premium Success/Error HTML Renderer ────────────────────────────────────
function renderHtmlMessage(title, message, isSuccess, details = null) {
  const detailsHtml = details 
    ? `<div class="details-box">
        ${Object.entries(details).map(([k, v]) => `
          <div class="details-row">
            <span class="details-label">${k}</span>
            <span class="details-value">${v}</span>
          </div>
        `).join('')}
       </div>`
    : '';

  const themeColor = isSuccess ? '#10B981' : '#EF4444';
  const icon = isSuccess 
    ? `<svg class="success-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`
    : `<svg class="error-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
      color: #F8FAFC;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 40px 32px;
      width: 100%;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      animation: fadeIn 0.6s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .icon-wrapper {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: rgba(${isSuccess ? '16, 185, 129' : '239, 68, 68'}, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      color: ${themeColor};
    }
    .icon-wrapper svg {
      width: 48px;
      height: 48px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 12px;
      color: #FFFFFF;
    }
    p {
      font-size: 15px;
      color: #94A3B8;
      line-height: 1.6;
      margin: 0 0 32px;
    }
    .details-box {
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 32px;
      text-align: left;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 14px;
    }
    .details-row:last-child {
      border-bottom: none;
    }
    .details-label {
      color: #64748B;
      font-weight: 500;
    }
    .details-value {
      color: #E2E8F0;
      font-weight: 600;
      text-align: right;
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%);
      color: #FFFFFF;
      text-decoration: none;
      padding: 14px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.25);
      transition: opacity 0.2s;
      box-sizing: border-box;
    }
    .btn:hover {
      opacity: 0.95;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      ${icon}
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${detailsHtml}
    <a href="https://levitica-data-management.vercel.app" class="btn">Close Window</a>
  </div>
</body>
</html>
  `;
}

// ─── Public Endpoint: Initiate Stripe Payment ──────────────────────────────
async function payInvoice(req, res) {
  try {
    const { invoiceNo } = req.params;
    const invoice = await Invoice.findOne({ invoiceNo }).lean();
    if (!invoice) {
      return res.status(404).send(renderHtmlMessage("Invoice Not Found", `The requested invoice ${invoiceNo} could not be found.`, false));
    }

    // Recalculate outstanding amount
    const [agg] = await Payment.aggregate([
      { $match: { invoiceRef: invoice.invoiceNo } },
      { $group: { _id: null, totalPaid: { $sum: "$amount" } } },
    ]);
    const totalPaid = agg?.totalPaid ?? 0;
    const outstanding = Math.max(0, invoice.total - totalPaid);

    if (outstanding <= 0 || invoice.status === "Paid") {
      return res.send(renderHtmlMessage("Invoice Already Paid", `Invoice ${invoiceNo} has already been paid. Thank you!`, true));
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).send(renderHtmlMessage("Configuration Missing", "Stripe Secret Key is not configured. Please add STRIPE_SECRET_KEY to your backend .env file.", false));
    }

    const payload = {
      success_url: `${req.protocol}://${req.get("host")}/finance/stripe/success?session_id={CHECKOUT_SESSION_ID}&invoiceNo=${invoice.invoiceNo}`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://levitica-data-management.vercel.app'}/finance/invoices`,
      mode: 'payment',
      'line_items[0][price_data][currency]': 'inr',
      'line_items[0][price_data][product_data][name]': `Invoice ${invoice.invoiceNo}`,
      'line_items[0][price_data][unit_amount]': Math.round(outstanding * 100), // outstanding in paise
      'line_items[0][quantity]': 1,
      client_reference_id: invoice.invoiceNo,
      customer_email: invoice.clientEmail || '',
    };

    console.log(`[Stripe] Creating checkout session for invoice ${invoice.invoiceNo} with amount ₹${outstanding}...`);
    const session = await stripeRequest('/v1/checkout/sessions', 'POST', payload, stripeSecretKey);
    res.redirect(session.url);
  } catch (err) {
    console.error("Stripe payment redirect error:", err);
    res.status(500).send(renderHtmlMessage("Payment Service Unavailable", err.message || "An error occurred while setting up your payment session.", false));
  }
}

// ─── Public Endpoint: Stripe Success Callback ──────────────────────────────
async function stripeSuccess(req, res) {
  try {
    const { session_id, invoiceNo } = req.query;
    if (!session_id || !invoiceNo) {
      return res.status(400).send(renderHtmlMessage("Invalid Request", "Session ID and Invoice Number are required.", false));
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).send(renderHtmlMessage("Configuration Missing", "Stripe Secret Key is not configured.", false));
    }

    // Fetch checkout session details
    console.log(`[Stripe] Verifying checkout session ${session_id}...`);
    const session = await stripeRequest(`/v1/checkout/sessions/${session_id}`, 'GET', null, stripeSecretKey);
    if (session.payment_status !== 'paid') {
      return res.status(400).send(renderHtmlMessage("Payment Verification Failed", "Stripe Checkout session is not completed or unpaid.", false));
    }

    const invoice = await Invoice.findOne({ invoiceNo });
    if (!invoice) {
      return res.status(404).send(renderHtmlMessage("Invoice Not Found", "The associated invoice could not be found.", false));
    }

    // Record the payment if not already stored
    let payment = await Payment.findOne({ referenceNo: session.id });
    if (!payment) {
      const paymentAmount = session.amount_total / 100;
      payment = await Payment.create({
        client: invoice.client || session.customer_details?.name || 'Client',
        amount: paymentAmount,
        date: new Date(),
        method: 'Stripe',
        referenceNo: session.id,
        invoiceRef: invoice.invoiceNo,
        notes: 'Payment completed via Stripe Online Checkout.',
      });

      // Recalculate invoice status and totals
      const { recalculateInvoiceFromPayments } = require("./paymentController");
      await recalculateInvoiceFromPayments(invoice.invoiceNo);
      
      // Log finance activity
      try {
        await recordFinanceActivity(req, {
          type: "payment_added",
          title: `Stripe payment: ₹${paymentAmount.toFixed(2)}`,
          subtitle: `${invoice.client} · Invoice ${invoice.invoiceNo}`,
          icon: "payment",
          metadata: {
            paymentId: payment._id,
            invoiceRef: invoice.invoiceNo,
          },
        });
      } catch (err) {
        console.error("Failed to log activity:", err);
      }
    }

    // Display premium verification success card
    res.send(renderHtmlMessage("Payment Successful", `Your payment of ₹${(session.amount_total/100).toLocaleString('en-IN')} for Invoice <strong>${invoiceNo}</strong> has been successfully processed. Thank you for your business!`, true, {
      "Invoice No": invoiceNo,
      "Amount Paid": `₹${(session.amount_total/100).toLocaleString('en-IN')}`,
      "Payment Method": "Stripe Checkout",
      "Transaction ID": session.payment_intent || session.id,
      "Date": new Date().toLocaleDateString('en-IN')
    }));
  } catch (err) {
    console.error("Stripe success handler error:", err);
    res.status(500).send(renderHtmlMessage("Verification Failed", err.message || "An error occurred while verifying the payment.", false));
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  payInvoice,
  stripeSuccess,
};
