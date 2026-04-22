const multer = require('multer');

const MAX_FILES = Number(process.env.ONBOARDING_MAX_FILES || 50);
const MAX_FILE_MB = Number(process.env.ONBOARDING_MAX_FILE_MB || 25);
const maxBytes = MAX_FILE_MB * 1024 * 1024;
const MAX_OFFER_LETTER_FILES = Number(process.env.OFFER_LETTER_MAX_FILES || 10);

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

const offerLetterUpload = multer({
  storage,
  limits: { fileSize: maxBytes, files: MAX_OFFER_LETTER_FILES },
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    const name = (file.originalname || '').toLowerCase();
    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
}).array('attachments', MAX_OFFER_LETTER_FILES);

function runOnboardingUpload(req, res, next) {
  onboardingFilesUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      console.log('[onboarding][upload] multer error', err.code, err.message);
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          message: `Upload error: too many files. You can upload up to ${MAX_FILES} files in one submission.`,
        });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    console.log('[onboarding][upload] rejected', err.message);
    return res.status(400).json({ message: err.message || 'Invalid file upload' });
  });
}

function runOfferLetterUpload(req, res, next) {
  offerLetterUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      console.log('[onboarding][offer-letter-upload] multer error', err.code, err.message);
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          message: `Upload error: too many files. You can upload up to ${MAX_OFFER_LETTER_FILES} PDF files in one email.`,
        });
      }
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    console.log('[onboarding][offer-letter-upload] rejected', err.message);
    return res.status(400).json({ message: err.message || 'Invalid offer letter upload' });
  });
}

module.exports = {
  runOnboardingUpload,
  runOfferLetterUpload,
  MAX_FILES,
  maxBytes,
};
