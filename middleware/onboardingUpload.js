const multer = require('multer');

const MAX_FILES = Number(process.env.ONBOARDING_MAX_FILES || 20);
const MAX_FILE_MB = Number(process.env.ONBOARDING_MAX_FILE_MB || 25);
const maxBytes = MAX_FILE_MB * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function isAllowedFile(file) {
  const mime = (file.mimetype || '').toLowerCase();
  if (ALLOWED_MIME.has(mime)) return true;
  const name = (file.originalname || '').toLowerCase();
  return /\.(pdf|jpe?g|png|gif|webp)$/i.test(name);
}

const storage = multer.memoryStorage();

const onboardingFilesUpload = multer({
  storage,
  limits: { fileSize: maxBytes, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (isAllowedFile(file)) cb(null, true);
    else cb(new Error('Only PDF and image files (JPEG, PNG, GIF, WebP) are allowed'));
  },
}).array('files', MAX_FILES);

function runOnboardingUpload(req, res, next) {
  onboardingFilesUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      console.log('[onboarding][upload] multer error', err.code, err.message);
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    console.log('[onboarding][upload] rejected', err.message);
    return res.status(400).json({ message: err.message || 'Invalid file upload' });
  });
}

module.exports = {
  runOnboardingUpload,
  MAX_FILES,
  maxBytes,
};
