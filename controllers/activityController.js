const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Deal = require('../models/Deal');
const Document = require('../models/Document');
const { scopeQueryByRole, ensureOwnerForCreate, canEditRecord, isRep } = require('../middleware/roles');
const path = require('path');
const { getDriveClient, ensureFolderPath, uploadBufferToFolder, deleteFile } = require('../services/googleDriveService');

const REP_FIELD = 'rep';

function buildActivityFilter(req, extra = {}) {
  const filter = scopeQueryByRole(req, extra, REP_FIELD);
  if (req.query.type) filter.type = req.query.type;
  if (req.query.dealId) filter.dealId = req.query.dealId;
  if (req.query.q && req.query.q.trim()) {
    const q = req.query.q.trim();
    filter.$or = [
      { subject: new RegExp(q, 'i') },
      { notes: new RegExp(q, 'i') },
      { company: new RegExp(q, 'i') },
    ];
  }
  return filter;
}

async function listCalls(req, res) {
  try {
    const filter = buildActivityFilter(req, { type: 'Call' });
    const list = await Activity.find(filter)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .sort({ date: -1 })
      .lean();
    res.json({ activities: list });
  } catch (err) {
    console.error('Activities calls error:', err);
    res.status(500).json({ message: 'Failed to fetch calls' });
  }
}

async function listEmails(req, res) {
  try {
    const filter = buildActivityFilter(req, { type: 'Email' });
    const list = await Activity.find(filter)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .sort({ date: -1 })
      .lean();
    res.json({ activities: list });
  } catch (err) {
    console.error('Activities emails error:', err);
    res.status(500).json({ message: 'Failed to fetch emails' });
  }
}

async function list(req, res) {
  try {
    const filter = buildActivityFilter(req);
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const [activities, total] = await Promise.all([
      Activity.find(filter)
        .populate('rep', 'name email')
        .populate('dealId', 'title company stage')
        .populate('contactId', 'fname lname company')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(filter),
    ]);
    res.json({ activities, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error('Activities list error:', err);
    res.status(500).json({ message: 'Failed to fetch activities' });
  }
}

async function create(req, res) {
  try {
    const body = req.body || {};
    const payload = ensureOwnerForCreate(req, {
      type: body.type, subject: body.subject, notes: body.notes, date: body.date, duration: body.duration,
      outcome: body.outcome, company: body.company, recording: body.recording, rep: body.rep, dealId: body.dealId,
      contactId: body.contactId, followupDate: body.followupDate, followupType: body.followupType, audioDuration: body.audioDuration,
    }, REP_FIELD);

    if (req.file) {
      const drive = await getDriveClient();
      const folderId = await ensureFolderPath(drive, ['levitica Call Recordings']);
      const fileName = `call_${Date.now()}_${req.user._id}_${Math.random().toString(36).slice(2, 8)}${path.extname(req.file.originalname || '.mp3')}`;
      const { fileId } = await uploadBufferToFolder({
        drive,
        folderId,
        fileName,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
      payload.recordingFileId = fileId;
      payload.recording = 'temp_placeholder';
    }

    if (!payload.rep) payload.rep = req.user._id;
    const doc = await Activity.create(payload);

    if (payload.recordingFileId) {
      doc.recording = `/api/v1/activities/calls/${doc._id}/audio`;
      await doc.save();
    }

    const populated = await Activity.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId', 'title company stage')
      .populate('contactId', 'fname lname company')
      .lean();
    res.status(201).json({ message: 'Activity created', activity: populated });
  } catch (err) {
    console.error('Activity create error:', err);
    res.status(500).json({ message: err.message || 'Failed to create activity' });
  }
}

async function getOne(req, res) {
  try {
    const doc = await Activity.findById(req.params.id)
      .populate('rep', 'name')
      .populate('dealId')
      .populate('contactId')
      .lean();
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this activity' });
    res.json({ activity: doc });
  } catch (err) {
    console.error('Activity get error:', err);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
}

async function update(req, res) {
  try {
    const doc = await Activity.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    if (!canEditRecord(req, doc, REP_FIELD)) return res.status(403).json({ message: 'Access denied to this activity' });
    const body = req.body || {};
    const allowed = ['type', 'subject', 'notes', 'date', 'duration', 'outcome', 'company', 'recording', 'rep', 'dealId', 'contactId', 'followupDate', 'followupType', 'audioDuration'];
    allowed.forEach((key) => { if (body[key] !== undefined) doc[key] = body[key]; });
    
    if (req.file) {
      const drive = await getDriveClient();
      const folderId = await ensureFolderPath(drive, ['levitica Call Recordings']);
      
      if (doc.recordingFileId) {
        try {
          await deleteFile(drive, doc.recordingFileId);
        } catch (err) {
          console.error('Failed to delete previous recording from Google Drive:', err);
        }
      }
      
      const fileName = `call_${Date.now()}_${req.user._id}_${Math.random().toString(36).slice(2, 8)}${path.extname(req.file.originalname || '.mp3')}`;
      const { fileId } = await uploadBufferToFolder({
        drive,
        folderId,
        fileName,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
      });
      doc.recordingFileId = fileId;
      doc.recording = `/api/v1/activities/calls/${doc._id}/audio`;
    }

    if (isRep(req)) doc.rep = req.user._id;

    await doc.save();
    const populated = await Activity.findById(doc._id)
      .populate('rep', 'name')
      .populate('dealId')
      .populate('contactId')
      .lean();
    res.json({ message: 'Activity updated', activity: populated });
  } catch (err) {
    console.error('Activity update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update activity' });
  }
}

async function remove(req, res) {
  try {
    const doc = await Activity.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Activity not found' });
    
    if (doc.recordingFileId) {
      try {
        const drive = await getDriveClient();
        await deleteFile(drive, doc.recordingFileId);
      } catch (err) {
        console.error('Failed to delete call recording from Google Drive:', err);
      }
    }
    
    await Activity.findByIdAndDelete(req.params.id);
    res.json({ message: 'Activity deleted', id: doc._id });
  } catch (err) {
    console.error('Activity delete error:', err);
    res.status(500).json({ message: err.message || 'Failed to delete activity' });
  }
}

function formatDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  try {
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}

async function recentActivity(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const filter = buildActivityFilter(req);
    
    const logs = await Activity.find(filter)
      .populate('rep', 'name')
      .populate('dealId', 'title company')
      .populate('contactId', 'fname lname company')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    const formatted = logs.map(l => {
      let icon = 'phone';
      if (l.type === 'Email') icon = 'mail';
      if (l.type === 'Meeting' || l.type === 'Demo') icon = 'calendar';
      if (l.type === 'Note') icon = 'edit';
      if (l.type === 'Task') icon = 'check-square';

      const companyName = l.company || (l.dealId && l.dealId.company) || (l.contactId && l.contactId.company) || '';
      
      return {
        id: l._id,
        type: l.type.toLowerCase(),
        title: `${l.type}: ${l.subject}`,
        subtitle: [companyName, formatDateTime(l.date)].filter(Boolean).join(' · '),
        icon: icon,
        sortDate: l.date,
        timestamp: l.date
      };
    });

    res.json({ activity: formatted });
  } catch (err) {
    console.error('Activities recent-activity error:', err);
    res.status(500).json({ message: 'Failed to fetch recent activities' });
  }
}

async function salesRepActivity(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const userId = req.user._id;

    const [leads, contacts, companies, deals, activities, documents] = await Promise.all([
      Lead.find({ owner: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      Contact.find({ owner: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      Company.find({ owner: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      Deal.find({ owner: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
      Activity.find({ rep: userId })
        .populate('dealId', 'title company')
        .populate('contactId', 'fname lname company')
        .sort({ createdAt: -1 }).limit(limit).lean(),
      Document.find({ uploadedBy: userId }).sort({ createdAt: -1 }).limit(limit).lean()
    ]);

    const allActivities = [];

    // 1. Leads
    leads.forEach(l => {
      allActivities.push({
        id: l._id,
        type: 'lead_created',
        title: `Lead Added: ${l.fname} ${l.lname}`,
        subtitle: [l.company, formatDateTime(l.createdAt)].filter(Boolean).join(' · '),
        icon: 'user-plus',
        sortDate: l.createdAt,
        timestamp: l.createdAt
      });
    });

    // 2. Contacts
    contacts.forEach(c => {
      allActivities.push({
        id: c._id,
        type: 'contact',
        title: `Contact Added: ${c.fname} ${c.lname || ''}`.trim(),
        subtitle: [c.company, formatDateTime(c.createdAt)].filter(Boolean).join(' · '),
        icon: 'user',
        sortDate: c.createdAt,
        timestamp: c.createdAt
      });
    });

    // 3. Companies
    companies.forEach(com => {
      allActivities.push({
        id: com._id,
        type: 'company',
        title: `Company Added: ${com.name}`,
        subtitle: [com.industry, formatDateTime(com.createdAt)].filter(Boolean).join(' · '),
        icon: 'briefcase',
        sortDate: com.createdAt,
        timestamp: com.createdAt
      });
    });

    // 4. Deals
    deals.forEach(d => {
      allActivities.push({
        id: d._id,
        type: 'deal_created',
        title: `Deal Created: ${d.title}`,
        subtitle: [`Company: ${d.company}`, d.amount ? `Value: ₹${d.amount}` : '', formatDateTime(d.createdAt)].filter(Boolean).join(' · '),
        icon: 'dollar-sign',
        sortDate: d.createdAt,
        timestamp: d.createdAt
      });
    });

    // 5. Activity logs (Calls, Emails, Meetings, Note, Task, etc.)
    activities.forEach(a => {
      let icon = 'phone';
      if (a.type === 'Email') icon = 'mail';
      if (a.type === 'Meeting' || a.type === 'Demo') icon = 'calendar';
      if (a.type === 'Note') icon = 'edit';
      if (a.type === 'Task') icon = 'check-square';

      const companyName = a.company || (a.dealId && a.dealId.company) || (a.contactId && a.contactId.company) || '';

      allActivities.push({
        id: a._id,
        type: a.type.toLowerCase(),
        title: `${a.type} Logged: ${a.subject}`,
        subtitle: [companyName, formatDateTime(a.date || a.createdAt)].filter(Boolean).join(' · '),
        icon: icon,
        sortDate: a.date || a.createdAt,
        timestamp: a.date || a.createdAt
      });
    });

    // 6. Documents
    documents.forEach(doc => {
      allActivities.push({
        id: doc._id,
        type: 'document',
        title: `Document Uploaded: ${doc.name}`,
        subtitle: [`Type: ${doc.type}`, doc.company, formatDateTime(doc.createdAt)].filter(Boolean).join(' · '),
        icon: 'file-text',
        sortDate: doc.createdAt,
        timestamp: doc.createdAt
      });
    });

    // Sort all combined activities by date descending
    allActivities.sort((x, y) => new Date(y.sortDate) - new Date(x.sortDate));

    // Slice to the requested limit
    const sliced = allActivities.slice(0, limit);

    res.json({ activity: sliced });
  } catch (err) {
    console.error('Activities salesRepActivity error:', err);
    res.status(500).json({ message: 'Failed to fetch sales rep activities' });
  }
}

async function salesManagerActivity(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const [leads, contacts, companies, deals, activities, documents] = await Promise.all([
      Lead.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Contact.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Company.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Deal.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Activity.find({})
        .populate('rep', 'name')
        .populate('dealId', 'title company')
        .populate('contactId', 'fname lname company')
        .sort({ createdAt: -1 }).limit(limit).lean(),
      Document.find({}).populate('uploadedBy', 'name').sort({ createdAt: -1 }).limit(limit).lean()
    ]);

    const allActivities = [];

    // 1. Leads
    leads.forEach(l => {
      const repName = l.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: l._id,
        type: 'lead_created',
        title: `Lead Added: ${l.fname} ${l.lname}`,
        subtitle: [`By: ${repName}`, l.company, formatDateTime(l.createdAt)].filter(Boolean).join(' · '),
        icon: 'user-plus',
        sortDate: l.createdAt,
        timestamp: l.createdAt
      });
    });

    // 2. Contacts
    contacts.forEach(c => {
      const repName = c.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: c._id,
        type: 'contact',
        title: `Contact Added: ${c.fname} ${c.lname || ''}`.trim(),
        subtitle: [`By: ${repName}`, c.company, formatDateTime(c.createdAt)].filter(Boolean).join(' · '),
        icon: 'user',
        sortDate: c.createdAt,
        timestamp: c.createdAt
      });
    });

    // 3. Companies
    companies.forEach(com => {
      const repName = com.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: com._id,
        type: 'company',
        title: `Company Added: ${com.name}`,
        subtitle: [`By: ${repName}`, com.industry, formatDateTime(com.createdAt)].filter(Boolean).join(' · '),
        icon: 'briefcase',
        sortDate: com.createdAt,
        timestamp: com.createdAt
      });
    });

    // 4. Deals
    deals.forEach(d => {
      const repName = d.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: d._id,
        type: 'deal_created',
        title: `Deal Created: ${d.title}`,
        subtitle: [`By: ${repName}`, `Company: ${d.company}`, d.amount ? `Value: ₹${d.amount}` : '', formatDateTime(d.createdAt)].filter(Boolean).join(' · '),
        icon: 'dollar-sign',
        sortDate: d.createdAt,
        timestamp: d.createdAt
      });
    });

    // 5. Activity logs (Calls, Emails, Meetings, Note, Task, etc.)
    activities.forEach(a => {
      const repName = a.rep?.name || 'Unknown Rep';
      let icon = 'phone';
      if (a.type === 'Email') icon = 'mail';
      if (a.type === 'Meeting' || a.type === 'Demo') icon = 'calendar';
      if (a.type === 'Note') icon = 'edit';
      if (a.type === 'Task') icon = 'check-square';

      const companyName = a.company || (a.dealId && a.dealId.company) || (a.contactId && a.contactId.company) || '';

      allActivities.push({
        id: a._id,
        type: a.type.toLowerCase(),
        title: `${a.type} Logged: ${a.subject}`,
        subtitle: [`By: ${repName}`, companyName, formatDateTime(a.date || a.createdAt)].filter(Boolean).join(' · '),
        icon: icon,
        sortDate: a.date || a.createdAt,
        timestamp: a.date || a.createdAt
      });
    });

    // 6. Documents
    documents.forEach(doc => {
      const repName = doc.uploadedBy?.name || 'Unknown Rep';
      allActivities.push({
        id: doc._id,
        type: 'document',
        title: `Document Uploaded: ${doc.name}`,
        subtitle: [`By: ${repName}`, `Type: ${doc.type}`, doc.company, formatDateTime(doc.createdAt)].filter(Boolean).join(' · '),
        icon: 'file-text',
        sortDate: doc.createdAt,
        timestamp: doc.createdAt
      });
    });

    // Sort all combined activities by date descending
    allActivities.sort((x, y) => new Date(y.sortDate) - new Date(x.sortDate));

    // Slice to the requested limit
    const sliced = allActivities.slice(0, limit);

    res.json({ activity: sliced });
  } catch (err) {
    console.error('Activities salesManagerActivity error:', err);
    res.status(500).json({ message: 'Failed to fetch sales manager activities' });
  }
}

async function streamAudio(req, res) {
  try {
    const activity = await Activity.findById(req.params.id).lean();
    if (!activity) return res.status(404).json({ message: 'Activity not found' });
    if (!canEditRecord(req, activity, REP_FIELD)) {
      return res.status(403).json({ message: 'Access denied to this recording' });
    }
    
    if (activity.recordingFileId) {
      const drive = await getDriveClient();
      const fileStream = await drive.files.get({
        fileId: activity.recordingFileId,
        alt: 'media'
      }, { responseType: 'stream' });
      
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      
      return fileStream.data
        .on('error', (err) => {
          console.error('Error proxying audio from Drive:', err);
          if (!res.headersSent) res.status(500).end();
        })
        .pipe(res);
    }
    
    if (activity.recording && activity.recording.startsWith('/api/uploads/')) {
      return res.redirect(activity.recording);
    }
    
    return res.status(404).json({ message: 'Audio recording not found' });
  } catch (err) {
    console.error('Stream audio error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to stream call recording' });
    }
  }
}

module.exports = {
  listCalls,
  listEmails,
  list,
  create,
  getOne,
  update,
  remove,
  recentActivity,
  salesRepActivity,
  salesManagerActivity,
  streamAudio,
};
