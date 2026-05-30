const { sendMail } = require('./mailer');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const { getDriveClient } = require('../services/googleDriveService');

function logEmail(msg, data) {
  console.log(`[onboarding][email] ${msg}`, data != null ? data : '');
}

/**
 * Send onboarding invite (Resend)
 */
async function sendOnboardingInvite({ to, inviteUrl, candidateName, expiresAt, candidateType }) {
  console.log("Function called", { to });

  const formattedDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '[Date]';

  const isExperienced = candidateType === 'experienced';

  const documentsListText = isExperienced ? [
    '• Aadhaar Card',
    '• PAN Card',
    '• 10th Certificate',
    '• Intermediate / 12th',
    '• Degree / B.Tech',
    '• Higher Education (Optional)',
    '• Passport Photo',
    '• Father / Guardian ID',
    '• Mother ID',
    '• Bank Passbook Front',
    '• Certifications (Optional)',
    '• Experience Letters',
    '• Relieving Letters',
    '• Offer Letters',
    '• Hike Letter (Optional)',
    '• PF Statement',
    '• UAN Card / Number',
    '• Last 3 Payslips',
  ].join('\n') : [
    '• Aadhaar Card',
    '• PAN Card',
    '• 10th Certificate / Memo',
    '• Intermediate / 12th Certificate',
    '• Degree / B.Tech Certificate',
    '• Passport-size Photograph',
    '• Father / Guardian ID Proof',
    '• Bank Passbook Front Page',
    '• Any Relevant Certifications (Optional)',
  ].join('\n');

  const documentsListHtml = isExperienced ? `
    • Aadhaar Card<br/>
    • PAN Card<br/>
    • 10th Certificate<br/>
    • Intermediate / 12th<br/>
    • Degree / B.Tech<br/>
    • Higher Education (Optional)<br/>
    • Passport Photo<br/>
    • Father / Guardian ID<br/>
    • Mother ID<br/>
    • Bank Passbook Front<br/>
    • Certifications (Optional)<br/>
    • Experience Letters<br/>
    • Relieving Letters<br/>
    • Offer Letters<br/>
    • Hike Letter (Optional)<br/>
    • PF Statement<br/>
    • UAN Card / Number<br/>
    • Last 3 Payslips
  ` : `
    • Aadhaar Card<br/>
    • PAN Card<br/>
    • 10th Certificate / Memo<br/>
    • Intermediate / 12th Certificate<br/>
    • Degree / B.Tech Certificate<br/>
    • Passport-size Photograph<br/>
    • Father / Guardian ID Proof<br/>
    • Bank Passbook Front Page<br/>
    • Any Relevant Certifications (Optional)
  `;

  // Fetch Admin branding configuration
  let logoAttachment = null;
  const defaultLogoPath = path.join(__dirname, '../assets/Images/Levitica.png');

  try {
    const admin = await User.findOne({ role: 'Admin' }).lean();
    if (admin && admin.companyLogoFileId) {
      try {
        const drive = await getDriveClient();
        const response = await drive.files.get({
          fileId: admin.companyLogoFileId,
          alt: 'media'
        }, { responseType: 'arraybuffer' });

        logoAttachment = {
          filename: 'logo.png',
          content: Buffer.from(response.data),
          cid: 'companylogo',
        };
      } catch (logoErr) {
        console.error('[email] Failed to fetch custom logo from Google Drive:', logoErr);
      }
    }
  } catch (dbErr) {
    console.error('[email] Failed to query Admin user for branding:', dbErr);
  }

  if (!logoAttachment) {
    logoAttachment = {
      filename: 'logo.png',
      content: fs.readFileSync(defaultLogoPath),
      cid: 'companylogo',
    };
  }

  const text = [
    `Dear ${candidateName || 'Candidate'},`,
    '',
    'Greetings from Levitica Technologies Pvt Ltd!',
    '',
    'We are pleased to inform you that you are being considered for an opportunity with our organization.',
    '',
    `To proceed further with your onboarding and offer letter process, we request you to complete the Candidate Onboarding Form and upload the required documents using the secure invitation link provided below on or before ${formattedDate}.`,
    '',
    'Required Documents:',
    documentsListText,
    '',
    'Document Verification Form Link:',
    inviteUrl,
    '',
    'Please ensure that all uploaded documents are clear and valid. Your information and uploads will be securely stored for HR verification purposes.',
    '',
    'If you have any questions or require assistance while filling out the form, please feel free to contact us.',
    '',
    'Email: info@leviticatechnologies.com',
    'Phone: +91 9032503559',
    '',
    'We look forward to receiving your submission and welcoming you to Levitica Technologies Pvt Ltd.',
    '',
    'BEST REGARDS,',
    'HR Team',
    'Levitica Technologies Pvt Ltd',
    'Email: info@leviticatechnologies.com',
    'Phone: +91 9032503559',
  ].join('\n');

  const html = `
    <p>Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
    <p>Greetings from <strong>Levitica Technologies Pvt Ltd!</strong></p>
    <p>We are pleased to inform you that you are being considered for an opportunity with our organization.</p>
    <p>To proceed further with your onboarding and offer letter process, we request you to complete the Candidate Onboarding Form and upload the required documents using the secure invitation link provided below on or before <strong>${formattedDate}</strong>.</p>
    <p><strong>Required Documents:</strong><br/>
    ${documentsListHtml}</p>
    <p><strong>Document Verification Form Link:</strong><br/>
    <a href="${inviteUrl}">${inviteUrl}</a></p>
    <p>Please ensure that all uploaded documents are clear and valid. Your information and uploads will be securely stored for HR verification purposes.</p>
    <p>If you have any questions or require assistance while filling out the form, please feel free to contact us.</p>
    <p>Email: <a href="mailto:info@leviticatechnologies.com">info@leviticatechnologies.com</a><br/>
    Phone: +91 9032503559</p>
    <p>We look forward to receiving your submission and welcoming you to Levitica Technologies Pvt Ltd.</p>
    <p>BEST REGARDS,</p>
    <p style="text-align: left;">
      <img src="cid:companylogo" alt="Company Logo" width="130" style="border: none; display: inline-block; pointer-events: none; user-select: none;" />
    </p>
    <p>
      HR Team<br/>
      Levitica Technologies Pvt Ltd<br/>
      Email: info@leviticatechnologies.com<br/>
      Phone: +91 9032503559
    </p>
  `;

  try {
    const result = await sendMail({
      from: process.env.MAIL_FROM || 'info@leviticatechnologies.com',
      to,
      subject:
        process.env.ONBOARDING_INVITE_SUBJECT ||
        'Complete your document verification',
      text,
      html,
      attachments: [logoAttachment],
    });

    if (!result.ok) {
      console.error("❌ SMTP ERROR:", result.error);
      logEmail('smtp failed', { to, provider: 'smtp', error: result.error });
      return { ok: false, error: result.error || 'SMTP failed to send email' };
    }

    console.log("SMTP SUCCESS:", result.messageId, "IMAP appended:", result.imap);
    logEmail('invite sent via smtp/imap', { to, provider: 'smtp', messageId: result.messageId, imapAppended: result.imap });
    return { ok: true, messageId: result.messageId, provider: 'smtp' };
  } catch (err) {
    console.error("❌ CRITICAL SMTP ERROR:", err);
    const message = err instanceof Error ? err.message : String(err);
    logEmail('smtp exception', { to, error: message });
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
  role,
  attachments = [],
}) {
  const from = process.env.MAIL_FROM || 'info@leviticatechnologies.com';

  const safeCandidateName =
    typeof candidateName === 'string' && candidateName.trim()
      ? candidateName.trim()
      : 'Candidate';

  const safeRole =
    typeof role === 'string' && role.trim()
      ? role.trim()
      : 'Associate Software Engineer';

  const subject =
    process.env.OFFER_LETTER_SUBJECT ||
    'Offer Letter | Levitica Technologies Pvt. Ltd.';

  // Fetch Admin branding configuration
  let logoAttachment = null;
  const defaultLogoPath = path.join(__dirname, '../assets/Images/Levitica.png');

  try {
    const admin = await User.findOne({ role: 'Admin' }).lean();
    if (admin && admin.companyLogoFileId) {
      try {
        const drive = await getDriveClient();
        const response = await drive.files.get({
          fileId: admin.companyLogoFileId,
          alt: 'media'
        }, { responseType: 'arraybuffer' });

        logoAttachment = {
          filename: 'logo.png',
          content: Buffer.from(response.data),
          cid: 'companylogo',
        };
      } catch (logoErr) {
        console.error('[email] Failed to fetch custom logo from Google Drive:', logoErr);
      }
    }
  } catch (dbErr) {
    console.error('[email] Failed to query Admin user for branding:', dbErr);
  }

  if (!logoAttachment) {
    logoAttachment = {
      filename: 'logo.png',
      content: fs.readFileSync(defaultLogoPath),
      cid: 'companylogo',
    };
  }

  const text = [
    `Dear ${safeCandidateName},`,
    '',
    `We are pleased to offer you the position of "${safeRole}" at Levitica Technologies Pvt. Ltd. Please find your offer letter attached to this email.`,
    '',
    `Your skills and background align well with our expectations, and we are confident that you will be a valuable addition to our team. As mentioned in the offer, your joining date is ${joiningDate || '(Date)'}.`,
    '',
    'We kindly request you to carefully review the attached offer letter. If you accept the terms and conditions outlined, please sign the document and send a scanned copy to us at your earliest convenience to confirm your acceptance.',
    '',
    'On-boarding Location:',
    'Your onboarding will take place at the address below. Please report to the location as instructed, where our team will assist you with the process:',
    'Levitica Technologies Pvt. Ltd.',
    'S2,C9WP+68 Techno Park,5th Floor',
    'Capital Pk Rd, VIP Hills,Silicon Valley',
    'Madhapur, Hyderabad, Telangana – 500081.',
    '',
    'Note: We also request you to carry your original certificates including your 10th and Intermediate mark sheets for verification purposes, along with one set of Xerox copies of all your certificates. Additionally, please bring one passport-size photograph in hard copy and a soft copy of the same.',
    '',
    'Should you have any questions or need any clarification, please feel free to reach out. We will be happy to assist you.',
    '',
    'We look forward to welcoming you to the Levitica family and beginning an exciting journey of growth and innovation together.',
    '',
    'BEST REGARDS,',
    'HR Team',
    'Levitica Technologies Pvt Ltd',
    'Email: info@leviticatechnologies.com',
    'Phone: +91 9032503559',
  ].join('\n');

  const html = `
    <p>Dear <strong>${safeCandidateName}</strong>,</p>
    <p>We are pleased to offer you the position of "<strong>${safeRole}</strong>" at <strong>Levitica Technologies Pvt. Ltd.</strong> Please find your offer letter attached to this email.</p>
    <p>Your skills and background align well with our expectations, and we are confident that you will be a valuable addition to our team. As mentioned in the offer, your joining date is <strong>${joiningDate || '(Date)'}</strong>.</p>
    <p>We kindly request you to carefully review the attached offer letter. If you accept the terms and conditions outlined, please sign the document and send a scanned copy to us at your earliest convenience to confirm your acceptance.</p>
    <p><strong>On-boarding Location:</strong><br/>
    Your onboarding will take place at the address below. Please report to the location as instructed, where our team will assist you with the process:<br/>
    <strong>Levitica Technologies Pvt. Ltd.</strong><br/>
    S2,C9WP+68 Techno Park,5th Floor<br/>
    Capital Pk Rd, VIP Hills,Silicon Valley<br/>
    Madhapur, Hyderabad, Telangana – 500081.</p>
    <p><strong>Note:</strong> We also request you to carry your original certificates including your 10th and Intermediate mark sheets for verification purposes, along with one set of Xerox copies of all your certificates. Additionally, please bring one passport-size photograph in hard copy and a soft copy of the same.</p>
    <p>Should you have any questions or need any clarification, please feel free to reach out. We will be happy to assist you.</p>
    <p>We look forward to welcoming you to the Levitica family and beginning an exciting journey of growth and innovation together.</p>
    <p>BEST REGARDS,</p>
    <p style="text-align: left;">
      <img src="cid:companylogo" alt="Company Logo" width="130" style="border: none; display: inline-block; pointer-events: none; user-select: none;" />
    </p>
    <p>
      HR Team<br/>
      Levitica Technologies Pvt Ltd<br/>
      Email: info@leviticatechnologies.com<br/>
      Phone: +91 9032503559
    </p>
  `;

  const normalizedAttachments = attachments.map((file, index) => ({
    filename:
      file.filename ||
      file.originalname ||
      `offer-letter-${index + 1}.pdf`,
    content: file.buffer,
    contentType: file.mimetype || 'application/pdf',
  }));

  try {
    const result = await sendMail({
      from: process.env.MAIL_FROMS || from,
      to,
      subject,
      text,
      html,
      attachments: [logoAttachment, ...normalizedAttachments],
    });

    if (!result.ok) {
      console.error("❌ SMTP ERROR:", result.error);
      logEmail('smtp failed', { to, provider: 'smtp', error: result.error });
      return { ok: false, error: result.error || 'SMTP failed to send email' };
    }

    console.log("SMTP SUCCESS:", result.messageId, "IMAP appended:", result.imap);
    logEmail('offer letter sent via smtp/imap', { to, provider: 'smtp', messageId: result.messageId, imapAppended: result.imap });
    return { ok: true, messageId: result.messageId, provider: 'smtp' };
  } catch (err) {
    console.error("❌ CRITICAL SMTP ERROR:", err);
    const message = err instanceof Error ? err.message : String(err);
    logEmail('smtp exception', { to, error: message });
    return { ok: false, error: message };
  }
}

module.exports = {
  sendOnboardingInvite,
  sendOfferLetterEmail,
};