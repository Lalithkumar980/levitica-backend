/**
 * mailer.js — Production-ready email sender
 *
 * Sending strategy (auto-detected):
 *   1. If RESEND_API_KEY is set → send via Resend API (HTTPS port 443)
 *      Works in ALL cloud hosting environments (Render, Railway, Heroku, etc.)
 *   2. Otherwise → send via SMTP using nodemailer (requires port 465/587 open)
 *
 * After sending (either way), the raw message is appended to the IMAP Sent folder
 * so it appears in your mail client's Sent Items.
 *
 * Environment variables:
 *   RESEND_API_KEY  — Resend API key (preferred for deployed environments)
 *   MAIL_FROM       — From address/display name  e.g. "Name <email@domain.com>"
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS  (fallback SMTP)
 *
 *   IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS  (optional, defaults to SMTP values)
 *   IMAP_SENT_FOLDER  (optional, defaults to "Sent")
 */

'use strict';

const nodemailer   = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { ImapFlow } = require('imapflow');

// ─── Resend SDK (lazy-loaded so SMTP-only setups don't need it) ───────────────

let _resendClient = null;

function getResendClient() {
  if (_resendClient) return _resendClient;
  const { Resend } = require('resend');
  _resendClient = new Resend(process.env.RESEND_API_KEY);
  return _resendClient;
}

// ─── SMTP transporter ────────────────────────────────────────────────────────

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const port   = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false';

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 15_000,
    greetingTimeout:   10_000,
    socketTimeout:     30_000,
    pool:           true,
    maxConnections: 3,
    maxMessages:    100,
    tls: {
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
  });

  return _transporter;
}

// ─── IMAP helpers ─────────────────────────────────────────────────────────────

function createImapClient() {
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  return new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,   // set to console for verbose IMAP debug output
    tls: {
      rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

const SENT_FOLDER_CANDIDATES = [
  'Sent',
  'INBOX.Sent',
  'Sent Items',
  'Sent Messages',
  '[Gmail]/Sent Mail',
  'INBOX.Sent',
];

async function resolveSentFolder(client) {
  const preferred  = process.env.IMAP_SENT_FOLDER || 'Sent';
  const candidates = [preferred, ...SENT_FOLDER_CANDIDATES.filter(f => f !== preferred)];

  const mailboxes = new Set();
  const list = await client.list();
  for (const mb of list) {
    mailboxes.add(mb.path);
    if (mb.name && mb.name !== mb.path) mailboxes.add(mb.name);
  }

  for (const name of candidates) {
    if (mailboxes.has(name)) {
      console.log(`[mailer][imap] Resolved Sent folder: "${name}"`);
      return name;
    }
  }

  console.log(`[mailer][imap] No Sent folder found — creating "${preferred}"…`);
  await client.mailboxCreate(preferred);
  return preferred;
}

async function appendToSent(rawMessage) {
  if (!rawMessage) return false;

  const client = createImapClient();

  client.on('error', (err) => {
    console.error('[mailer][imap] Async client error:', err.message || err);
  });

  try {
    await client.connect();
    const sentFolder = await resolveSentFolder(client);
    await client.append(sentFolder, rawMessage, ['\\Seen'], new Date());
    console.log(`[mailer][imap] ✅ Message appended to "${sentFolder}"`);
    return true;
  } catch (err) {
    console.error('[mailer][imap] ❌ Failed to append to Sent folder:', err.message || err);
    return false;
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}

// ─── Build raw RFC-822 bytes (needed for IMAP append) ─────────────────────────

async function buildRawMessage(mailOptions) {
  try {
    const composer = new MailComposer(mailOptions);
    return await new Promise((resolve, reject) => {
      composer.compile().build((err, buf) => (err ? reject(err) : resolve(buf)));
    });
  } catch (err) {
    console.warn('[mailer] Could not build raw message for IMAP append:', err.message);
    return null;
  }
}

// ─── Resend API sender ─────────────────────────────────────────────────────────

/**
 * Convert nodemailer-style attachments → Resend attachment format.
 * Resend expects: { filename, content (Buffer|string), contentType }
 */
function convertAttachmentsForResend(attachments) {
  return attachments.map(a => {
    const obj = {
      filename:    a.filename || 'attachment',
      content:     a.content  || a.path,
      contentType: a.contentType || a.mimetype || 'application/octet-stream',
    };
    if (a.cid) {
      obj.contentId = a.cid;
    }
    return obj;
  });
}

async function sendViaResend(mailOptions) {
  const resend = getResendClient();

  const payload = {
    from:    mailOptions.from,
    to:      Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
    subject: mailOptions.subject,
    ...(mailOptions.text ? { text: mailOptions.text } : {}),
    ...(mailOptions.html ? { html: mailOptions.html } : {}),
    ...(mailOptions.cc   ? { cc:   Array.isArray(mailOptions.cc) ? mailOptions.cc : [mailOptions.cc] } : {}),
    ...(mailOptions.bcc  ? { bcc:  Array.isArray(mailOptions.bcc) ? mailOptions.bcc : [mailOptions.bcc] } : {}),
  };

  // Add non-inline attachments
  if (mailOptions.attachments && mailOptions.attachments.length > 0) {
    const resendAttachments = convertAttachmentsForResend(mailOptions.attachments);
    if (resendAttachments.length > 0) {
      payload.attachments = resendAttachments;
    }
  }

  const { data, error } = await resend.emails.send(payload);

  if (error) {
    const errMsg = error.message || JSON.stringify(error);
    console.error('[mailer][resend] ❌ Send failed:', errMsg);
    return { ok: false, error: errMsg };
  }

  const messageId = data?.id ? `<${data.id}@resend.dev>` : `<resend-${Date.now()}@leviticatechnologies.com>`;
  console.log(`[mailer][resend] ✅ Sent  to=${Array.isArray(mailOptions.to) ? mailOptions.to.join(', ') : mailOptions.to}  id=${data?.id}`);
  return { ok: true, messageId };
}

// ─── Core sendMail function ───────────────────────────────────────────────────

/**
 * sendMail — send an email and save a copy in the Sent folder.
 *
 * Auto-detects the sending method:
 *   - RESEND_API_KEY set → Resend API (works in ALL deployments, port 443)
 *   - Otherwise         → SMTP nodemailer (requires port 465/587 open)
 *
 * @param {object} options
 * @param {string|string[]}  options.to           Recipient(s)
 * @param {string}           options.subject      Subject line
 * @param {string}           [options.text]       Plain-text body
 * @param {string}           [options.html]       HTML body
 * @param {string}           [options.from]       Override From address
 * @param {string|string[]}  [options.cc]         CC recipient(s)
 * @param {string|string[]}  [options.bcc]        BCC recipient(s)
 * @param {string|string[]}  [options.replyTo]    Reply-To address(es)
 * @param {object[]}         [options.attachments] Nodemailer attachment objects
 * @param {boolean}          [options.skipImap]   Set true to skip Sent-folder append
 *
 * @returns {{ ok: boolean, messageId?: string, imap?: boolean, error?: string }}
 */
async function sendMail({
  to,
  subject,
  text,
  html,
  from,
  cc,
  bcc,
  replyTo,
  attachments = [],
  skipImap   = false,
}) {
  const useResend = Boolean(process.env.RESEND_API_KEY);

  // ── 1. Build the mail options ──────────────────────────────────────────
  const mailOptions = {
    from:    from || process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    ...(text        ? { text }        : {}),
    ...(html        ? { html }        : {}),
    ...(cc          ? { cc }          : {}),
    ...(bcc         ? { bcc }         : {}),
    ...(replyTo     ? { replyTo }     : {}),
    ...(attachments.length ? { attachments } : {}),
  };

  // ── 2. Build raw RFC-822 bytes for IMAP append ────────────────────────
  let rawMessage = null;
  if (!skipImap) {
    rawMessage = await buildRawMessage(mailOptions);
  }

  // ── 3. Send the email ─────────────────────────────────────────────────
  let sendResult;
  if (useResend) {
    console.log('[mailer] Using Resend API for sending...');
    sendResult = await sendViaResend(mailOptions);
  } else {
    console.log('[mailer] Using SMTP for sending...');
    try {
      const info = await getTransporter().sendMail(mailOptions);
      console.log(`[mailer][smtp] ✅ Sent  to=${Array.isArray(to) ? to.join(', ') : to}  messageId=${info.messageId}`);
      sendResult = { ok: true, messageId: info.messageId };
    } catch (smtpErr) {
      const message = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      console.error('[mailer][smtp] ❌ Send failed:', message);
      sendResult = { ok: false, error: message };
    }
  }

  if (!sendResult.ok) {
    return sendResult;
  }

  // ── 4. Append to IMAP Sent folder ─────────────────────────────────────
  let imapOk = false;
  if (!skipImap && rawMessage) {
    imapOk = await appendToSent(rawMessage);
  }

  return {
    ok:        true,
    messageId: sendResult.messageId,
    imap:      imapOk,
  };
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function closeTransporter() {
  if (_transporter) {
    _transporter.close();
    _transporter = null;
  }
}

process.on('SIGTERM', closeTransporter);
process.on('SIGINT',  closeTransporter);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sendMail,
  appendToSent,
  closeTransporter,
};
