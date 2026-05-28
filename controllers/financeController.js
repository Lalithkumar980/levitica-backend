const FinanceActivity = require("../models/FinanceActivity");
const Invoice = require("../models/Invoice");
const Payment = require("../models/Payment");
const Expense = require("../models/Expense");

function formatDateTime(date) {
  try {
    const d = date ? new Date(date) : new Date();
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function buildInvoiceItem(inv) {
  return {
    type: "invoice",
    title: `Invoice created: ${inv.invoiceNo}`,
    subtitle: `${inv.client || "Client"} · ₹${Number(inv.total || 0).toFixed(2)}`,
    createdAt: inv.createdAt,
    metadata: {
      invoiceId: inv._id,
      invoiceNo: inv.invoiceNo,
    },
    targetType: "invoice",
    targetId: inv._id,
  };
}

function buildPaymentItem(pay) {
  return {
    type: "payment",
    title: `Payment received: ₹${Number(pay.amount || 0).toFixed(2)}`,
    subtitle: `${pay.client || "Client"}${pay.invoiceRef ? ` · Invoice ${pay.invoiceRef}` : ""}`,
    createdAt: pay.createdAt,
    metadata: {
      paymentId: pay._id,
      invoiceRef: pay.invoiceRef,
    },
    targetType: "payment",
    targetId: pay._id,
  };
}

function buildExpenseItem(exp) {
  return {
    type: "expense",
    title: `Expense recorded: ${exp.title} · ₹${Number(exp.amount || 0).toFixed(2)}`,
    subtitle: `${exp.vendor || "Vendor"} · ${exp.category || "Expense"}`,
    createdAt: exp.createdAt,
    metadata: {
      expenseId: exp._id,
      category: exp.category,
    },
    targetType: "expense",
    targetId: exp._id,
  };
}

async function recentActivity(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      50
    );
    const [activities, invoices, payments, expenses] = await Promise.all([
      FinanceActivity.find().sort({ createdAt: -1 }).limit(limit).lean(),
      Invoice.find().sort({ createdAt: -1 }).limit(limit).lean(),
      Payment.find().sort({ createdAt: -1 }).limit(limit).lean(),
      Expense.find().sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const activityItems = (activities || []).map((item) => ({
      type: item.type,
      title: item.title,
      subtitle: item.subtitle || formatDateTime(item.createdAt),
      createdAt: item.createdAt,
      metadata: item.metadata || {},
      targetType: item.type || null,
      targetId:
        item.metadata?.invoiceId ||
        item.metadata?.paymentId ||
        item.metadata?.expenseId ||
        item.metadata?.id ||
        null,
    }));

    const historyItems = [
      ...(invoices || []).map(buildInvoiceItem),
      ...(payments || []).map(buildPaymentItem),
      ...(expenses || []).map(buildExpenseItem),
    ];

    const merged = [...activityItems, ...historyItems]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    res.json({ activity: merged });
  } catch (err) {
    console.error("Finance recent activity error:", err);
    res.status(500).json({ message: "Failed to fetch finance activity" });
  }
}

module.exports = {
  recentActivity,
};
