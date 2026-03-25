const Task = require('../models/Task');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');

const REP_FIELD = 'rep';

function buildTaskFilter(req) {
  const filter = scopeQueryByRole(req, {}, REP_FIELD);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    if (!filter.status) filter.status = { $ne: 'Completed' };
  }
  return filter;
}

async function list(req, res) {
  try {
    const filter = buildTaskFilter(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate('rep', 'name email')
        .populate('dealId', 'title company stage')
        .populate('contactId', 'fname lname company')
        .sort({ dueDate: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);
    res.json({ tasks, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Tasks list error:', err);
    res.status(500).json({ message: 'Failed to fetch tasks' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    if (!body.dueDate) return res.status(400).json({ message: 'dueDate is required' });
    const payload = ensureOwnerForCreate(req, {
      type: body.type || 'Task', subject: body.subject, dueDate: body.dueDate, priority: body.priority,
      status: body.status, rep: body.rep, dealId: body.dealId, contactId: body.contactId, company: body.company, notes: body.notes,
    }, REP_FIELD);
    if (!payload.rep) payload.rep = req.user._id;
    const doc = await Task.create(payload);
    const populated = await Task.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .populate('contactId', 'fname lname company')
      .lean();
    res.status(201).json({ message: 'Task created', task: populated });
  } catch (err) {
    console.error('Task create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create task' });
  }
}

async function complete(req, res) {
  try {
    const doc = await Task.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Task not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this task' });
    doc.status = 'Completed';
    await doc.save();
    const populated = await Task.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .populate('contactId', 'fname lname company')
      .lean();
    res.json({ message: 'Task completed', task: populated });
  } catch (err) {
    console.error('Task complete error:', err);
    res.status(500).json({ message: err.message || 'Failed to complete task' });
  }
}

async function update(req, res) {
  try {
    const doc = await Task.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Task not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this task' });
    const body = req.body || {};
    const allowed = ['type', 'subject', 'dueDate', 'priority', 'status', 'rep', 'dealId', 'contactId', 'company', 'notes'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.rep = req.user._id;
    await doc.save();
    const populated = await Task.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .populate('contactId', 'fname lname company')
      .lean();
    res.json({ message: 'Task updated', task: populated });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update task' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Task.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted', id: doc._id });
  } catch (err) {
    console.error('Task delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete task' });
  }
}

module.exports = { list, create, complete, update, remove };
