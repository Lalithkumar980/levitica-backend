const Invoice = require('../models/Invoice');

const GST_RATE = 0.18;

function toNumber(v) {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function parseDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const iso = s.includes('-') && s.length === 10 && s.split('-')[0].length === 4;
  if (iso) return new Date(s);
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return new Date(year, month, day);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

async function list(req, res) {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { client: new RegExp(q, 'i') },
        { invoiceNo: new RegExp(q, 'i') },
      ];
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Invoice.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Invoices list error:', err);
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Invoice.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Invoice not found' });
    res.json(doc);
  } catch (err) {
    console.error('Invoice get error:', err);
    res.status(500).json({ message: 'Failed to fetch invoice' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const baseAmount = toNumber(body.baseAmount) ?? 0;
    const gst = Math.round(baseAmount * GST_RATE);
    const total = baseAmount + gst;
    const payload = {
      invoiceNo: body.invoiceNo != null ? String(body.invoiceNo).trim() : '',
      client: body.client != null ? String(body.client).trim() : '',
      type: body.type === 'Training' ? 'Training' : 'Company',
      category: body.category === 'Expense' ? 'Expense' : 'Revenue',
      baseAmount,
      gst,
      total,
      status: ['Pending', 'Paid', 'Overdue', 'Partial'].includes(body.status) ? body.status : 'Pending',
      paymentMethod: body.paymentMethod != null ? String(body.paymentMethod).trim() : '',
      invoiceDate: parseDate(body.invoiceDate),
      dueDate: parseDate(body.dueDate),
      paidDate: parseDate(body.paidDate),
      description: body.description != null ? String(body.description).trim() : '',
    };
    const doc = await Invoice.create(payload);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Invoice create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create invoice' });
  }
}

async function update(req, res) {
  try {
    const doc = await Invoice.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Invoice not found' });
    const body = req.body || {};
    if (body.invoiceNo !== undefined) doc.invoiceNo = String(body.invoiceNo).trim();
    if (body.client !== undefined) doc.client = String(body.client).trim();
    if (body.type !== undefined) doc.type = body.type === 'Training' ? 'Training' : 'Company';
    if (body.category !== undefined) doc.category = body.category === 'Expense' ? 'Expense' : 'Revenue';
    if (body.baseAmount !== undefined) {
      const baseAmount = toNumber(body.baseAmount) ?? 0;
      doc.baseAmount = baseAmount;
      doc.gst = Math.round(baseAmount * GST_RATE);
      doc.total = baseAmount + doc.gst;
    }
    if (body.status !== undefined && ['Pending', 'Paid', 'Overdue', 'Partial'].includes(body.status)) doc.status = body.status;
    if (body.paymentMethod !== undefined) doc.paymentMethod = String(body.paymentMethod).trim();
    if (body.invoiceDate !== undefined) doc.invoiceDate = parseDate(body.invoiceDate);
    if (body.dueDate !== undefined) doc.dueDate = parseDate(body.dueDate);
    if (body.paidDate !== undefined) doc.paidDate = parseDate(body.paidDate);
    if (body.description !== undefined) doc.description = String(body.description).trim();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('Invoice update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update invoice' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Invoice.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Invoice not found' });
    res.json({ message: 'Invoice deleted', id: doc._id });
  } catch (err) {
    console.error('Invoice delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete invoice' });
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};
