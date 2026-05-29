const multer = require('multer');
const path = require('path');
const fs = require('fs');

const LEAD_IMPORT_EXT = /\.(csv|xlsx|xls)$/i;

/** Multer config for lead import (CSV or Excel, memory storage). */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const nameOk = LEAD_IMPORT_EXT.test(file.originalname);
    const mimeOk =
      /^(text\/csv|application\/csv|application\/vnd\.ms-excel)$/i.test(file.mimetype || '') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (nameOk || mimeOk) cb(null, true);
    else cb(new Error('Only CSV or Excel (.csv, .xlsx, .xls) files are allowed'), false);
  },
});

/** Single file field name for lead import (CSV / XLSX / XLS) */
const uploadLeadsCsv = csvUpload.single('file');

// Profile photo upload: memory storage, supports JPG, JPEG, PNG, WEBP, max 5MB.
const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only image files (JPEG, PNG, WEBP) are allowed'), false);
  },
}).single('photo');

/** Candidate resumes: disk storage under uploads/resumes, max 5MB, PDF/DOC/DOCX. */
const resumesDir = path.join(__dirname, '..', 'uploads', 'resumes');
if (!fs.existsSync(resumesDir)) {
  fs.mkdirSync(resumesDir, { recursive: true });
}
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.pdf';
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `${safe}${ext}`);
  },
});
const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const nameOk = /\.(pdf|doc|docx)$/i.test(file.originalname || '');
    const mimeOk =
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/msword' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (nameOk || mimeOk) cb(null, true);
    else cb(new Error('Only PDF, DOC, or DOCX files are allowed (max 5MB)'), false);
  },
}).single('resume');

/** Call recordings: disk storage under uploads/calls, max 20MB, Audio files. */
const callsDir = path.join(__dirname, '..', 'uploads', 'calls');
if (!fs.existsSync(callsDir)) {
  fs.mkdirSync(callsDir, { recursive: true });
}
const callRecordingStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, callsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.mp3';
    const safe = `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, `${safe}${ext}`);
  },
});
const callRecordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const ok = /^audio\//i.test(file.mimetype) || /\.(mp3|wav|ogg|m4a)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Only audio files (MP3, WAV, OGG, M4A) are allowed (max 20MB)'), false);
  },
}).single('recording');

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB limit
}).single('file');

module.exports = {
  csvUpload,
  uploadLeadsCsv,
  profilePhotoUpload,
  resumeUpload,
  callRecordingUpload,
  documentUpload,
};

