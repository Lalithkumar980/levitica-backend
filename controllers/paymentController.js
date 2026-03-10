const Payment = require('../models/Payment');

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
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { client: new RegExp(q, 'i') },
        { referenceNo: new RegExp(q, 'i') },
      ];
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Payment.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Payments list error:', err);
    res.status(500).json({ message: 'Failed to fetch payments' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Payment.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Payment not found' });
    res.json(doc);
  } catch (err) {
    console.error('Payment get error:', err);
    res.status(500).json({ message: 'Failed to fetch payment' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const amount = toNumber(body.amount) ?? 0;
    const payload = {
      client: body.client != null ? String(body.client).trim() : '',
      amount,
      date: parseDate(body.date),
      method: body.method != null ? String(body.method).trim() : (body.paymentMethod != null ? String(body.paymentMethod).trim() : ''),
      referenceNo: body.referenceNo != null ? String(body.referenceNo).trim() : '',
      invoiceRef: body.invoiceRef != null ? String(body.invoiceRef).trim() : '',
      notes: body.notes != null ? String(body.notes).trim() : '',
    };
    const doc = await Payment.create(payload);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Payment create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create payment' });
  }
}

async function update(req, res) {
  try {
    const doc = await Payment.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Payment not found' });
    const body = req.body || {};
    if (body.client !== undefined) doc.client = String(body.client).trim();
    if (body.amount !== undefined) doc.amount = toNumber(body.amount) ?? 0;
    if (body.date !== undefined) doc.date = parseDate(body.date);
    if (body.method !== undefined) doc.method = String(body.method).trim();
    if (body.paymentMethod !== undefined) doc.method = String(body.paymentMethod).trim();
    if (body.referenceNo !== undefined) doc.referenceNo = String(body.referenceNo).trim();
    if (body.invoiceRef !== undefined) doc.invoiceRef = String(body.invoiceRef).trim();
    if (body.notes !== undefined) doc.notes = String(body.notes).trim();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('Payment update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update payment' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Payment.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Payment not found' });
    res.json({ message: 'Payment deleted', id: doc._id });
  } catch (err) {
    console.error('Payment delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete payment' });
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};
