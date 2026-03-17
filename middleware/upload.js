const multer = require('multer');
const path = require('path');
const fs = require('fs');

/** Multer config for file uploads (memory storage). Use for CSV import, etc. */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv';
    if (ok) cb(null, true);
    else cb(new Error('Only CSV files are allowed'), false);
  },
});

/** Single file field name for lead CSV import */
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
