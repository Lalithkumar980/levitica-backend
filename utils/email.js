const { Resend } = require('resend');

function logEmail(msg, data) {
  console.log(`[onboarding][email] ${msg}`, data != null ? data : '');
}

/**
 * Resend setup
 */
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send onboarding invite (Resend)
 */
async function sendOnboardingInvite({ to, inviteUrl }) {
  console.log("Function called", { to });
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.MAIL_FROM || 'info@leviticatechnologies.com',
      to,
      subject:
        process.env.ONBOARDING_INVITE_SUBJECT ||
        'Complete your document verification',
      html: `
        <p>You have been invited to complete document verification.</p>
        <p><a href="${inviteUrl}">Open document verification form</a></p>
        <p style="color:#666;font-size:12px;">
          If the link does not work, copy and paste:<br/>${inviteUrl}
        </p>
      `,
    });

    if (error) {
      console.error("❌ RESEND ERROR:", error);
      logEmail('resend failed', { to, error: error.message || error });
      return { ok: false, error: error.message || 'Resend failed to send email' };
    }

    console.log("RESEND SUCCESS:", data);
    logEmail('invite sent via resend', { to, id: data.id });
    return { ok: true, messageId: data.id };
  } catch (err) {
    console.error("❌ CRITICAL RESEND ERROR:", err);
    const message = err instanceof Error ? err.message : String(err);
    logEmail('resend exception', { to, error: message });
    return { ok: false, error: message };
  }
}

/**
 * Send offer letter (Resend)
 */
async function sendOfferLetterEmail({
  to,
  candidateName,
  attachments = [],
}) {
  const from = process.env.MAIL_FROM || 'info@leviticatechnologies.com';

  const safeCandidateName =
    typeof candidateName === 'string' && candidateName.trim()
      ? candidateName.trim()
      : 'Candidate';

  const subject =
    process.env.OFFER_LETTER_SUBJECT ||
    'Offer Letter | Levitica Technologies Pvt. Ltd.';

  const text = [
    `Dear ${safeCandidateName},`,
    '',
    'Please find your offer letter attached to this email.',
    '',
    'Review the attached documents carefully. If you have any questions, please reply to this email.',
    '',
    'Best regards,',
    'HR Team',
    'Levitica Technologies Pvt. Ltd.',
  ].join('\n');

  const html = `
    <p>Dear ${safeCandidateName},</p>
    <p>Please find your offer letter attached to this email.</p>
    <p>Review the attached documents carefully. If you have any questions, please reply to this email.</p>
    <p>Best regards,<br/>HR Team<br/>Levitica Technologies Pvt. Ltd.</p>
  `;

  const normalizedAttachments = attachments.map((file, index) => ({
    filename:
      file.filename ||
      file.originalname ||
      `offer-letter-${index + 1}.pdf`,
    content: file.buffer.toString('base64'),
    type: file.mimetype || 'application/pdf',
  }));

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
      attachments: normalizedAttachments,
    });

    if (error) {
      console.error("❌ RESEND ERROR:", error);
      logEmail('resend failed', { to, error: error.message || error });
      return { ok: false, error: error.message || 'Resend failed to send email' };
    }

    console.log("RESEND SUCCESS:", data);
    logEmail('offer letter sent via resend', { to, id: data.id });
    return { ok: true, messageId: data.id };
  } catch (err) {
    console.error("❌ CRITICAL RESEND ERROR:", err);
    const message = err instanceof Error ? err.message : String(err);
    logEmail('resend exception', { to, error: message });
    return { ok: false, error: message };
  }
}

module.exports = {
  sendOnboardingInvite,
  sendOfferLetterEmail,
};