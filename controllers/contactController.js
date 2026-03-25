const Contact = require('../models/Contact');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');

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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [contacts, total] = await Promise.all([
      Contact.find(filter).populate('owner', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Contact.countDocuments(filter),
    ]);
    res.json({ contacts, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Contacts list error:', err);
    res.status(500).json({ message: 'Failed to fetch contacts' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      fname: body.fname, lname: body.lname, company: body.company, title: body.title, phone: body.phone,
      email: body.email, city: body.city, country: body.country, source: body.source, status: body.status,
      tags: body.tags, notes: body.notes, lastContact: body.lastContact, owner: body.owner,
    });
    if (!payload.owner) payload.owner = req.user._id;
    const doc = await Contact.create(payload);
    res.status(201).json({ message: 'Contact created', contact: doc });
  } catch (err) {
    console.error('Contact create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create contact' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Contact.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ message: 'Contact not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this contact' });
    res.json({ contact: doc });
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
    const allowed = ['fname', 'lname', 'company', 'title', 'phone', 'email', 'city', 'country', 'source', 'status', 'tags', 'notes', 'lastContact', 'owner'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    res.json({ message: 'Contact updated', contact: doc });
  } catch (err) {
    console.error('Contact update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update contact' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Contact.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Contact not found' });
    res.json({ message: 'Contact deleted', id: doc._id });
  } catch (err) {
    console.error('Contact delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete contact' });
  }
}

module.exports = { list, create, getOne, update, remove };
