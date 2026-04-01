const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { resumeUpload } = require('../middleware/upload');
const Candidate = require('../models/Candidate');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

const PIPELINE_STAGES = ['Screening', 'Tech Round 1', 'Tech Round 2', 'HR Round', 'Final Decision'];
const SOURCE_OPTIONS = ['Consultant', 'Job Portal', 'Direct'];

router.use(authenticate);

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '—';
  const parts = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return parts || '—';
}

function leanToClient(doc) {
  const o = { ...doc, id: doc._id.toString() };
  delete o._id;
  delete o.__v;
  if (!o.pipelineStage || !PIPELINE_STAGES.includes(o.pipelineStage)) o.pipelineStage = 'Screening';
  return o;
}

function normalizeSource(v) {
  const s = String(v || '').trim();
  return SOURCE_OPTIONS.includes(s) ? s : 'Direct';
}

/** GET /api/candidates — list with optional filters */
router.get('/', async (req, res) => {
  try {
    const { search, source, type, stage } = req.query;
    const filter = {};

    if (source && SOURCE_OPTIONS.includes(source)) filter.source = source;
    if (type === 'fresher' || type === 'experienced') filter.candidateType = type;
    if (stage && PIPELINE_STAGES.includes(stage)) filter.pipelineStage = stage;

    if (search && String(search).trim()) {
      const q = escapeRegex(String(search).trim());
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { position: new RegExp(q, 'i') },
        { dept: new RegExp(q, 'i') },
        { companyName: new RegExp(q, 'i') },
        { refDetail: new RegExp(q, 'i') },
        { skills: new RegExp(q, 'i') },
      ];
    }

    const list = await Candidate.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ candidates: list.map(leanToClient) });
  } catch (err) {
    console.error('Candidates list error:', err);
    res.status(500).json({ message: 'Failed to fetch candidates' });
  }
});

/** POST /api/candidates/intake — multipart Hireflow-style intake (resume optional) */
router.post('/intake', (req, res, next) => {
  resumeUpload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'Upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').toLowerCase().trim();
    const phone = String(body.phone || '').trim();
    const sourceRaw = String(body.source || '').trim();

    if (!name || !email || !phone || !sourceRaw) {
      return res.status(400).json({ message: 'Name, email, phone, and source are required.' });
    }

    const dup = await Candidate.findOne({ email });
    if (dup) {
      return res.status(409).json({ message: 'A candidate with this email already exists.' });
    }

    const candidateType = body.type === 'experienced' ? 'experienced' : 'fresher';
    if (candidateType === 'experienced') {
      const exp = Number(body.exp);
      const company = String(body.company || '').trim();
      const salaryN = Number(body.salary);
      if (!exp || exp < 0 || !company || !salaryN || salaryN <= 0) {
        return res.status(400).json({
          message: 'For experienced candidates, experience (years), current company, and expected salary (LPA) are required.',
        });
      }
    }

    let skills = [];
    if (typeof body.skills === 'string' && body.skills.trim()) {
      skills = body.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const hrName = String(body.hr || '').trim() || (req.user && req.user.name) || '—';
    const expectedLpa = candidateType === 'experienced' ? Number(body.salary) || 0 : 0;
    const salaryStr =
      candidateType === 'experienced' && body.salary != null && String(body.salary).trim() !== ''
        ? `${body.salary} LPA`
        : '';

    const doc = await Candidate.create({
      name,
      email,
      phone,
      position: String(body.role || body.position || '').trim() || '—',
      candidateType,
      location: String(body.location || '').trim(),
      expYears: candidateType === 'experienced' ? Number(body.exp) || 0 : 0,
      expectedSalaryLpa: expectedLpa,
      currentCTCLpa: Number(body.currentCTC) || 0,
      companyName: String(body.company || '').trim(),
      prevRoles: String(body.prevRoles || '').trim(),
      salary: salaryStr,
      skills,
      degree: String(body.degree || '').trim(),
      college: String(body.college || '').trim(),
      graduationYear: String(body.year || '').trim(),
      source: normalizeSource(sourceRaw),
      refDetail: String(body.ref || '').trim(),
      pipelineStage: 'Screening',
      screening: 'Not Yet',
      technical: 'Not Yet',
      hrRound: 'Not Yet',
      resumeUrl: req.file ? `/api/uploads/resumes/${req.file.filename}` : '',
      resumeFilename: req.file ? req.file.originalname : '',
      recruiter: { name: hrName, initials: initialsFromName(hrName) },
    });

    res.status(201).json(doc.toJSON());
  } catch (err) {
    console.error('Candidate intake error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A candidate with this email already exists.' });
    }
    res.status(500).json({ message: err.message || 'Failed to create candidate' });
  }
});

const INTAKE_BULK_MAX = 500;

/** POST /api/candidates/intake/bulk — JSON rows with candidateType "fresher" | "experienced" (per row or from upload mode on client) */
router.post('/intake/bulk', async (req, res) => {
  try {
    const { candidates: raw } = req.body || {};
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ message: 'Body must include candidates array with at least one item' });
    }
    if (raw.length > INTAKE_BULK_MAX) {
      return res.status(400).json({ message: `Maximum ${INTAKE_BULK_MAX} rows per upload` });
    }

    const hrDefault = (req.user && req.user.name) || '—';
    const inserted = [];
    const errors = [];

    for (let i = 0; i < raw.length; i++) {
      const row = raw[i] || {};
      const name = String(row.name || '').trim();
      const email = String(row.email || '').toLowerCase().trim();
      const phone = String(row.phone || '').trim();
      const sourceRaw = String(row.source || '').trim();
      const rowLabel = email || name || `row ${i + 2}`;

      if (!name || !email || !phone || !sourceRaw) {
        errors.push({ row: i + 2, email: rowLabel, reason: 'Missing name, email, phone, or source' });
        continue;
      }

      const typeStr = String(row.candidateType || row.type || 'fresher').toLowerCase();
      const isExperienced = typeStr === 'experienced';

      let expYears = 0;
      let companyName = '';
      let expectedSalaryLpa = 0;
      let currentCTCLpa = 0;
      let prevRoles = '';
      let salaryStr = '';

      if (isExperienced) {
        expYears = Number(row.exp != null ? row.exp : row.expYears);
        companyName = String(row.company || row.companyName || '').trim();
        expectedSalaryLpa = Number(row.salary != null ? row.salary : row.expectedSalaryLpa);
        if (!expYears || expYears < 0 || !companyName || !expectedSalaryLpa || expectedSalaryLpa <= 0) {
          errors.push({
            row: i + 2,
            email,
            reason: 'Experienced row needs experience (years), current company, and expected salary (LPA)',
          });
          continue;
        }
        currentCTCLpa = Number(row.currentCTC != null ? row.currentCTC : row.currentCTCLpa) || 0;
        prevRoles = String(row.prevRoles || '').trim();
        salaryStr = `${row.salary != null ? row.salary : expectedSalaryLpa} LPA`;
      }

      const dup = await Candidate.findOne({ email });
      if (dup) {
        errors.push({ row: i + 2, email, reason: 'Duplicate email' });
        continue;
      }

      let skills = [];
      if (Array.isArray(row.skills)) {
        skills = row.skills.map((s) => String(s).trim()).filter(Boolean);
      } else if (typeof row.skills === 'string' && row.skills.trim()) {
        skills = row.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const hrName = String(row.hr || '').trim() || hrDefault;

      try {
        const doc = await Candidate.create({
          name,
          email,
          phone,
          position: String(row.role || row.position || '').trim() || '—',
          candidateType: isExperienced ? 'experienced' : 'fresher',
          location: String(row.location || '').trim(),
          expYears: isExperienced ? expYears : 0,
          expectedSalaryLpa: isExperienced ? expectedSalaryLpa : 0,
          currentCTCLpa: isExperienced ? currentCTCLpa : 0,
          companyName: isExperienced ? companyName : '',
          prevRoles: isExperienced ? prevRoles : '',
          salary: isExperienced ? salaryStr : '',
          skills,
          degree: String(row.degree || '').trim(),
          college: String(row.college || '').trim(),
          graduationYear: String(row.year || row.graduationYear || '').trim(),
          source: normalizeSource(sourceRaw),
          refDetail: String(row.ref || row.refDetail || '').trim(),
          pipelineStage: 'Screening',
          screening: 'Not Yet',
          technical: 'Not Yet',
          hrRound: 'Not Yet',
          recruiter: { name: hrName, initials: initialsFromName(hrName) },
        });
        inserted.push(doc.toJSON());
      } catch (e) {
        if (e.code === 11000) {
          errors.push({ row: i + 2, email, reason: 'Duplicate email' });
        } else {
          errors.push({ row: i + 2, email: rowLabel, reason: e.message || 'Insert failed' });
        }
      }
    }

    res.status(201).json({
      created: inserted.length,
      skipped: errors.length,
      candidates: inserted,
      errors: errors.slice(0, 100),
    });
  } catch (err) {
    console.error('Intake bulk error:', err);
    res.status(500).json({ message: err.message || 'Failed to import candidates' });
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
      pipelineStage: c.pipelineStage && PIPELINE_STAGES.includes(c.pipelineStage) ? c.pipelineStage : 'Screening',
    }));
    const inserted = await Candidate.insertMany(toInsert);
    const withId = inserted.map((doc) => doc.toJSON());
    res.status(201).json({ candidates: withId, count: withId.length });
  } catch (err) {
    console.error('Candidates bulk create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create candidates' });
  }
});

/** PATCH /api/candidates/:id/stage — move kanban pipeline stage */
router.patch('/:id/stage', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    const { stage } = req.body || {};
    if (!PIPELINE_STAGES.includes(stage)) {
      return res.status(400).json({ message: 'Invalid pipeline stage.' });
    }
    const doc = await Candidate.findByIdAndUpdate(
      req.params.id,
      { $set: { pipelineStage: stage } },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Candidate not found' });
    res.json(doc.toJSON());
  } catch (err) {
    console.error('Candidate stage update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update stage' });
  }
});

/** GET /api/candidates/:id — single candidate */
router.get('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    const doc = await Candidate.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Candidate not found' });
    res.json(leanToClient(doc));
  } catch (err) {
    console.error('Candidate get error:', err);
    res.status(500).json({ message: 'Failed to fetch candidate' });
  }
});

/** POST /api/candidates — create single candidate (JSON) */
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
      email: body.email ?? '',
      phone: body.phone ?? '',
      candidateType: body.candidateType === 'experienced' ? 'experienced' : 'fresher',
      location: body.location ?? '',
      expYears: body.expYears != null ? Number(body.expYears) : 0,
      expectedSalaryLpa: body.expectedSalaryLpa != null ? Number(body.expectedSalaryLpa) : 0,
      currentCTCLpa: body.currentCTCLpa != null ? Number(body.currentCTCLpa) : 0,
      companyName: body.companyName ?? '',
      prevRoles: body.prevRoles ?? '',
      skills: Array.isArray(body.skills) ? body.skills : [],
      degree: body.degree ?? '',
      college: body.college ?? '',
      graduationYear: body.graduationYear ?? '',
      source: body.source != null ? String(body.source) : '',
      refDetail: body.refDetail ?? '',
      pipelineStage:
        body.pipelineStage && PIPELINE_STAGES.includes(body.pipelineStage) ? body.pipelineStage : 'Screening',
      resumeUrl: body.resumeUrl ?? '',
      resumeFilename: body.resumeFilename ?? '',
    });
    res.status(201).json(doc.toJSON());
  } catch (err) {
    console.error('Candidate create error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A candidate with this email already exists.' });
    }
    res.status(500).json({ message: err.message || 'Failed to create candidate' });
  }
});

/** PUT /api/candidates/:id — update single candidate */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    const body = req.body || {};
    const set = {};
    const assign = (key, val) => {
      if (val !== undefined) set[key] = val;
    };
    assign('name', body.name);
    assign('note', body.note);
    assign('position', body.position);
    assign('dept', body.dept);
    assign('interviewDate', body.interviewDate);
    assign('came', body.came);
    assign('screening', body.screening);
    assign('technical', body.technical);
    assign('hrRound', body.hrRound);
    assign('offer', body.offer);
    assign('salary', body.salary);
    assign('onboarding', body.onboarding);
    assign('joiningDate', body.joiningDate);
    assign('referredBy', body.referredBy);
    assign('recruiter', body.recruiter);
    assign('email', body.email);
    assign('phone', body.phone);
    if (body.candidateType === 'fresher' || body.candidateType === 'experienced') assign('candidateType', body.candidateType);
    assign('location', body.location);
    if (body.expYears !== undefined) set.expYears = Number(body.expYears) || 0;
    if (body.expectedSalaryLpa !== undefined) set.expectedSalaryLpa = Number(body.expectedSalaryLpa) || 0;
    if (body.currentCTCLpa !== undefined) set.currentCTCLpa = Number(body.currentCTCLpa) || 0;
    assign('companyName', body.companyName);
    assign('prevRoles', body.prevRoles);
    if (body.skills !== undefined) set.skills = Array.isArray(body.skills) ? body.skills : [];
    assign('degree', body.degree);
    assign('college', body.college);
    assign('graduationYear', body.graduationYear);
    assign('source', body.source);
    assign('refDetail', body.refDetail);
    if (body.pipelineStage !== undefined && PIPELINE_STAGES.includes(body.pipelineStage)) {
      set.pipelineStage = body.pipelineStage;
    }
    assign('resumeUrl', body.resumeUrl);
    assign('resumeFilename', body.resumeFilename);

    const doc = await Candidate.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: 'Candidate not found' });
    res.json(doc.toJSON());
  } catch (err) {
    console.error('Candidate update error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'A candidate with this email already exists.' });
    }
    res.status(500).json({ message: err.message || 'Failed to update candidate' });
  }
});

/** DELETE /api/candidates/:id — delete single candidate */
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Candidate not found' });
    }
    const doc = await Candidate.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Candidate not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Candidate delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete candidate' });
  }
});

module.exports = router;
