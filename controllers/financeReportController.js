const Invoice = require('../models/Invoice');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');

async function dashboard(req, res) {
  try {
    const [paymentAgg, outstandingAgg, expenseAgg, invoiceCount, recentPayments, recentInvoices] = await Promise.all([
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Invoice.aggregate([
        { $match: { status: { $in: ['Pending', 'Overdue', 'Partial'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Invoice.countDocuments(),
      Payment.find().sort({ date: -1, createdAt: -1 }).limit(10).lean(),
      Invoice.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);
    const totalCollected = paymentAgg[0]?.total ?? 0;
    const outstanding = outstandingAgg[0]?.total ?? 0;
    const totalExpenses = expenseAgg[0]?.total ?? 0;
    const netPnl = totalCollected - totalExpenses;
    const recentActivity = [];
    recentPayments.forEach((p) => {
      recentActivity.push({
        type: 'payment',
        title: `Payment received ${(p.client || '').slice(0, 20)}${(p.client && p.client.length > 20) ? '…' : ''}`,
        subtitle: `₹${Number(p.amount).toLocaleString('en-IN')} · ${p.date ? new Date(p.date).toISOString().slice(0, 10) : ''}`,
        icon: 'payment',
      });
    });
    recentInvoices.forEach((inv) => {
      recentActivity.push({
        type: 'invoice',
        title: `Invoice ${inv.invoiceNo} - ${(inv.client || '').slice(0, 15)}`,
        subtitle: `₹${Number(inv.total).toLocaleString('en-IN')} · ${inv.status}`,
        icon: 'invoice',
      });
    });
    recentActivity.sort((a, b) => {
      const dA = a.subtitle?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
      const dB = b.subtitle?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
      return dB.localeCompare(dA);
    });
    res.json({
      totalCollected,
      outstanding,
      totalExpenses,
      netPnl,
      invoiceCount,
      recentActivity: recentActivity.slice(0, 10),
    });
  } catch (err) {
    console.error('Finance dashboard error:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard' });
  }
}

async function plReport(req, res) {
  try {
    const [revenueByType, outstandingAgg, expenseByCategory, totalPaymentAgg] = await Promise.all([
      Invoice.aggregate([
        { $match: { category: 'Revenue' } },
        { $group: { _id: '$type', total: { $sum: '$total' } } },
      ]),
      Invoice.aggregate([
        { $match: { status: { $in: ['Pending', 'Overdue', 'Partial'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Expense.aggregate([{ $group: { _id: '$category', amount: { $sum: '$amount' } } }]),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const companyRevenue = revenueByType.find((r) => r._id === 'Company')?.total ?? 0;
    const trainingRevenue = revenueByType.find((r) => r._id === 'Training')?.total ?? 0;
    const totalRevenue = (revenueByType.reduce((s, r) => s + r.total, 0)) || (totalPaymentAgg[0]?.total ?? 0);
    const outstandingAR = outstandingAgg[0]?.total ?? 0;
    const totalExpenses = expenseByCategory.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;
    const revenueBreakdown = [
      { label: 'Company Invoices', value: companyRevenue },
      { label: 'Training Fees', value: trainingRevenue },
      { label: 'Pending Collections', value: outstandingAR },
      { label: 'Total Revenue', value: totalRevenue },
    ];
    const expensesByCategory = expenseByCategory
      .filter((e) => e._id)
      .map((e) => ({ label: e._id, amount: e.amount, display: `₹${Number(e.amount).toLocaleString('en-IN')}` }));
    res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      outstandingAR,
      profitMargin,
      pipelineValue: 0,
      revenueBreakdown,
      expensesByCategory,
    });
  } catch (err) {
    console.error('Finance P&L report error:', err);
    res.status(500).json({ message: 'Failed to fetch P&L report' });
  }
}

module.exports = {
  dashboard,
  plReport,
};
