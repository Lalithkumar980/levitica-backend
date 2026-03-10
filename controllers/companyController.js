const Company = require('../models/Company');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');

async function list(req, res) {
  try {
    const filter = scopeQueryByRole(req, {});
    if (req.query.q && req.query.q.trim()) {
      const q = req.query.q.trim();
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { industry: new RegExp(q, 'i') },
        { city: new RegExp(q, 'i') },
      ];
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      Company.find(filter).populate('owner', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Company.countDocuments(filter),
    ]);
    res.json({ companies, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Companies list error:', err);
    res.status(500).json({ message: 'Failed to fetch companies' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      name: body.name, industry: body.industry, city: body.city, country: body.country, website: body.website,
      phone: body.phone, employees: body.employees, revenue: body.revenue, status: body.status, owner: body.owner,
      contacts: body.contacts, deals: body.deals, notes: body.notes,
    });
    const doc = await Company.create(payload);
    res.status(201).json({ message: 'Company created', company: doc });
  } catch (err) {
    console.error('Company create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create company' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Company.findById(req.params.id).populate('contacts').populate('deals').lean();
    if (!doc) return res.status(404).json({ message: 'Company not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this company' });
    res.json({ company: doc });
  } catch (err) {
    console.error('Company get error:', err);
    res.status(500).json({ message: 'Failed to fetch company' });
  }
}

async function update(req, res) {
  try {
    const doc = await Company.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Company not found' });
    if (!canEditRecord(req, doc)) return res.status(403).json({ message: 'Access denied to this company' });
    const body = req.body || {};
    const allowed = ['name', 'industry', 'city', 'country', 'website', 'phone', 'employees', 'revenue', 'status', 'contacts', 'deals', 'notes', 'owner'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    if (isRep(req)) doc.owner = req.user._id;
    await doc.save();
    res.json({ message: 'Company updated', company: doc });
  } catch (err) {
    console.error('Company update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update company' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Company.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Company not found' });
    res.json({ message: 'Company deleted', id: doc._id });
  } catch (err) {
    console.error('Company delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete company' });
  }
}

module.exports = { list, create, getOne, update, remove };
