const Document = require('../models/Document');
const Deal = require('../models/Deal');
const { canViewAll } = require('../middleware/roles');
const { getDriveClient, ensureFolderPath, uploadBufferToFolder, deleteFile } = require('../services/googleDriveService');

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

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
    let driveFileId = undefined;
    let url = body.url || '#';
    let size = body.size;
    let mimeType = body.mimeType;

    if (req.file) {
      const drive = await getDriveClient();
      const folderId = await ensureFolderPath(drive, ['levitica Documents']);
      const uploadRes = await uploadBufferToFolder({
        drive,
        folderId,
        fileName: body.name || req.file.originalname,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
      driveFileId = uploadRes.fileId;
      url = '/api/documents/placeholder';
      size = formatFileSize(req.file.size);
      mimeType = req.file.mimetype;
    }

    const payload = {
      name: body.name || (req.file ? req.file.originalname : 'Document'),
      type: body.type || 'Document',
      url,
      size,
      mimeType,
      company: body.company,
      dealId: body.dealId,
      contactId: body.contactId,
      uploadedBy: req.user._id,
      date: body.date || new Date(),
      notes: body.notes,
      driveFileId,
    };

    const doc = await Document.create(payload);
    
    // Update the URL to the exact proxy route
    doc.url = `/api/v1/documents/${doc._id}/download`;
    await doc.save();

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
    
    if (req.file) {
      const drive = await getDriveClient();
      const folderId = await ensureFolderPath(drive, ['levitica Documents']);
      
      if (doc.driveFileId) {
        try {
          await deleteFile(drive, doc.driveFileId);
        } catch (err) {
          console.error('Failed to delete old document from Google Drive:', err);
        }
      }
      
      const uploadRes = await uploadBufferToFolder({
        drive,
        folderId,
        fileName: body.name || req.file.originalname,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
      doc.driveFileId = uploadRes.fileId;
      doc.url = `/api/v1/documents/${doc._id}/download`;
      doc.size = formatFileSize(req.file.size);
      doc.mimeType = req.file.mimetype;
    }

    const allowed = ['name', 'type', 'company', 'dealId', 'contactId', 'date', 'notes'];
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
    
    if (doc.driveFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, doc.driveFileId);
      } catch (err) {
        console.error('Failed to delete document from Google Drive:', err);
      }
    }
    
    await Document.findByIdAndDelete(doc._id);
    res.json({ message: 'Document deleted', id: doc._id });
  } catch (err) {
    console.error('Document delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete document' });
  }
}

async function download(req, res) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!(await canAccessDocument(req, doc))) return res.status(403).json({ message: 'Access denied to this document' });
    if (!doc.driveFileId) return res.status(400).json({ message: 'Document has no Google Drive file associated' });

    const drive = await getDriveClient();
    const driveRes = await drive.files.get(
      { fileId: doc.driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const isDownload = req.query.download === 'true';
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(doc.name)}"`
    );
    driveRes.data.pipe(res);
  } catch (err) {
    console.error('Document download error:', err);
    res.status(500).json({ message: 'Failed to download document from Google Drive' });
  }
}

module.exports = { list, create, getOne, update, remove, download };
