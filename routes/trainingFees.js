const express = require('express');
const router = express.Router();
const TrainingFee = require('../models/TrainingFee');

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
  if (s.includes('-') && s.length === 10 && s.split('-')[0].length === 4) return new Date(s);
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m, d);
  }
  const date = new Date(s);
  return isNaN(date.getTime()) ? undefined : date;
}

function addBalance(doc) {
  const d = doc.toObject ? doc.toObject() : { ...doc };
  d.id = (d._id || doc._id).toString();
  d.balance = Math.max(0, (d.totalFees || 0) - (d.paidAmount || 0));
  delete d.__v;
  delete d._id;
  return d;
}

/** GET /api/training-fees — list with optional search & status filter */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    const search = (req.query.search || '').trim();
    if (search) {
      filter.$or = [
        { candidateName: new RegExp(search, 'i') },
        { course: new RegExp(search, 'i') },
      ];
    }
    const status = (req.query.status || '').trim();
    if (status && status.toLowerCase() !== 'all') {
      filter.paymentStatus = new RegExp(`^${status}$`, 'i');
    }
    const list = await TrainingFee.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    const withId = list.map((doc) => {
      const o = { ...doc, id: doc._id.toString() };
      o.balance = Math.max(0, (o.totalFees || 0) - (o.paidAmount || 0));
      delete o._id;
      delete o.__v;
      return o;
    });
    res.json({ records: withId });
  } catch (err) {
    console.error('Training fees list error:', err);
    res.status(500).json({ message: 'Failed to fetch training fee records' });
  }
});

/** GET /api/training-fees/stats — aggregates for dashboard cards */
router.get('/stats', async (req, res) => {
  try {
    const list = await TrainingFee.find({}).lean();
    let totalFees = 0;
    let collected = 0;
    let paidInFull = 0;
    list.forEach((r) => {
      const total = Number(r.totalFees) || 0;
      const paid = Number(r.paidAmount) || 0;
      totalFees += total;
      collected += paid;
      if (paid >= total && total > 0) paidInFull += 1;
    });
    const pending = Math.max(0, totalFees - collected);
    res.json({
      totalCandidates: list.length,
      totalFees,
      collected,
      pending,
      paidInFull,
    });
  } catch (err) {
    console.error('Training fees stats error:', err);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

/** POST /api/training-fees — create */
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const totalFees = toNumber(body.totalFees) ?? 0;
    const paidAmount = toNumber(body.paidAmount) ?? 0;
    let paymentStatus = (body.paymentStatus || '').trim() || 'Pending';
    if (paidAmount >= totalFees && totalFees > 0) paymentStatus = 'Paid';
    else if (paidAmount > 0) paymentStatus = 'Partial';
    const doc = await TrainingFee.create({
      candidateName: (body.candidateName || '').trim(),
      course: (body.course || '').trim(),
      totalFees,
      paidAmount,
      paymentStatus,
      paymentMode: (body.paymentMode || '').trim(),
      date: parseDate(body.date),
      referredBy: (body.referredBy || '').trim(),
      notes: (body.notes || '').trim(),
    });
    res.status(201).json(addBalance(doc));
  } catch (err) {
    console.error('Training fee create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create record' });
  }
});

/** PUT /api/training-fees/:id — update */
router.put('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const totalFees = toNumber(body.totalFees);
    const paidAmount = toNumber(body.paidAmount);
    let paymentStatus = body.paymentStatus;
    if (totalFees !== undefined && paidAmount !== undefined) {
      if (paidAmount >= totalFees && totalFees > 0) paymentStatus = 'Paid';
      else if (paidAmount > 0) paymentStatus = 'Partial';
      else paymentStatus = 'Pending';
    }
    const set = {};
    if (body.candidateName !== undefined) set.candidateName = String(body.candidateName).trim();
    if (body.course !== undefined) set.course = String(body.course).trim();
    if (totalFees !== undefined) set.totalFees = totalFees;
    if (paidAmount !== undefined) set.paidAmount = paidAmount;
    if (paymentStatus !== undefined) set.paymentStatus = paymentStatus;
    if (body.paymentMode !== undefined) set.paymentMode = String(body.paymentMode).trim();
    if (body.date !== undefined) set.date = parseDate(body.date);
    if (body.referredBy !== undefined) set.referredBy = String(body.referredBy).trim();
    if (body.notes !== undefined) set.notes = String(body.notes).trim();
    const doc = await TrainingFee.findByIdAndUpdate(req.params.id, { $set: set }, { new: true });
    if (!doc) return res.status(404).json({ message: 'Record not found' });
    res.json(addBalance(doc));
  } catch (err) {
    console.error('Training fee update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update record' });
  }
});

/** DELETE /api/training-fees/:id */
router.delete('/:id', async (req, res) => {
  try {
    const doc = await TrainingFee.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Training fee delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete record' });
  }
});

module.exports = router;
