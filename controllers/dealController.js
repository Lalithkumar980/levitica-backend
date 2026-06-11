const Deal = require('../models/Deal');
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const mongoose = require('mongoose');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');
const { toCSV } = require('../utils/csvExport');

const STAGE_ORDER = ['Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const DEAL_EXPORT_HEADERS = ['title', 'company', 'amount', 'stage', 'prob', 'product', 'source', 'industry', 'city', 'closeDate', 'ownerName', 'createdAt'];

function mapDealVirtuals(deal) {
  if (!deal) return deal;
  const createdAt = deal.createdAt || deal.created_at;
  const ageDays = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000) : 0;
  return {
    ...deal,
    id: deal._id ? deal._id.toString() : undefined,
    created_at: createdAt,
    updated_at: deal.updatedAt || deal.updated_at,
    deal_age_days: ageDays,
  };
}

function buildDealFilter(req) {
  const filter = scopeQueryByRole(req, { isDeleted: { $ne: true } });
  if (req.query.stage) {
    const stageMap = {
      qualified: 'Qualified',
      Qualified: 'Qualified',
      meeting: 'Proposal',
      proposal: 'Proposal',
      Proposal: 'Proposal',
      negotiation: 'Negotiation',
      Negotiation: 'Negotiation',
      won: 'Won',
      Won: 'Won',
      lost: 'Lost',
      Lost: 'Lost',
    };
    filter.stage = stageMap[req.query.stage] || req.query.stage;
  }
  if (req.query.owner) filter.owner = req.query.owner;
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    filter.$or = [
      { title: new RegExp(q, 'i') },
      { name: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
      { product: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

async function exportCsv(req, res) {
  try {
    const filter = buildDealFilter(req);
    const deals = await Deal.find(filter)
      .populate('owner', 'name')
      .populate('company_id')
      .populate('contact_id')
      .sort({ createdAt: -1 })
      .lean();
    const docs = deals.map((d) => mapDealVirtuals({ ...d, ownerName: d.owner?.name ?? '' }));
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
    const list = await Deal.find(filter)
      .populate('owner', 'name')
      .populate('company_id')
      .populate('contact_id')
      .populate('source_lead_id')
      .sort({ createdAt: -1 })
      .lean();
    const byStage = {};
    STAGE_ORDER.forEach((s) => (byStage[s] = []));
    list.forEach((d) => {
      const stageMap = {
        qualified: 'Qualified',
        Qualified: 'Qualified',
        meeting: 'Proposal',
        proposal: 'Proposal',
        Proposal: 'Proposal',
        negotiation: 'Negotiation',
        Negotiation: 'Negotiation',
        won: 'Won',
        Won: 'Won',
        lost: 'Lost',
        Lost: 'Lost',
      };
      const normStage = stageMap[d.stage] || d.stage;
      if (byStage[normStage]) {
        byStage[normStage].push(mapDealVirtuals(d));
      } else {
        byStage['Qualified'].push(mapDealVirtuals(d));
      }
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
      Deal.find(filter)
        .populate('owner', 'name email')
        .populate('owner_id', 'name email')
        .populate('company_id')
        .populate('contact_id')
        .populate('source_lead_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Deal.countDocuments(filter),
    ]);
    res.json({ deals: deals.map(mapDealVirtuals), total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Deals list error:', err);
    res.status(500).json({ message: 'Failed to fetch deals' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const stage = body.stage || 'Proposal';
    const autoProbability = body.prob != null ? body.prob : Deal.getProbabilityForStage(stage);
    const payload = ensureOwnerForCreate(req, {
      title: body.title || body.name,
      company: body.company,
      companyId: body.companyId || body.company_id,
      contactId: body.contactId || body.contact_id,
      amount: body.amount != null ? body.amount : (body.value != null ? body.value : 0),
      stage,
      prob: autoProbability,
      product: body.product,
      owner: body.owner || body.owner_id,
      source: body.source,
      industry: body.industry,
      city: body.city,
      closeDate: body.closeDate || body.expected_close_date,
      followup: body.followup,
      lastAct: body.lastAct || body.last_contacted_at || new Date(),
      notes: body.notes,
      activities: body.activities,
      files: body.files,

      name: body.name || body.title,
      source_lead_id: body.source_lead_id || body.sourceLeadId,
      sourceLeadId: body.sourceLeadId || body.source_lead_id,
      company_id: body.company_id || body.companyId,
      contact_id: body.contact_id || body.contactId,
      contact: body.contact,
      value: body.value != null ? body.value : (body.amount != null ? body.amount : 0),
      heat: body.heat || body.heatLevel || 'Warm',
      heatLevel: body.heatLevel || body.heat || 'Warm',
      expected_close_date: body.expected_close_date || body.closeDate,
      owner_id: body.owner_id || body.owner,
      last_contacted_at: body.last_contacted_at || body.lastAct || new Date(),
      lost_reason: body.lost_reason,
    });
    if (!payload.owner) payload.owner = req.user._id;
    if (!payload.owner_id) payload.owner_id = req.user._id;
    const doc = await Deal.create(payload);
    if (doc.company_id) {
      await Company.findByIdAndUpdate(doc.company_id, { $addToSet: { deals: doc._id } });
    }
    const populated = await Deal.findById(doc._id)
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .populate('contact_id')
      .populate('source_lead_id')
      .lean();
    res.status(201).json({ message: 'Deal created', deal: mapDealVirtuals(populated) });
  } catch (err) {
    console.error('Deal create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create deal' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Deal.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .populate('contact_id')
      .populate('source_lead_id')
      .populate('activities')
      .populate('files')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this deal' });
    res.json({ deal: mapDealVirtuals(doc) });
  } catch (err) {
    console.error('Deal get error:', err);
    res.status(500).json({ message: 'Failed to fetch deal' });
  }
}

async function update(req, res) {
  try {
    const doc = await Deal.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this deal' });
    const body = req.body || {};
    const allowed = [
      'title', 'company', 'companyId', 'contactId', 'amount', 'stage', 'prob', 'product', 'owner', 'source', 'industry', 'city', 'closeDate', 'followup', 'notes', 'activities', 'files',
      'name', 'source_lead_id', 'sourceLeadId', 'company_id', 'contact_id', 'contact', 'value', 'heat', 'heatLevel', 'expected_close_date', 'owner_id', 'last_contacted_at', 'lost_reason'
    ];
    const oldCompanyId = doc.company_id || doc.companyId;
    let stageChanged = false;
    allowed.forEach((key) => {
      if (body[key] !== undefined) {
        if (key === 'stage' && body.stage !== doc.stage) stageChanged = true;
        doc[key] = body[key];
      }
    });
    if (stageChanged && body.prob === undefined) {
      doc.prob = Deal.getProbabilityForStage(doc.stage);
    }
    doc.lastAct = new Date();
    doc.last_contacted_at = new Date();
    if (isRep(req)) {
      doc.owner = req.user._id;
      doc.owner_id = req.user._id;
    }
    await doc.save();
    const newCompanyId = doc.company_id || doc.companyId;
    if (String(oldCompanyId) !== String(newCompanyId)) {
      if (oldCompanyId) {
        await Company.findByIdAndUpdate(oldCompanyId, { $pull: { deals: doc._id } });
      }
      if (newCompanyId) {
        await Company.findByIdAndUpdate(newCompanyId, { $addToSet: { deals: doc._id } });
      }
    }
    const populated = await Deal.findById(doc._id)
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .populate('contact_id')
      .populate('source_lead_id')
      .populate('activities')
      .populate('files')
      .lean();
    res.json({ message: 'Deal updated', deal: mapDealVirtuals(populated) });
  } catch (err) {
    console.error('Deal update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update deal' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Deal.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Deal not found' });

    const contactId = doc.contact_id || doc.contactId;
    if (contactId) {
      await Contact.findByIdAndDelete(contactId);
    }

    const compId = doc.company_id || doc.companyId;
    if (compId) {
      await Company.findByIdAndDelete(compId);
    }

    // Delete related tasks and activities cleanly (avoiding empty $or matching undefined/null fields)
    await Task.deleteMany({ dealId: doc._id });
    await Activity.deleteMany({ dealId: doc._id });
    if (contactId) {
      await Task.deleteMany({ contactId });
      await Activity.deleteMany({ contactId });
    }

    // Revert status of any associated lead to 'New' and clear the dealId reference
    await Lead.updateMany({ dealId: doc._id }, { $set: { status: 'New' }, $unset: { dealId: 1 } });

    doc.isDeleted = true;
    await doc.save();
    res.json({ message: 'Deal deleted', id: doc._id });
  } catch (err) {
    console.error('Deal delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete deal' });
  }
}

async function updateStage(req, res) {
  try {
    const doc = await Deal.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this deal' });
    const { stage, reason } = req.body || {};
    if (!stage) return res.status(400).json({ message: 'Stage is required' });

    const stageMap = {
      qualified: 'Qualified',
      Qualified: 'Qualified',
      meeting: 'Proposal',
      proposal: 'Proposal',
      Proposal: 'Proposal',
      negotiation: 'Negotiation',
      Negotiation: 'Negotiation',
      won: 'Won',
      Won: 'Won',
      lost: 'Lost',
      Lost: 'Lost',
    };
    const targetStage = stageMap[stage] || stage;

    if ((targetStage === 'Won' || targetStage === 'Lost') && !reason?.trim()) {
      return res.status(400).json({ message: `A reason is required when transitioning to ${targetStage}.` });
    }

    const oldStage = doc.stage;
    doc.stage = targetStage;
    doc.prob = Deal.getProbabilityForStage(targetStage);
    if (targetStage === 'Lost') {
      doc.lost_reason = reason;
    }
    doc.lastAct = new Date();
    doc.last_contacted_at = new Date();
    await doc.save();

    try {
      const Activity = mongoose.model('Activity');
      const act = await Activity.create({
        type: 'Note',
        subject: `Stage updated to ${targetStage}`,
        notes: reason ? `Reason: ${reason}` : `Moved deal from ${oldStage} to ${targetStage}.`,
        date: new Date(),
        company: doc.company,
        rep: req.user._id,
        dealId: doc._id,
      });
      await Deal.findByIdAndUpdate(doc._id, { $addToSet: { activities: act._id } });
    } catch (actErr) {
      console.error('Failed to log stage change activity:', actErr);
    }

    const populated = await Deal.findById(doc._id)
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .populate('contact_id')
      .populate('source_lead_id')
      .lean();

    res.json({ message: 'Deal stage updated', deal: mapDealVirtuals(populated) });
  } catch (err) {
    console.error('Update deal stage error:', err);
    res.status(500).json({ message: err.message || 'Failed to update deal stage' });
  }
}

async function logActivity(req, res) {
  try {
    const deal = await Deal.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!deal) return res.status(404).json({ message: 'Deal not found' });
    if (!canEditRecord(req, deal)) return res.status(403).json({ message: 'Access denied to this deal' });
    
    const body = req.body || {};
    const Activity = mongoose.model('Activity');
    
    const activity = await Activity.create({
      type: body.type || 'Note',
      subject: body.subject || `Outreach for deal: ${deal.title}`,
      notes: body.notes || '',
      date: body.date || new Date(),
      duration: body.duration,
      outcome: body.outcome,
      company: deal.company,
      rep: req.user._id,
      dealId: deal._id,
      contactId: deal.contact_id || deal.contactId,
      followupDate: body.followupDate,
      followupType: body.followupType,
    });
    
    await Deal.findByIdAndUpdate(deal._id, {
      $addToSet: { activities: activity._id },
      lastAct: activity.date,
      last_contacted_at: activity.date
    });
    
    res.status(201).json({ message: 'Activity logged', activity });
  } catch (err) {
    console.error('Log deal activity error:', err);
    res.status(500).json({ message: err.message || 'Failed to log activity' });
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
  updateStage,
  logActivity,
  STAGE_ORDER,
};
