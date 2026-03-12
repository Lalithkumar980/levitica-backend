const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');

/** GET /api/candidates — list all candidates */
router.get('/', async (req, res) => {
  try {
    const list = await Candidate.find().sort({ createdAt: -1 }).lean();
    const withId = list.map((doc) => {
      const o = { ...doc, id: doc._id.toString() };
      delete o._id;
      delete o.__v;
      return o;
    });
    res.json({ candidates: withId });
  } catch (err) {
    console.error('Candidates list error:', err);
    res.status(500).json({ message: 'Failed to fetch candidates' });
  }
});

/** POST /api/candidates — create single candidate */
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const doc = await Candidate.create({
      name: body.name || '',
      note: body.note ?? null,
      position: body.position || '—',
      dept: body.dept || '—',
      interviewDate: body.interviewDate || '—',
      came: body.came || '—',
      screening: body.screening || 'Not Yet',
      technical: body.technical || 'Not Yet',
      hrRound: body.hrRound || 'Not Yet',
      offer: body.offer || '—',
      salary: body.salary ?? '',
      onboarding: body.onboarding ?? null,
      joiningDate: body.joiningDate ?? null,
      referredBy: body.referredBy ?? null,
      recruiter: body.recruiter ?? undefined,
    });
    res.status(201).json(doc.toJSON());
  } catch (err) {
    console.error('Candidate create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create candidate' });
  }
});

/** POST /api/candidates/bulk — create many candidates */
router.post('/bulk', async (req, res) => {
  try {
    const { candidates: raw } = req.body || {};
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ message: 'Body must include candidates array with at least one item' });
    }
    const toInsert = raw.map((c) => ({
      name: c.name || '',
      note: c.note ?? null,
      position: c.position || '—',
      dept: c.dept || '—',
      interviewDate: c.interviewDate || '—',
      came: c.came || '—',
      screening: c.screening || 'Not Yet',
      technical: c.technical || 'Not Yet',
      hrRound: c.hrRound || 'Not Yet',
      offer: c.offer || '—',
      salary: c.salary ?? '',
      onboarding: c.onboarding ?? null,
      joiningDate: c.joiningDate ?? null,
      referredBy: c.referredBy ?? null,
      recruiter: c.recruiter ?? undefined,
    }));
    const inserted = await Candidate.insertMany(toInsert);
    const withId = inserted.map((doc) => doc.toJSON());
    res.status(201).json({ candidates: withId, count: withId.length });
  } catch (err) {
    console.error('Candidates bulk create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create candidates' });
  }
});

/** PUT /api/candidates/:id — update single candidate */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const set = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.note !== undefined) set.note = body.note;
    if (body.position !== undefined) set.position = body.position;
    if (body.dept !== undefined) set.dept = body.dept;
    if (body.interviewDate !== undefined) set.interviewDate = body.interviewDate;
    if (body.came !== undefined) set.came = body.came;
    if (body.screening !== undefined) set.screening = body.screening;
    if (body.technical !== undefined) set.technical = body.technical;
    if (body.hrRound !== undefined) set.hrRound = body.hrRound;
    if (body.offer !== undefined) set.offer = body.offer;
    if (body.salary !== undefined) set.salary = body.salary;
    if (body.onboarding !== undefined) set.onboarding = body.onboarding;
    if (body.joiningDate !== undefined) set.joiningDate = body.joiningDate;
    if (body.referredBy !== undefined) set.referredBy = body.referredBy;
    if (body.recruiter !== undefined) set.recruiter = body.recruiter;
    const doc = await Candidate.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Candidate not found' });
    res.json(doc.toJSON());
  } catch (err) {
    console.error('Candidate update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update candidate' });
  }
});

module.exports = router;
