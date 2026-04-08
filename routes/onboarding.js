const express = require('express');
const asyncHandler = require('express-async-handler');
const { verifyToken, adminOrHRManagement } = require('../middleware/auth');
const { runOnboardingUpload } = require('../middleware/onboardingUpload');
const {
  sendInvite,
  validateToken,
  listSubmissions,
  submitOnboarding,
} = require('../controllers/onboardingController');

const router = express.Router();

/** Admin or HR Management: send onboarding invite email */
router.post('/send-invite', verifyToken, adminOrHRManagement, asyncHandler(sendInvite));

/** Public: validate magic link token */
router.get('/validate-token', asyncHandler(validateToken));

/** Admin/HR: list onboarding submissions */
router.get('/submissions', verifyToken, adminOrHRManagement, asyncHandler(listSubmissions));

/** Public: submit form + files */
router.post('/submit', runOnboardingUpload, asyncHandler(submitOnboarding));

module.exports = router;
