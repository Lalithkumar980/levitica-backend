const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Company = require('../models/Company');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');

function mapContactVirtuals(contact, dealCountsMap = {}) {
  if (!contact) return contact;
  const count = dealCountsMap[contact._id.toString()] || 0;
  return {
    ...contact,
    id: contact._id ? contact._id.toString() : undefined,
    deal_count: count,
    dealsCount: count,
    created_at: contact.createdAt || contact.created_at,
    updated_at: contact.updatedAt || contact.updated_at,
  };
}

async function list(req, res) {
  try {
    const filter = scopeQueryByRole(req, {});
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
    if (req.query.type) filter.status = req.query.type;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .populate('owner', 'name email')
        .populate('companyId', 'name website')
        .populate('company_id')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contact.countDocuments(filter),
    ]);
    const contactIds = contacts.map(c => c._id);
    const dealCounts = await Deal.aggregate([
      { 
        $match: { 
          $or: [
            { contact_id: { $in: contactIds } },
            { contactId: { $in: contactIds } }
          ]
        } 
      },
      { 
        $group: { 
          _id: { $ifNull: ['$contact_id', '$contactId'] }, 
          count: { $sum: 1 } 
        } 
      }
    ]);
    const dealCountsMap = {};
    dealCounts.forEach(item => {
      if (item._id) dealCountsMap[item._id.toString()] = item.count;
    });
    const contactsMapped = contacts.map(c => mapContactVirtuals(c, dealCountsMap));
    res.json({ contacts: contactsMapped, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Contacts list error:', err);
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      fname: body.fname,
      lname: body.lname,
      company: body.company,
      companyId: body.companyId || body.company_id,
      title: body.title || body.role,
      phone: body.phone,
      email: body.email,
      city: body.city,
      country: body.country,
      source: body.source,
      status: body.status || body.type,
      department: body.department,
      tags: body.tags,
      notes: body.notes,
      lastContact: body.lastContact || body.last_activity_at,
      owner: body.owner,

      name: body.name || [body.fname, body.lname].filter(Boolean).join(' '),
      role: body.role || body.title,
      company_id: body.company_id || body.companyId,
      type: body.type || body.status || 'Prospect',
      last_activity_at: body.last_activity_at || body.lastContact,
    });
    if (!payload.owner) payload.owner = req.user._id;
    const doc = await Contact.create(payload);
    if (doc.company_id) {
      await Company.findByIdAndUpdate(doc.company_id, { $addToSet: { contacts: doc._id } });
    }
    const populated = await Contact.findById(doc._id)
      .populate('owner', 'name email')
      .populate('companyId', 'name website')
      .populate('company_id')
      .lean();
    res.status(201).json({ message: 'Contact created', contact: mapContactVirtuals(populated) });
  } catch (err) {
    console.error('Contact create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create contact' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Contact.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('companyId', 'name website')
      .populate('company_id')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Contact not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this contact' });
    
    const dealCount = await Deal.countDocuments({
      $or: [{ contact_id: doc._id }, { contactId: doc._id }]
    });
    const dealCountsMap = { [doc._id.toString()]: dealCount };
    
    res.json({ contact: mapContactVirtuals(doc, dealCountsMap) });
  } catch (err) {
    console.error('Contact get error:', err);
    res.status(500).json({ message: 'Failed to fetch contact' });
  }
}

async function update(req, res) {
  try {
    const doc = await Contact.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Contact not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this contact' });
    const body = req.body || {};
    const allowed = [
      'fname', 'lname', 'company', 'companyId', 'title', 'phone', 'email', 'city', 'country', 'source', 'status', 'department', 'tags', 'notes', 'lastContact', 'owner',
      'name', 'role', 'company_id', 'type', 'last_activity_at'
    ];
    const oldCompanyId = doc.company_id || doc.companyId;
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    
    const newCompanyId = doc.company_id || doc.companyId;
    if (String(oldCompanyId) !== String(newCompanyId)) {
      if (oldCompanyId) {
        await Company.findByIdAndUpdate(oldCompanyId, { $pull: { contacts: doc._id } });
      }
      if (newCompanyId) {
        await Company.findByIdAndUpdate(newCompanyId, { $addToSet: { contacts: doc._id } });
      }
    }
    
    const populated = await Contact.findById(doc._id)
      .populate('owner', 'name email')
      .populate('companyId', 'name website')
      .populate('company_id')
      .lean();
      
    const dealCount = await Deal.countDocuments({
      $or: [{ contact_id: doc._id }, { contactId: doc._id }]
    });
    const dealCountsMap = { [doc._id.toString()]: dealCount };
    
    res.json({ message: 'Contact updated', contact: mapContactVirtuals(populated, dealCountsMap) });
  } catch (err) {
    console.error('Contact update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update contact' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Contact.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Contact not found' });
    const compId = doc.company_id || doc.companyId;
    if (compId) {
      await Company.findByIdAndUpdate(compId, { $pull: { contacts: doc._id } });
    }
    res.json({ message: 'Contact deleted', id: doc._id });
  } catch (err) {
    console.error('Contact delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete contact' });
  }
}

module.exports = { list, create, getOne, update, remove };
