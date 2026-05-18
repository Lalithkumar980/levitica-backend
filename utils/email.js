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
  joiningDate,
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
    'We are pleased to offer you the position of "Associate Software Engineer" at Levitica Technologies Pvt. Ltd. Please find your offer letter attached to this email.',
    '',
    `Your skills and background align well with our expectations, and we are confident that you will be a valuable addition to our team. As mentioned in the offer, your joining date is ${joiningDate || '(Date)'}.`,
    '',
    'We kindly request you to carefully review the attached offer letter. If you accept the terms and conditions outlined, please sign the document and send a scanned copy to us at your earliest convenience to confirm your acceptance.',
    '',
    'On-boarding Location:',
    'Your onboarding will take place at the address below. Please report to the location as instructed, where our team will assist you with the process:',
    'Levitica Technologies Pvt. Ltd.',
    '1-90/2/46/1, Sriram Plaza, 2nd Floor',
    'Image Hospital Road, Vittal Rao Nagar',
    'Madhapur, Hyderabad, Telangana – 500081.',
    '',
    'Note: We also request you to carry your original certificates including your 10th and Intermediate mark sheets for verification purposes, along with one set of Xerox copies of all your certificates. Additionally, please bring one passport-size photograph in hard copy and a soft copy of the same.',
    '',
    'Should you have any questions or need any clarification, please feel free to reach out. We will be happy to assist you.',
    '',
    'We look forward to welcoming you to the Levitica family and beginning an exciting journey of growth and innovation together.',
  ].join('\n');

  const html = `
    <p>Dear ${safeCandidateName},</p>
    <p>We are pleased to offer you the position of "Associate Software Engineer" at Levitica Technologies Pvt. Ltd. Please find your offer letter attached to this email.</p>
    <p>Your skills and background align well with our expectations, and we are confident that you will be a valuable addition to our team. As mentioned in the offer, your joining date is <strong>${joiningDate || '(Date)'}</strong>.</p>
    <p>We kindly request you to carefully review the attached offer letter. If you accept the terms and conditions outlined, please sign the document and send a scanned copy to us at your earliest convenience to confirm your acceptance.</p>
    <p><strong>On-boarding Location:</strong><br/>
    Your onboarding will take place at the address below. Please report to the location as instructed, where our team will assist you with the process:<br/>
    <strong>Levitica Technologies Pvt. Ltd.</strong><br/>
    1-90/2/46/1, Sriram Plaza, 2nd Floor<br/>
    Image Hospital Road, Vittal Rao Nagar<br/>
    Madhapur, Hyderabad, Telangana – 500081.</p>
    <p><strong>Note:</strong> We also request you to carry your original certificates including your 10th and Intermediate mark sheets for verification purposes, along with one set of Xerox copies of all your certificates. Additionally, please bring one passport-size photograph in hard copy and a soft copy of the same.</p>
    <p>Should you have any questions or need any clarification, please feel free to reach out. We will be happy to assist you.</p>
    <p>We look forward to welcoming you to the Levitica family and beginning an exciting journey of growth and innovation together.</p>
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