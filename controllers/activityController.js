const Activity = require('../models/Activity');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');

const REP_FIELD = 'rep';

function buildActivityFilter(req, extra = {}) {
  const filter = scopeQueryByRole(req, extra, REP_FIELD);
  if (req.query.type) filter.type = req.query.type;
  if (req.query.dealId) filter.dealId = req.query.dealId;
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    filter.$or = [
      { subject: new RegExp(q, 'i') },
      { notes: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

async function listCalls(req, res) {
  try {
    const filter = buildActivityFilter(req, { type: 'Call' });
    const list = await Activity.find(filter)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .sort({ date: -1 })
      .lean();
    res.json({ activities: list });
  } catch (err) {
    console.error('Activities calls error:', err);
    res.status(500).json({ message: 'Failed to fetch calls' });
  }
}

async function listEmails(req, res) {
  try {
    const filter = buildActivityFilter(req, { type: 'Email' });
    const list = await Activity.find(filter)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .sort({ date: -1 })
      .lean();
    res.json({ activities: list });
  } catch (err) {
    console.error('Activities emails error:', err);
    res.status(500).json({ message: 'Failed to fetch emails' });
  }
}

async function list(req, res) {
  try {
    const filter = buildActivityFilter(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      Activity.find(filter)
        .populate('rep', 'name email')
        .populate('dealId', 'title company stage')
        .populate('contactId', 'fname lname company')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(filter),
    ]);
    res.json({ activities, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Activities list error:', err);
    res.status(500).json({ message: 'Failed to fetch activities' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      type: body.type, subject: body.subject, notes: body.notes, date: body.date, duration: body.duration,
      outcome: body.outcome, company: body.company, recording: body.recording, rep: body.rep, dealId: body.dealId,
      contactId: body.contactId, followupDate: body.followupDate, followupType: body.followupType,
    }, REP_FIELD);
    const doc = await Activity.create(payload);
    const populated = await Activity.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .populate('contactId', 'fname lname company')
      .lean();
    res.status(201).json({ message: 'Activity created', activity: populated });
  } catch (err) {
    console.error('Activity create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create activity' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Activity.findById(req.params.id)
      .populate('rep', 'name')
      .populate('dealId')
      .populate('contactId')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this activity' });
    res.json({ activity: doc });
  } catch (err) {
    console.error('Activity get error:', err);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
}

async function update(req, res) {
  try {
    const doc = await Activity.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this activity' });
    const body = req.body || {};
    const allowed = ['type', 'subject', 'notes', 'date', 'duration', 'outcome', 'company', 'recording', 'rep', 'dealId', 'contactId', 'followupDate', 'followupType'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.rep = req.user._id;
    await doc.save();
    const populated = await Activity.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId')
      .populate('contactId')
      .lean();
    res.json({ message: 'Activity updated', activity: populated });
  } catch (err) {
    console.error('Activity update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update activity' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Activity.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    res.json({ message: 'Activity deleted', id: doc._id });
  } catch (err) {
    console.error('Activity delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete activity' });
  }
}

module.exports = {
  listCalls,
  listEmails,
  list,
  create,
  getOne,
  update,
  remove,
};
