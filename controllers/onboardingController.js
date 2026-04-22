const crypto = require('crypto');
const mongoose = require('mongoose');
const Invitation = require('../models/Invitation');
const Candidate = require('../models/Candidate');
const OnboardingCandidate = require('../models/OnboardingCandidate');
const { sendOnboardingInvite, sendOfferLetterEmail } = require('../utils/email');
const { uploadOnboardingPackage } = require('../services/onboardingDriveUpload');
const { sanitizeOnboardingFormData } = require('../utils/onboardingPayload');

const INVITE_TTL_HOURS = Number(process.env.ONBOARDING_INVITE_TTL_HOURS || 168);
const VERIFICATION_STATUSES = new Set(['pending', 'approved', 'rejected', 'clarification_needed']);

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

/** Normalize onboarding invite candidate type from API body or DB. */
function normalizeInviteCandidateType(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return s === 'experienced' ? 'experienced' : 'fresher';
}

function normalizeVerificationStatus(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'clarification-needed' || s === 'clarification needed') return 'clarification_needed';
  if (VERIFICATION_STATUSES.has(s)) return s;
  return 'pending';
}

function isProvidedVerificationStatus(raw) {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return s === 'clarification-needed' || s === 'clarification needed' || VERIFICATION_STATUSES.has(s);
}

/**
 * Stored invitation.candidateType wins when present in Mongo (fresher | experienced).
 * When the field is missing (legacy invites), fall back to Candidate.candidateType, then expYears.
 */
async function resolveOnboardingCandidateType(email, storedCandidateType) {
  if (storedCandidateType === 'experienced' || storedCandidateType === 'fresher') {
    return storedCandidateType;
  }
  const em = email && String(email).toLowerCase().trim();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return 'fresher';
  try {
    const c = await Candidate.findOne({ email: em }).select('candidateType expYears exp').lean();
    if (c?.candidateType === 'experienced') return 'experienced';
    if (c?.candidateType === 'fresher') return 'fresher';
    const exp = Number(c?.expYears ?? c?.exp);
    if (Number.isFinite(exp) && exp > 0) return 'experienced';
  } catch (e) {
    console.error('[onboarding] resolve candidateType fallback', e instanceof Error ? e.message : e);
  }
  return 'fresher';
}

/**
 * POST /api/onboarding/send-invite
 * Body: { email: string, candidateType?: 'fresher' | 'experienced' }
 */
async function sendInvite(req, res) {
  if (!dbReady(res)) return;

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid candidate email is required' });
  }

  const typeField = req.body?.candidateType ?? req.body?.type;
  const bodyHadType = typeof typeField === 'string' && typeField.trim() !== '';
  let candidateType = bodyHadType ? normalizeInviteCandidateType(typeField) : 'fresher';

  if (!bodyHadType) {
    try {
      const c = await Candidate.findOne({ email }).select('candidateType expYears exp').lean();
      if (c?.candidateType === 'experienced') candidateType = 'experienced';
      else if (c?.candidateType === 'fresher') candidateType = 'fresher';
      else {
        const exp = Number(c?.expYears ?? c?.exp);
        if (Number.isFinite(exp) && exp > 0) candidateType = 'experienced';
      }
    } catch (lookupErr) {
      console.error('[onboarding] candidate lookup for invite', lookupErr instanceof Error ? lookupErr.message : lookupErr);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  let invitation;
  try {
    invitation = await Invitation.create({ email, token, expiresAt, used: false, candidateType });
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
        message: 'Document verification link created; email was not delivered — share the link manually',
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
      message: 'Document verification was not sent — email delivery failed. Configure SMTP in .env or set EMAIL_USE_JSON=true (dev) or ONBOARDING_RETURN_INVITE_LINK_ON_EMAIL_FAILURE=true (dev).',
      detail: mail.error,
    });
  }

  return res.status(201).json({
    message: 'Document verification sent',
    email,
    expiresAt: invitation.expiresAt,
  });
}

/**
 * POST /api/onboarding/send-offer-letter
 * multipart/form-data:
 *  - email: string
 *  - candidateName?: string
 *  - onboardingCandidateId?: string
 *  - attachments: PDF files[]
 */
async function sendOfferLetter(req, res) {
  if (!dbReady(res)) return;

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const candidateName = typeof req.body?.candidateName === 'string' ? req.body.candidateName.trim() : '';
  const onboardingCandidateId =
    typeof req.body?.onboardingCandidateId === 'string' ? req.body.onboardingCandidateId.trim() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid candidate email is required' });
  }

  if (onboardingCandidateId && !mongoose.Types.ObjectId.isValid(onboardingCandidateId)) {
    return res.status(400).json({ message: 'Invalid onboarding candidate id' });
  }

  const attachments = Array.isArray(req.files) ? req.files : [];
  if (!attachments.length) {
    return res.status(400).json({ message: 'At least one offer letter PDF is required' });
  }

  if (onboardingCandidateId) {
    let candidateRow;
    try {
      candidateRow = await OnboardingCandidate.findById(onboardingCandidateId).select('email name verificationStatus').lean();
    } catch (err) {
      console.error('[onboarding] offer letter lookup failed', err instanceof Error ? err.message : err);
      return res.status(500).json({ message: 'Could not validate candidate before sending offer letter' });
    }

    if (!candidateRow) {
      return res.status(404).json({ message: 'Onboarding candidate not found' });
    }
    if (String(candidateRow.email || '').trim().toLowerCase() !== email) {
      return res.status(400).json({ message: 'Email does not match the selected candidate' });
    }
    if (normalizeVerificationStatus(candidateRow.verificationStatus) !== 'approved') {
      return res.status(400).json({ message: 'Offer letter can be sent only for approved candidates' });
    }
  }

  const mail = await sendOfferLetterEmail({
    to: email,
    candidateName,
    attachments,
  });

  if (!mail.ok) {
    return res.status(502).json({
      message: 'Offer letter email was not sent. Configure SMTP in .env or set EMAIL_USE_JSON=true for development.',
      detail: mail.error,
    });
  }

  return res.status(201).json({
    message: 'Offer letter sent successfully',
    email,
    attachmentCount: attachments.length,
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
    return res.status(410).json({ message: 'This document verification link has already been used' });
  }
  if (new Date(doc.expiresAt) <= new Date()) {
    return res.status(410).json({ message: 'This document verification link has expired' });
  }

  let candidateType;
  try {
    candidateType = await resolveOnboardingCandidateType(doc.email, doc.candidateType);
  } catch (e) {
    console.error('[onboarding] validate-token resolve type', e instanceof Error ? e.message : e);
    candidateType = 'fresher';
  }

  return res.json({
    valid: true,
    email: doc.email,
    expiresAt: doc.expiresAt,
    candidateType,
  });
}

/**
 * GET /api/onboarding/submissions
 * Admin/HR: list onboarding submissions with document links.
 */
async function listSubmissions(req, res) {
  if (!dbReady(res)) return;
  const limitRaw = Number(req.query?.limit || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
  const filter = {};
  if (typeof req.query?.verificationStatus === 'string' && isProvidedVerificationStatus(req.query.verificationStatus)) {
    filter.verificationStatus = normalizeVerificationStatus(req.query.verificationStatus);
  }

  try {
    const rows = await OnboardingCandidate.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const submissions = rows.map((r) => ({
      id: String(r._id),
      name: r.name || '',
      email: r.email || '',
      createdAt: r.createdAt,
      applicationMode: r.applicationMode || (r.formData && r.formData.mode) || null,
      verificationStatus: normalizeVerificationStatus(r.verificationStatus),
      verificationNotes: typeof r.verificationNotes === 'string' ? r.verificationNotes : '',
      verificationUpdatedAt: r.verificationUpdatedAt || null,
      verificationUpdatedByName: r.verificationUpdatedByName || '',
      verificationUpdatedByEmail: r.verificationUpdatedByEmail || '',
      documentSlots: Array.isArray(r.documentSlots) ? r.documentSlots : [],
      formData: r.formData || {},
    }));
    return res.json({ submissions });
  } catch (err) {
    console.error('[onboarding] list submissions failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not load document verification submissions' });
  }
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
    return res.status(410).json({ message: 'This document verification link has already been used' });
  }
  if (invitation.expiresAt <= new Date()) {
    return res.status(410).json({ message: 'This document verification link has expired' });
  }
  if (invitation.email.toLowerCase() !== email) {
    return res.status(400).json({ message: 'Email must match the document verification email address' });
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    return res.status(400).json({
      message: 'No documents were uploaded. Please attach required files before submitting.',
    });
  }

  const reserved = new Set(['token', 'name', 'email', 'formData']);
  const extra = { ...req.body };
  for (const k of reserved) delete extra[k];
  const formDataRaw = { ...parseFormDataField(req.body?.formData), ...extra };

  let invTypeRow;
  try {
    invTypeRow = await Invitation.findOne({ token }).select('candidateType').lean();
  } catch (e) {
    console.error('[onboarding] submit lean type lookup', e instanceof Error ? e.message : e);
  }
  let invType;
  try {
    invType = await resolveOnboardingCandidateType(invitation.email, invTypeRow?.candidateType);
  } catch (e) {
    console.error('[onboarding] submit resolve type', e instanceof Error ? e.message : e);
    invType = 'fresher';
  }
  const mode = typeof formDataRaw.mode === 'string' ? formDataRaw.mode.trim().toLowerCase() : '';
  if (mode !== invType) {
    return res.status(400).json({
      message: 'Form type does not match your document verification link. Open the link HR sent you and do not change the application type.',
    });
  }

  const formData = sanitizeOnboardingFormData(formDataRaw);

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
      candidateEmail: email,
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
  const bySlotId = new Map(fileEntries.map((u) => [u.slotId, u]));
  const baseSlots = Array.isArray(formData.documentSlots) ? formData.documentSlots : [];
  const finalDocumentSlots = baseSlots.map((s) => {
    const id = String(s?.id || '').trim();
    const hit = bySlotId.get(id);
    return {
      id,
      label: typeof s?.label === 'string' ? s.label : '',
      uploaded: Boolean(hit),
      originalName: hit?.originalName || '',
      driveFileId: hit?.driveFileId || '',
      fileUrl: hit?.webUrl || '',
      webUrl: hit?.webUrl || '',
      contentType: hit?.contentType || '',
    };
  });
  for (const u of fileEntries) {
    if (!finalDocumentSlots.some((s) => s.id === u.slotId)) {
      finalDocumentSlots.push({
        id: u.slotId,
        label: u.slotId,
        uploaded: true,
        originalName: u.originalName,
        driveFileId: u.driveFileId,
        fileUrl: u.webUrl,
        webUrl: u.webUrl,
        contentType: u.contentType,
      });
    }
  }

  let candidate;
  try {
    candidate = await OnboardingCandidate.create({
      name,
      email,
      applicationMode: formData.mode === 'experienced' ? 'experienced' : 'fresher',
      documentSlots: finalDocumentSlots,
      formData: {
        ...formData,
        documentSlots: finalDocumentSlots,
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
    message: 'Document verification submitted successfully',
    id: candidate._id.toString(),
    documentSlots: candidate.documentSlots,
  });
}

/**
 * PATCH /api/onboarding/submissions/:id/status
 * Admin/HR: update document verification status for a submission.
 */
async function updateSubmissionVerification(req, res) {
  if (!dbReady(res)) return;

  const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Valid submission id is required' });
  }

  const rawStatus = req.body?.verificationStatus ?? req.body?.status;
  if (!isProvidedVerificationStatus(rawStatus)) {
    return res.status(400).json({ message: 'Invalid verification status' });
  }
  const status = normalizeVerificationStatus(rawStatus);

  const notes =
    typeof req.body?.verificationNotes === 'string'
      ? req.body.verificationNotes.trim().slice(0, 2000)
      : typeof req.body?.notes === 'string'
        ? req.body.notes.trim().slice(0, 2000)
        : '';

  let doc;
  try {
    doc = await OnboardingCandidate.findById(id);
  } catch (err) {
    console.error('[onboarding] lookup submission for status update failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not update verification status' });
  }

  if (!doc) {
    return res.status(404).json({ message: 'Submission not found' });
  }

  doc.verificationStatus = status;
  doc.verificationNotes = notes;
  doc.verificationUpdatedAt = new Date();
  doc.verificationUpdatedByName = req.user?.name || req.user?.fullName || '';
  doc.verificationUpdatedByEmail = req.user?.email || '';

  try {
    await doc.save();
  } catch (err) {
    console.error('[onboarding] save submission status failed', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Could not save verification status' });
  }

  return res.json({
    message: 'Verification status updated',
    submission: {
      id: doc._id.toString(),
      verificationStatus: doc.verificationStatus,
      verificationNotes: doc.verificationNotes || '',
      verificationUpdatedAt: doc.verificationUpdatedAt,
      verificationUpdatedByName: doc.verificationUpdatedByName || '',
      verificationUpdatedByEmail: doc.verificationUpdatedByEmail || '',
    },
  });
}

module.exports = {
  sendInvite,
  sendOfferLetter,
  validateToken,
  listSubmissions,
  submitOnboarding,
  updateSubmissionVerification,
};
