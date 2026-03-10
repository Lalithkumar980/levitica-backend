const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');
const { toCSV } = require('../utils/csvExport');

const LEAD_EXPORT_HEADERS = [
  'fname', 'lname', 'company', 'phone', 'email', 'industry', 'city', 'country',
  'source', 'status', 'notes', 'createdAt',
];

async function exportCsv(req, res) {
  try {
    const filter = scopeQueryByRole(req, {});
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.q && req.query.q.trim()) {
      const q = req.query.q.trim();
      filter.$or = [
        { fname: new RegExp(q, 'i') },
        { lname: new RegExp(q, 'i') },
        { company: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ];
    }
    const leads = await Lead.find(filter).sort({ createdAt: -1 }).lean();
    const csvContent = toCSV(leads, LEAD_EXPORT_HEADERS);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    res.send(csvContent);
  } catch (err) {
    console.error('Leads export error:', err);
    res.status(500).json({ message: 'Export failed' });
  }
}

async function list(req, res) {
  try {
    const filter = scopeQueryByRole(req, {});
    if (req.query.q && req.query.q.trim()) {
      const q = req.query.q.trim();
      filter.$or = [
        { fname: new RegExp(q, 'i') },
        { lname: new RegExp(q, 'i') },
        { company: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [leads, total] = await Promise.all([
      Lead.find(filter).populate('owner', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Lead.countDocuments(filter),
    ]);
    res.json({ leads, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Leads list error:', err);
    res.status(500).json({ message: 'Failed to fetch leads' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      fname: body.fname, lname: body.lname, company: body.company, phone: body.phone, email: body.email,
      industry: body.industry, city: body.city, country: body.country, source: body.source,
      status: body.status, owner: body.owner, notes: body.notes,
    });
    const doc = await Lead.create(payload);
    res.status(201).json({ message: 'Lead created', lead: doc });
  } catch (err) {
    console.error('Lead create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create lead' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Lead.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this lead' });
    res.json({ lead: doc });
  } catch (err) {
    console.error('Lead get error:', err);
    res.status(500).json({ message: 'Failed to fetch lead' });
  }
}

async function update(req, res) {
  try {
    const doc = await Lead.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this lead' });
    const body = req.body || {};
    const allowed = ['fname', 'lname', 'company', 'phone', 'email', 'industry', 'city', 'country', 'source', 'status', 'notes', 'owner'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    res.json({ message: 'Lead updated', lead: doc });
  } catch (err) {
    console.error('Lead update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update lead' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Lead.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    res.json({ message: 'Lead deleted', id: doc._id });
  } catch (err) {
    console.error('Lead delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete lead' });
  }
}

async function convert(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, lead)) return res.status(403).json({ message: 'Access denied to this lead' });
    lead.status = 'Converted';
    await lead.save();
    const createDeal = req.body?.createDeal !== false;
    let deal = null;
    if (createDeal) {
      deal = await Deal.create({
        title: `Deal: ${lead.fname} ${lead.lname}${lead.company ? ` - ${lead.company}` : ''}`.trim(),
        company: lead.company || lead.fname + ' ' + lead.lname,
        amount: 0, stage: 'lead', prob: 10, owner: lead.owner,
        source: lead.source, industry: lead.industry, city: lead.city,
        notes: lead.notes ? `From lead: ${lead.notes}` : undefined,
        lastAct: new Date(),
      });
    }
    res.json({ message: 'Lead converted', lead, deal: deal || undefined });
  } catch (err) {
    console.error('Lead convert error:', err);
    res.status(500).json({ message: err.message || 'Failed to convert lead' });
  }
}

module.exports = {
  exportCsv,
  list,
  create,
  getOne,
  update,
  remove,
  convert,
};
