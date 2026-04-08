const multer = require('multer');

const MAX_MB = Number(process.env.UPLOAD_MAX_FILE_MB || process.env.ONBOARDING_MAX_FILE_MB || 25);
const maxBytes = MAX_MB * 1024 * 1024;
const MAX_FILES = Number(process.env.UPLOAD_MAX_FILES || 20);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: maxBytes, files: MAX_FILES },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'files', maxCount: MAX_FILES },
]);

function runDriveMultipart(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      console.log('[drive-upload] multer error', err.code, err.message);
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    return res.status(400).json({ message: err.message || 'Invalid file upload' });
  });
}

module.exports = {
  runDriveMultipart,
  MAX_FILES,
  maxBytes,
};
