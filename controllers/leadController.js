const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const User = require('../models/User');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');
const { toCSV } = require('../utils/csvExport');

const LEAD_EXPORT_HEADERS = [
  'fname', 'lname', 'company', 'phone', 'email', 'industry', 'city', 'country',
  'source', 'status', 'notes', 'createdAt',
];

function mapLeadVirtuals(lead) {
  if (!lead) return lead;
  return {
    ...lead,
    id: lead._id ? lead._id.toString() : undefined,
    created_at: lead.createdAt || lead.created_at,
    updated_at: lead.updatedAt || lead.updated_at,
  };
}

async function exportCsv(req, res) {
  try {
    const filter = scopeQueryByRole(req, { isDeleted: { $ne: true } });
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
    const filter = scopeQueryByRole(req, { isDeleted: { $ne: true } });
    if (req.query.q && req.query.q.trim()) {
      const q = req.query.q.trim();
      filter.$or = [
        { fname: new RegExp(q, 'i') },
        { lname: new RegExp(q, 'i') },
        { name: new RegExp(q, 'i') },
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
      Lead.find(filter)
        .populate('owner', 'name email')
        .populate('owner_id', 'name email')
        .populate('company_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);
    res.json({ leads: leads.map(mapLeadVirtuals), total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Leads list error:', err);
    res.status(500).json({ message: 'Failed to fetch leads' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      fname: body.fname, lname: body.lname, name: body.name, company: body.company, company_id: body.company_id, phone: body.phone, email: body.email,
      industry: body.industry, department: body.department, city: body.city, country: body.country, source: body.source,
      status: body.status, owner: body.owner || body.owner_id, owner_id: body.owner_id || body.owner, notes: body.notes,
      jobTitle: body.jobTitle, title: body.title, techStack: body.techStack, tech_stack: body.tech_stack,
      heatLevel: body.heatLevel, heat: body.heat,
      leadScore: body.leadScore, score: body.score, estimatedValue: body.estimatedValue, value: body.value,
      lastContacted: body.lastContacted, last_contacted_at: body.last_contacted_at,
    });
    if (!payload.owner) payload.owner = req.user._id;
    if (!payload.owner_id) payload.owner_id = req.user._id;
    const doc = await Lead.create(payload);
    const populated = await Lead.findById(doc._id)
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .lean();
    res.status(201).json({ message: 'Lead created', lead: mapLeadVirtuals(populated) });
  } catch (err) {
    console.error('Lead create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create lead' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Lead.findOne({ _id: req.params.id, isDeleted: { $ne: true } })
      .populate('company_id')
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this lead' });
    res.json({ lead: mapLeadVirtuals(doc) });
  } catch (err) {
    console.error('Lead get error:', err);
    res.status(500).json({ message: 'Failed to fetch lead' });
  }
}

async function update(req, res) {
  try {
    const doc = await Lead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this lead' });
    const body = req.body || {};
    
    // If status is being changed from Converted to something else, remove the associated deal and its tasks/activities/contact/company
    if (body.status !== undefined && body.status !== 'Converted' && doc.status === 'Converted' && doc.dealId) {
      try {
        const deal = await Deal.findById(doc.dealId);
        if (deal) {
          const contactId = deal.contact_id || deal.contactId;
          const compId = deal.company_id || deal.companyId;
          if (contactId) {
            await Contact.findByIdAndDelete(contactId);
          }
          if (compId) {
            await Company.findByIdAndDelete(compId);
          }
          await Task.deleteMany({ dealId: deal._id });
          await Activity.deleteMany({ dealId: deal._id });
          if (contactId) {
            await Task.deleteMany({ contactId });
            await Activity.deleteMany({ contactId });
          }
          await Deal.findByIdAndDelete(deal._id);
        }
      } catch (err) {
        console.error('Failed to auto-delete deal on status revert:', err);
      }
      doc.dealId = undefined;
    }

    const allowed = [
      'fname', 'lname', 'name', 'company', 'company_id', 'phone', 'email', 'industry', 'department', 'city', 'country', 'source', 'status', 'notes', 'owner', 'owner_id',
      'jobTitle', 'title', 'techStack', 'tech_stack', 'heatLevel', 'heat', 'leadScore', 'score', 'estimatedValue', 'value', 'lastContacted', 'last_contacted_at'
    ];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    const populated = await Lead.findById(doc._id)
      .populate('owner', 'name email')
      .populate('owner_id', 'name email')
      .populate('company_id')
      .lean();
    res.json({ message: 'Lead updated', lead: mapLeadVirtuals(populated) });
  } catch (err) {
    console.error('Lead update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update lead' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Lead.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Lead not found' });
    
    // Also soft-delete the associated deal and cleanup tasks/activities/contact/company if deleted lead was converted
    if (doc.dealId) {
      try {
        const deal = await Deal.findById(doc.dealId);
        if (deal) {
          const contactId = deal.contact_id || deal.contactId;
          const compId = deal.company_id || deal.companyId;
          if (contactId) {
            await Contact.findByIdAndDelete(contactId);
          }
          if (compId) {
            await Company.findByIdAndDelete(compId);
          }
          await Task.deleteMany({ dealId: deal._id });
          await Activity.deleteMany({ dealId: deal._id });
          if (contactId) {
            await Task.deleteMany({ contactId });
            await Activity.deleteMany({ contactId });
          }
          deal.isDeleted = true;
          await deal.save();
        }
      } catch (err) {
        console.error('Failed to auto-soft-delete deal on lead deletion:', err);
      }
    }
    
    doc.isDeleted = true;
    await doc.save();
    res.json({ message: 'Lead deleted', id: doc._id });
  } catch (err) {
    console.error('Lead delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete lead' });
  }
}

async function convert(req, res) {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    if (!canEditRecord(req, lead)) return res.status(403).json({ message: 'Access denied to this lead' });
    const createDeal = req.body?.createDeal !== false;
    let deal = null;
    if (createDeal) {
      const body = req.body || {};
      const contactEmail = lead.email || `unknown-${lead._id}@example.com`;
      const ownerId = lead.owner || lead.owner_id || req.user._id;

      let contactDoc = await Contact.findOne({ company_id: lead.company_id, email: contactEmail });
      if (!contactDoc) {
        contactDoc = await Contact.create({
          fname: lead.fname,
          lname: lead.lname,
          name: lead.name,
          email: contactEmail,
          phone: lead.phone || '0000000000',
          company: lead.company,
          company_id: lead.company_id,
          companyId: lead.company_id,
          owner: ownerId,
          owner_id: ownerId,
          source: lead.source,
          status: 'Prospect',
          type: 'Prospect',
          department: lead.department || undefined,
        });
      } else if (!contactDoc.department && lead.department) {
        contactDoc.department = lead.department;
        await contactDoc.save();
      }

      deal = await Deal.create({
        title: (body.title || `Deal: ${lead.fname} ${lead.lname}${lead.company ? ` - ${lead.company}` : ''}`).trim(),
        name: (body.title || `Deal: ${lead.fname} ${lead.lname}${lead.company ? ` - ${lead.company}` : ''}`).trim(),
        company: lead.company || `${lead.fname} ${lead.lname}`,
        company_id: lead.company_id,
        companyId: lead.company_id,
        contact_id: contactDoc._id,
        contactId: contactDoc._id,
        contact: [contactDoc.fname, contactDoc.lname].filter(Boolean).join(' '),
        amount: body.amount != null ? Number(body.amount) : 0,
        value: body.amount != null ? Number(body.amount) : 0,
        stage: body.stage || 'qualified',
        prob: Deal.getProbabilityForStage(body.stage || 'qualified'),
        product: body.product || undefined,
        owner: ownerId,
        owner_id: ownerId,
        source: lead.source,
        source_lead_id: lead._id,
        sourceLeadId: lead._id,
        industry: lead.industry,
        city: lead.city,
        closeDate: body.closeDate || undefined,
        followup: body.followup || undefined,
        notes: body.notes || (lead.notes ? `From lead: ${lead.notes}` : undefined),
        lastAct: new Date(),
      });

      if (deal.company_id) {
        await Company.findByIdAndUpdate(deal.company_id, { $addToSet: { deals: deal._id } });
      }
      if (contactDoc.company_id) {
        await Company.findByIdAndUpdate(contactDoc.company_id, { $addToSet: { contacts: contactDoc._id } });
      }
    }
    lead.status = 'Converted';
    if (deal) lead.dealId = deal._id;
    await lead.save();
    res.json({ message: 'Lead promoted to Deal', lead, deal: deal || undefined });
  } catch (err) {
    console.error('Lead convert error:', err);
    res.status(500).json({ message: err.message || 'Failed to convert lead' });
  }
}

async function promote(req, res) {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const isManagerOrAdmin = req.user.role === 'Admin' || req.user.role === 'Sales Manager';

    // • 409 — Lead already promoted (deal_id already exists)
    if (lead.dealId || lead.status === 'Converted') {
      return res.status(409).json({ message: 'Lead already promoted' });
    }

    // • 400 — Lead status is not 'Interested' and caller is not Manager/Admin
    if (lead.status !== 'Interested' && !isManagerOrAdmin) {
      return res.status(400).json({ message: "Lead status is not 'Interested' and caller is not Manager/Admin" });
    }

    // • 403 — Caller does not own this lead and is not Manager/Admin
    const ownsLead = String(lead.owner) === String(req.user._id) || String(lead.owner_id) === String(req.user._id);
    if (!ownsLead && !isManagerOrAdmin) {
      return res.status(403).json({ message: 'Caller does not own this lead and is not Manager/Admin' });
    }

    const body = req.body || {};
    
    // Expected Close Date
    const expectedCloseDate = body.expected_close_date || body.expectedCloseDate || undefined;

    // Owner ID (use body.owner_id or fall back to lead's owner, then caller's ID)
    const targetOwnerId = body.owner_id || lead.owner_id || lead.owner || req.user._id;
    
    // Retrieve target owner user to get their name
    const targetOwner = await User.findById(targetOwnerId);
    if (!targetOwner) {
      return res.status(400).json({ message: 'Invalid owner_id' });
    }

    // Format the deal name: "Nexus Cloud – Arjun Kapoor – Jun 2026"
    const companyName = lead.company || `${lead.fname} ${lead.lname}`;
    const ownerName = targetOwner.name || targetOwner.email;
    const dateObj = new Date();
    const formattedMonthYear = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const dealName = `${companyName} – ${ownerName} – ${formattedMonthYear}`;

    // Get or Create Contact
    const contactEmail = lead.email || `unknown-${lead._id}@example.com`;
    let contactDoc = await Contact.findOne({ company_id: lead.company_id, email: contactEmail });
    if (!contactDoc) {
      contactDoc = await Contact.create({
        fname: lead.fname,
        lname: lead.lname,
        name: lead.name,
        email: contactEmail,
        phone: lead.phone || '0000000000',
        company: lead.company,
        company_id: lead.company_id,
        companyId: lead.company_id,
        owner: targetOwnerId,
        owner_id: targetOwnerId,
        source: lead.source,
        status: 'Prospect',
        type: 'Prospect',
        department: lead.department || undefined,
      });
    } else if (!contactDoc.department && lead.department) {
      contactDoc.department = lead.department;
      await contactDoc.save();
    }

    // Create the Deal
    const deal = await Deal.create({
      title: dealName,
      name: dealName,
      company: companyName,
      company_id: lead.company_id,
      companyId: lead.company_id,
      contact_id: contactDoc._id,
      contactId: contactDoc._id,
      contact: [contactDoc.fname, contactDoc.lname].filter(Boolean).join(' '),
      amount: lead.estimatedValue || lead.value || 0,
      value: lead.estimatedValue || lead.value || 0,
      stage: 'Qualified',
      prob: Deal.getProbabilityForStage('Qualified'),
      product: undefined,
      owner: targetOwnerId,
      owner_id: targetOwnerId,
      source: lead.source,
      source_lead_id: lead._id,
      sourceLeadId: lead._id,
      industry: lead.industry,
      city: lead.city,
      closeDate: expectedCloseDate,
      expected_close_date: expectedCloseDate,
      notes: lead.notes ? `From lead: ${lead.notes}` : undefined,
      lastAct: new Date(),
    });

    if (deal.company_id) {
      await Company.findByIdAndUpdate(deal.company_id, { $addToSet: { deals: deal._id } });
    }
    if (contactDoc.company_id) {
      await Company.findByIdAndUpdate(contactDoc.company_id, { $addToSet: { contacts: contactDoc._id } });
    }

    // Update Lead status to 'Converted' and save Deal ID
    lead.status = 'Converted';
    lead.dealId = deal._id;
    await lead.save();

    // Success response 201:
    res.status(201).json({
      deal_id: deal._id.toString(),
      deal_name: deal.title,
      stage: deal.stage,
    });

  } catch (err) {
    console.error('Lead promote error:', err);
    res.status(500).json({ message: err.message || 'Failed to promote lead' });
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
  promote,
};
