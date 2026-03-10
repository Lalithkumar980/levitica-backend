const multer = require('multer');

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

module.exports = {
  csvUpload,
  uploadLeadsCsv,
};
