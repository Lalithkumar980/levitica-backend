/**
 * invoiceMailTemplate.js
 * Generates a professional HTML + plain-text invoice notification email
 * sent to the client when a new invoice is created.
 */

'use strict';

/**
 * Format a number as Indian Rupees (e.g. 118000 → ₹1,18,000)
 */
function formatINR(value) {
  const num = Number(value) || 0;
  return '₹' + num.toLocaleString('en-IN');
}

/**
 * Format a Date object or ISO string to DD-MM-YYYY
 */
function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * Build HTML email body for a new invoice.
 *
 * @param {object} invoice  - Mongoose Invoice document (or plain object)
 * @returns {{ subject: string, html: string, text: string }}
 */
function buildInvoiceEmail(invoice, logoUrl = null, payUrl = null) {
  const {
    invoiceNo   = 'INV-00000',
    client      = 'Valued Client',
    baseAmount  = 0,
    gstRate     = 18,
    gst         = 0,
    total       = 0,
    invoiceDate,
    dueDate,
    description = '',
    category    = 'Revenue',
    type        = 'Company',
  } = invoice;

  const subject = `Invoice ${invoiceNo} from Levitica Technologies`;

  // ─── HTML Template ──────────────────────────────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #F1F5F9; color: #1E293B; }
    .wrapper { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%); padding: 28px 32px 20px; }
    .logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .logo-box { width: 42px; height: 42px; background: #3B82F6; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-box span { color: #fff; font-weight: 900; font-size: 18px; }
    .brand { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .brand small { display: block; color: #94A3B8; font-size: 11px; font-weight: 400; margin-top: 1px; }
    .invoice-badge { background: rgba(59,130,246,0.18); border: 1px solid rgba(59,130,246,0.35); color: #93C5FD; display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 10px; }
    .header h1 { color: #F8FAFC; font-size: 22px; font-weight: 800; }
    .header p  { color: #94A3B8; font-size: 13px; margin-top: 6px; }
    .body { padding: 28px 32px; }
    .greeting { font-size: 15px; color: #334155; margin-bottom: 8px; }
    .greeting strong { color: #0F172A; }
    .intro { font-size: 13px; color: #64748B; line-height: 1.5; margin-bottom: 20px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .meta-item { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 14px; }
    .meta-item label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94A3B8; display: block; margin-bottom: 3px; }
    .meta-item value { font-size: 12.5px; font-weight: 600; color: #0F172A; }
    .divider { border: none; border-top: 1px solid #E2E8F0; margin: 18px 0; }
    .section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94A3B8; margin-bottom: 10px; }
    .amount-table { width: 100%; border-collapse: collapse; }
    .amount-table td { padding: 8px 0; font-size: 13px; color: #475569; }
    .amount-table td:last-child { text-align: right; font-weight: 600; color: #0F172A; }
    .amount-table tr.separator td { border-top: 1px dashed #E2E8F0; padding-top: 10px; }
    .total-row td { font-size: 15px; font-weight: 800; color: #0F172A; padding-top: 12px; }
    .total-badge { background: linear-gradient(135deg, #1E40AF, #3B82F6); color: #fff; padding: 4px 12px; border-radius: 8px; font-size: 15px; font-weight: 800; }
    .due-box { background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 12px 16px; margin: 18px 0; display: flex; align-items: center; gap: 12px; }
    .due-icon { font-size: 20px; }
    .due-text label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9A3412; }
    .due-text value { font-size: 13.5px; font-weight: 700; color: #7C2D12; display: block; }
    .pay-btn-container { text-align: center; margin: 24px 0; }
    .desc-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; margin-top: 16px; }
    .desc-box p { font-size: 12.5px; color: #475569; line-height: 1.55; }
    .footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 32px; text-align: center; }
    .footer p { font-size: 11.5px; color: #94A3B8; line-height: 1.6; }
    .footer a { color: #3B82F6; text-decoration: none; }
    .footer .company { font-weight: 700; color: #64748B; font-size: 12.5px; margin-bottom: 3px; }

    @media print {
      body { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .wrapper { max-width: 100% !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; border: none !important; }
      .header { padding: 24px 30px 18px !important; }
      .body { padding: 24px 30px !important; }
      .footer { padding: 16px 30px !important; }
      .meta-grid { margin-bottom: 16px !important; gap: 8px !important; }
      .meta-item { padding: 8px 12px !important; }
      .divider { margin: 14px 0 !important; }
      .due-box { margin: 14px 0 !important; padding: 10px 14px !important; }
      .pay-btn-container { margin: 16px 0 !important; }
      .desc-box { margin-top: 12px !important; padding: 10px 12px !important; }
      .intro { margin-bottom: 16px !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- HEADER -->
    <div class="header">
      <!-- LOGO ROW -->
      <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; border-collapse: collapse;">
        <tr>
          <td valign="middle" style="padding-right: 12px; vertical-align: middle;">
            ${logoUrl ? `
              <img src="${logoUrl}" alt="Logo" style="display: block; max-height: 42px; max-width: 120px; object-fit: contain; border-radius: 6px;" />
            ` : `
              <div class="logo-box"><span>L</span></div>
            `}
          </td>
          <td valign="middle" style="vertical-align: middle;">
            <div class="brand">
              Levitica Technologies
              <small>Pvt. Ltd.</small>
            </div>
          </td>
        </tr>
      </table>
      <div class="invoice-badge">Invoice</div>
      <h1>${invoiceNo}</h1>
      <p>Issued on ${formatDate(invoiceDate)}</p>
    </div>

    <!-- BODY -->
    <div class="body">
      <p class="greeting">Dear <strong>${client}</strong>,</p>
      <p class="intro">
        Please find below the details of your invoice from <strong>Levitica Technologies Pvt. Ltd.</strong>
        Kindly review the amount due and make the payment before the due date.
      </p>

      <!-- Meta grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <label>Invoice No.</label>
          <value>${invoiceNo}</value>
        </div>
        <div class="meta-item">
          <label>Invoice Date</label>
          <value>${formatDate(invoiceDate)}</value>
        </div>
        <div class="meta-item">
          <label>Type</label>
          <value>${type}</value>
        </div>
        <div class="meta-item">
          <label>Category</label>
          <value>${category}</value>
        </div>
      </div>

      <hr class="divider" />
      <div class="section-title">Amount Breakdown</div>

      <table class="amount-table">
        <tr>
          <td>Base Amount</td>
          <td>${formatINR(baseAmount)}</td>
        </tr>
        <tr>
          <td>GST (${gstRate}%)</td>
          <td>${formatINR(gst)}</td>
        </tr>
        <tr class="separator">
          <td class="total-row">Total Amount Due</td>
          <td class="total-row"><span class="total-badge">${formatINR(total)}</span></td>
        </tr>
      </table>

      ${dueDate ? `
      <!-- Due Date -->
      <div class="due-box">
        <div class="due-icon">📅</div>
        <div class="due-text">
          <label>Payment Due Date</label>
          <value>${formatDate(dueDate)}</value>
        </div>
      </div>` : ''}

      ${payUrl ? `
      <!-- Pay Now Button -->
      <div class="pay-btn-container">
        <a href="${payUrl}" style="background: linear-gradient(135deg, #10B981, #059669); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(16,185,129,0.3); transition: all 0.2s ease;">
          Pay Invoice Online (Stripe)
        </a>
      </div>` : ''}

      ${description && description !== '-' ? `
      <hr class="divider" />
      <div class="section-title">Description / Notes</div>
      <div class="desc-box">
        <p>${description}</p>
      </div>` : ''}

    </div>

    <!-- FOOTER -->
    <div class="footer">
      <p class="company">Levitica Technologies Pvt. Ltd.</p>
      <p>
        If you have any questions about this invoice, please contact us at<br />
        <a href="mailto:info@leviticatechnologies.com">info@leviticatechnologies.com</a>
      </p>
      <p style="margin-top: 12px; font-size: 11px; color: #CBD5E1;">
        This is an automated invoice notification. Please do not reply to this email directly.
      </p>
    </div>

  </div>
</body>
</html>
`.trim();

  // ─── Plain-text fallback ─────────────────────────────────────────────────────
  const text = `
Invoice ${invoiceNo} — Levitica Technologies Pvt. Ltd.
${'='.repeat(52)}

Dear ${client},

Please find your invoice details below.

Invoice No.   : ${invoiceNo}
Invoice Date  : ${formatDate(invoiceDate)}
Due Date      : ${dueDate ? formatDate(dueDate) : 'N/A'}
Type          : ${type}
Category      : ${category}

--- Amount Breakdown ---
Base Amount   : ${formatINR(baseAmount)}
GST (${gstRate}%)    : ${formatINR(gst)}
Total Due     : ${formatINR(total)}

${payUrl ? `Pay this invoice online via Stripe: ${payUrl}\n` : ''}
${description && description !== '-' ? `Notes: ${description}\n` : ''}
For questions, contact: info@leviticatechnologies.com
Levitica Technologies Pvt. Ltd.
`.trim();

  return { subject, html, text };
}

module.exports = { buildInvoiceEmail };
