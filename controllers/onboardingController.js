const crypto = require('crypto');
const mongoose = require('mongoose');
const Invitation = require('../models/Invitation');
const OnboardingCandidate = require('../models/OnboardingCandidate');
const { sendOnboardingInvite } = require('../utils/email');
const { uploadOnboardingPackage } = require('../services/onboardingDriveUpload');

const INVITE_TTL_HOURS = Number(process.env.ONBOARDING_INVITE_TTL_HOURS || 168);

function dbReady(res) {
  if (mongoose.connection.readyState !== 1) {
    res.status(503).json({ message: 'Database unavailable' });
    return false;
  }
  return true;
}

function inviteBaseUrl() {
  return (
    process.env.ONBOARDING_FORM_BASE_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:3000/onboarding'
  ).replace(/\/$/, '');
}

function buildInviteUrl(token) {
  const base = inviteBaseUrl();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

/**
 * POST /api/onboarding/send-invite
 * Body: { email: string }
 */
async function sendInvite(req, res) {
  if (!dbReady(res)) return;

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid candidate email is required' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  let invitation;
  try {
    invitation = await Invitation.create({ email, token, expiresAt, used: false });
  } catch (err) {
    console.error('[onboarding] failed to save invitation', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not create invitation' });
  }

  const inviteUrl = buildInviteUrl(token);
  const mail = await sendOnboardingInvite({ to: email, inviteUrl });

  const allowLinkWithoutEmail =
    String(process.env.ONBOARDING_RETURN_INVITE_LINK_ON_EMAIL_FAILURE || '').toLowerCase() === 'true';

  if (!mail.ok) {
    if (allowLinkWithoutEmail) {
      console.warn('[onboarding] email failed — returning invite link anyway (ONBOARDING_RETURN_INVITE_LINK_ON_EMAIL_FAILURE)', mail.error);
      return res.status(201).json({
        message: 'Invitation created; email was not delivered — share the link manually',
        email,
        expiresAt: invitation.expiresAt,
        inviteUrl,
        emailSent: false,
        emailError: mail.error,
      });
    }
    try {
      await Invitation.deleteOne({ _id: invitation._id });
    } catch (e) {
      console.error('[onboarding] rollback invitation failed', e instanceof Error ? e.message : e);
    }
    return res.status(502).json({
      message: 'Invitation was not sent — email delivery failed. Configure SMTP in .env or set EMAIL_USE_JSON=true (dev) or ONBOARDING_RETURN_INVITE_LINK_ON_EMAIL_FAILURE=true (dev).',
      detail: mail.error,
    });
  }

  return res.status(201).json({
    message: 'Invitation sent',
    email,
    expiresAt: invitation.expiresAt,
  });
}

/**
 * GET /api/onboarding/validate-token?token=
 */
async function validateToken(req, res) {
  if (!dbReady(res)) return;

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    return res.status(400).json({ message: 'token query parameter is required' });
  }

  let doc;
  try {
    doc = await Invitation.findOne({ token }).lean();
  } catch (err) {
    console.error('[onboarding] validate-token db error', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not validate token' });
  }

  if (!doc) {
    return res.status(404).json({ message: 'Invalid token' });
  }
  if (doc.used) {
    return res.status(410).json({ message: 'This invitation has already been used' });
  }
  if (new Date(doc.expiresAt) <= new Date()) {
    return res.status(410).json({ message: 'This invitation has expired' });
  }

  return res.json({
    valid: true,
    email: doc.email,
    expiresAt: doc.expiresAt,
  });
}

function parseFormDataField(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * POST /api/onboarding/submit (multipart: fields + files)
 */
async function submitOnboarding(req, res) {
  if (!dbReady(res)) return;

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  if (!token) {
    return res.status(400).json({ message: 'token is required' });
  }
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }

  let invitation;
  try {
    invitation = await Invitation.findOne({ token });
  } catch (err) {
    console.error('[onboarding] submit lookup error', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not process submission' });
  }

  if (!invitation) {
    return res.status(404).json({ message: 'Invalid token' });
  }
  if (invitation.used) {
    return res.status(410).json({ message: 'This invitation has already been used' });
  }
  if (invitation.expiresAt <= new Date()) {
    return res.status(410).json({ message: 'This invitation has expired' });
  }
  if (invitation.email.toLowerCase() !== email) {
    return res.status(400).json({ message: 'Email must match the invited address' });
  }

  const files = Array.isArray(req.files) ? req.files : [];

  const reserved = new Set(['token', 'name', 'email', 'formData']);
  const extra = { ...req.body };
  for (const k of reserved) delete extra[k];
  const formData = { ...parseFormDataField(req.body?.formData), ...extra };

  const formPayload = {
    name,
    email,
    submittedAt: new Date().toISOString(),
    formData,
    originalInvitationEmail: invitation.email,
  };

  let uploaded;
  try {
    uploaded = await uploadOnboardingPackage({
      candidateFolderName: name,
      files,
      formPayload,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[onboarding] Google Drive error', msg);
    return res.status(502).json({
      message: 'Could not upload files to storage',
      detail: process.env.NODE_ENV === 'production' ? undefined : msg,
    });
  }

  const fileEntries = uploaded.uploaded.filter((u) => u.originalName !== 'onboarding-form-data.json');
  const jsonEntry = uploaded.uploaded.find((u) => u.originalName === 'onboarding-form-data.json');

  let candidate;
  try {
    candidate = await OnboardingCandidate.create({
      name,
      email,
      files: fileEntries.map((u) => ({
        originalName: u.originalName,
        driveFileId: u.driveFileId,
        webUrl: u.webUrl,
        contentType: u.contentType,
      })),
      formData: {
        ...formData,
        _onboardingJsonFileId: jsonEntry?.driveFileId || '',
        _onboardingJsonWebUrl: jsonEntry?.webUrl || '',
      },
      invitationToken: token,
    });
  } catch (err) {
    console.error('[onboarding] save candidate failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not save submission (files may exist in Google Drive)' });
  }

  try {
    invitation.used = true;
    await invitation.save();
  } catch (err) {
    console.error('[onboarding] mark token used failed', err instanceof Error ? err.message : err);
    return res.status(500).json({
      message: 'Submission saved but token could not be marked used — contact support',
      id: candidate._id.toString(),
    });
  }

  console.log('[onboarding] submission complete', {
    candidateId: candidate._id.toString(),
    email,
    fileCount: fileEntries.length,
  });

  return res.status(201).json({
    message: 'Onboarding submitted successfully',
    id: candidate._id.toString(),
    files: candidate.files,
  });
}

module.exports = {
  sendInvite,
  validateToken,
  submitOnboarding,
};
