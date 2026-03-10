const Expense = require('../models/Expense');

const CATEGORIES = ['Infrastructure', 'Rent', 'Salaries', 'Software', 'Travel', 'Marketing', 'Utilities'];

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
    if (req.query.category && CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.search && req.query.search.trim()) {
      const q = req.query.search.trim();
      filter.$or = [
        { title: new RegExp(q, 'i') },
        { vendor: new RegExp(q, 'i') },
      ];
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Expense.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Expenses list error:', err);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Expense.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Expense not found' });
    res.json(doc);
  } catch (err) {
    console.error('Expense get error:', err);
    res.status(500).json({ message: 'Failed to fetch expense' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const amount = toNumber(body.amount) ?? 0;
    const payload = {
      title: body.title != null ? String(body.title).trim() : '',
      category: CATEGORIES.includes(body.category) ? body.category : 'Infrastructure',
      amount,
      vendor: body.vendor != null ? String(body.vendor).trim() : '',
      status: body.status === 'Pending' ? 'Pending' : 'Paid',
      paymentMethod: body.paymentMethod != null ? String(body.paymentMethod).trim() : '',
      date: parseDate(body.date),
      receiptNo: body.receiptNo != null ? String(body.receiptNo).trim() : '',
      recurring: ['No', 'Yes Monthly', 'One-off'].includes(body.recurring) ? body.recurring : 'One-off',
      notes: body.notes != null ? String(body.notes).trim() : '',
    };
    const doc = await Expense.create(payload);
    res.status(201).json(doc);
  } catch (err) {
    console.error('Expense create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create expense' });
  }
}

async function update(req, res) {
  try {
    const doc = await Expense.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Expense not found' });
    const body = req.body || {};
    if (body.title !== undefined) doc.title = String(body.title).trim();
    if (body.category !== undefined && CATEGORIES.includes(body.category)) doc.category = body.category;
    if (body.amount !== undefined) doc.amount = toNumber(body.amount) ?? 0;
    if (body.vendor !== undefined) doc.vendor = String(body.vendor).trim();
    if (body.status !== undefined) doc.status = body.status === 'Pending' ? 'Pending' : 'Paid';
    if (body.paymentMethod !== undefined) doc.paymentMethod = String(body.paymentMethod).trim();
    if (body.date !== undefined) doc.date = parseDate(body.date);
    if (body.receiptNo !== undefined) doc.receiptNo = String(body.receiptNo).trim();
    if (body.recurring !== undefined && ['No', 'Yes Monthly', 'One-off'].includes(body.recurring)) doc.recurring = body.recurring;
    if (body.notes !== undefined) doc.notes = String(body.notes).trim();
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error('Expense update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update expense' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Expense.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Expense not found' });
    res.json({ message: 'Expense deleted', id: doc._id });
  } catch (err) {
    console.error('Expense delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete expense' });
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};
