const Deal = require('../models/Deal');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');
const { toCSV } = require('../utils/csvExport');

const STAGE_ORDER = ['lead', 'contacted', 'qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const DEAL_EXPORT_HEADERS = ['title', 'company', 'amount', 'stage', 'prob', 'product', 'source', 'industry', 'city', 'closeDate', 'ownerName', 'createdAt'];

function buildDealFilter(req) {
  const filter = scopeQueryByRole(req, {});
  if (req.query.stage) filter.stage = req.query.stage;
  if (req.query.owner) filter.owner = req.query.owner;
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    filter.$or = [
      { title: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
      { product: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

async function exportCsv(req, res) {
  try {
    const filter = buildDealFilter(req);
    const deals = await Deal.find(filter).populate('owner', 'name').sort({ createdAt: -1 }).lean();
    const docs = deals.map((d) => ({ ...d, ownerName: d.owner?.name ?? '' }));
    const csvContent = toCSV(docs, DEAL_EXPORT_HEADERS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=deals.csv');
    res.send(csvContent);
  } catch (err) {
    console.error('Deals export error:', err);
    res.status(500).json({ message: 'Export failed' });
  }
}

async function kanban(req, res) {
  try {
    const filter = buildDealFilter(req);
    const list = await Deal.find(filter).populate('owner', 'name').sort({ createdAt: -1 }).lean();
    const byStage = {};
    STAGE_ORDER.forEach((s) => (byStage[s] = []));
    list.forEach((d) => {
      if (byStage[d.stage]) byStage[d.stage].push(d);
      else byStage[d.stage] = [d];
    });
    res.json({ stages: STAGE_ORDER.map((stage) => ({ stage, deals: byStage[stage] })) });
  } catch (err) {
    console.error('Deals kanban error:', err);
    res.status(500).json({ message: 'Failed to fetch deals' });
  }
}

async function list(req, res) {
  try {
    const filter = buildDealFilter(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [deals, total] = await Promise.all([
      Deal.find(filter).populate('owner', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Deal.countDocuments(filter),
    ]);
    res.json({ deals, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Deals list error:', err);
    res.status(500).json({ message: 'Failed to fetch deals' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const stage = body.stage || 'lead';
    const autoProbability = body.prob != null ? body.prob : Deal.getProbabilityForStage(stage);
    const payload = ensureOwnerForCreate(req, {
      title: body.title, company: body.company, companyId: body.companyId, contactId: body.contactId,
      amount: body.amount != null ? body.amount : 0, stage, prob: autoProbability, product: body.product,
      owner: body.owner, source: body.source, industry: body.industry, city: body.city,
      closeDate: body.closeDate, followup: body.followup, lastAct: new Date(), notes: body.notes,
      activities: body.activities, files: body.files,
    });
    const doc = await Deal.create(payload);
    const populated = await Deal.findById(doc._id).populate('owner', 'name email').lean();
    res.status(201).json({ message: 'Deal created', deal: populated });
  } catch (err) {
    console.error('Deal create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create deal' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Deal.findById(req.params.id)
      .populate('owner', 'name')
      .populate('contactId')
      .populate('activities')
      .populate('files')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this deal' });
    res.json({ deal: doc });
  } catch (err) {
    console.error('Deal get error:', err);
    res.status(500).json({ message: 'Failed to fetch deal' });
  }
}

async function update(req, res) {
  try {
    const doc = await Deal.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this deal' });
    const body = req.body || {};
    const allowed = ['title', 'company', 'companyId', 'contactId', 'amount', 'stage', 'product', 'owner', 'source', 'industry', 'city', 'closeDate', 'followup', 'notes', 'activities', 'files'];
    let stageChanged = false;
    allowed.forEach((key) => {
      if (body[key] !== undefined) {
        if (key === 'stage' && body.stage !== doc.stage) stageChanged = true;
        doc[key] = body[key];
      }
    });
    if (stageChanged) doc.prob = Deal.getProbabilityForStage(doc.stage);
    doc.lastAct = new Date();
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    const populated = await Deal.findById(doc._id)
      .populate('owner', 'name')
      .populate('contactId')
      .populate('activities')
      .populate('files')
      .lean();
    res.json({ message: 'Deal updated', deal: populated });
  } catch (err) {
    console.error('Deal update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update deal' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Deal.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    res.json({ message: 'Deal deleted', id: doc._id });
  } catch (err) {
    console.error('Deal delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete deal' });
  }
}

module.exports = {
  exportCsv,
  kanban,
  list,
  create,
  getOne,
  update,
  remove,
  STAGE_ORDER,
};
