const Document = require('../models/Document');
const Deal = require('../models/Deal');
const { canViewAll } = require('../middleware/roles');

async function buildDocumentFilter(req) {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.dealId) filter.dealId = req.query.dealId;
  if (canViewAll(req)) return filter;
  const ownDealIds = await Deal.find({ owner: req.user._id }).distinct('_id');
  filter.$or = [
    { dealId: { $in: ownDealIds } },
    { uploadedBy: req.user._id },
  ];
  return filter;
}

async function canAccessDocument(req, doc) {
  if (canViewAll(req)) return true;
  if (!doc) return false;
  if (String(doc.uploadedBy) === String(req.user._id)) return true;
  if (doc.dealId) {
    const deal = await Deal.findById(doc.dealId).select('owner').lean();
    if (deal && String(deal.owner) === String(req.user._id)) return true;
  }
  return false;
}

async function list(req, res) {
  try {
    const filter = await buildDocumentFilter(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [documents, total] = await Promise.all([
      Document.find(filter)
        .populate('uploadedBy', 'name email')
        .populate('dealId', 'title company')
        .populate('contactId', 'fname lname company')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments(filter),
    ]);
    res.json({ documents, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Documents list error:', err);
    res.status(500).json({ message: 'Failed to fetch documents' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = {
      name: body.name, type: body.type, url: body.url, size: body.size, mimeType: body.mimeType,
      company: body.company, dealId: body.dealId, contactId: body.contactId, uploadedBy: req.user._id,
      date: body.date || new Date(), notes: body.notes,
    };
    const doc = await Document.create(payload);
    if (doc.dealId) {
      await Deal.findByIdAndUpdate(doc.dealId, { $addToSet: { files: doc._id } });
    }
    const populated = await Document.findById(doc._id)
      .populate('uploadedBy', 'name')
      .populate('dealId', 'title company')
      .populate('contactId', 'fname lname company')
      .lean();
    res.status(201).json({ message: 'Document created', document: populated });
  } catch (err) {
    console.error('Document create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create document' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name')
      .populate('dealId')
      .populate('contactId')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!(await canAccessDocument(req, doc))) return res.status(403).json({ message: 'Access denied to this document' });
    res.json({ document: doc });
  } catch (err) {
    console.error('Document get error:', err);
    res.status(500).json({ message: 'Failed to fetch document' });
  }
}

async function update(req, res) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!(await canAccessDocument(req, doc))) return res.status(403).json({ message: 'Access denied to this document' });
    const body = req.body || {};
    const allowed = ['name', 'type', 'url', 'size', 'mimeType', 'company', 'dealId', 'contactId', 'date', 'notes'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    await doc.save();
    const populated = await Document.findById(doc._id)
      .populate('uploadedBy', 'name')
      .populate('dealId', 'title company')
      .populate('contactId', 'fname lname company')
      .lean();
    res.json({ message: 'Document updated', document: populated });
  } catch (err) {
    console.error('Document update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update document' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.dealId) {
      await Deal.findByIdAndUpdate(doc.dealId, { $pull: { files: doc._id } });
    }
    await Document.findByIdAndDelete(doc._id);
    res.json({ message: 'Document deleted', id: doc._id });
  } catch (err) {
    console.error('Document delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete document' });
  }
}

module.exports = { list, create, getOne, update, remove };
