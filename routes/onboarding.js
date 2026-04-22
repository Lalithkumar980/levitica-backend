const express = require('express');
const asyncHandler = require('express-async-handler');
const { verifyToken, adminOrHRManagement } = require('../middleware/auth');
const { runOnboardingUpload, runOfferLetterUpload } = require('../middleware/onboardingUpload');
const {
  sendInvite,
  sendOfferLetter,
  validateToken,
  listSubmissions,
  submitOnboarding,
  updateSubmissionVerification,
} = require('../controllers/onboardingController');

const router = express.Router();

/** Admin or HR Management: send onboarding invite email */
router.post('/send-invite', verifyToken, adminOrHRManagement, asyncHandler(sendInvite));

/** Admin or HR Management: send offer letter email with PDF attachments */
router.post('/send-offer-letter', verifyToken, adminOrHRManagement, runOfferLetterUpload, asyncHandler(sendOfferLetter));

/** Public: validate magic link token */
router.get('/validate-token', asyncHandler(validateToken));

/** Admin/HR: list onboarding submissions */
router.get('/submissions', verifyToken, adminOrHRManagement, asyncHandler(listSubmissions));

/** Admin/HR: update document verification status */
router.patch('/submissions/:id/status', verifyToken, adminOrHRManagement, asyncHandler(updateSubmissionVerification));

/** Public: submit form + files */
router.post('/submit', runOnboardingUpload, asyncHandler(submitOnboarding));

module.exports = router;
