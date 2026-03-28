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

/** Profile photo: disk storage, images only, max 2MB. Saves to uploads/profiles. */
const profilesDir = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
}
const profilePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profilesDir),
  filename: (req, file, cb) => {
    const ext = (file.mimetype === 'image/jpeg' ? '.jpg' : file.mimetype === 'image/png' ? '.png' : '.jpg');
    cb(null, `${req.user._id.toString()}${ext}`);
  },
});
const profilePhotoUpload = multer({
  storage: profilePhotoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
  },
}).single('photo');

module.exports = {
  csvUpload,
  uploadLeadsCsv,
  profilePhotoUpload,
};
