/**
 * mailer.js — Production-ready Nodemailer + IMAP Sent-folder append
 *
 * Flow:
 *   1. Build the raw RFC-822 message via nodemailer (without sending)
 *   2. Send via SMTP using nodemailer's sendMail()
 *   3. Append the same raw bytes to the IMAP "Sent" folder via imapflow
 *
 * Packages required:
 *   npm install nodemailer imapflow
 *
 * Environment variables (already present in your .env):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *   MAIL_FROM   — display name + address used as the From header
 *
 * Optional:
 *   IMAP_HOST   — defaults to SMTP_HOST
 *   IMAP_PORT   — defaults to 993
 *   IMAP_USER   — defaults to SMTP_USER
 *   IMAP_PASS   — defaults to SMTP_PASS
 *   IMAP_SENT_FOLDER — defaults to "Sent"  (use "Sent Items" for Outlook)
 */

'use strict';

const nodemailer  = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { ImapFlow } = require('imapflow');

// ─── SMTP transporter ────────────────────────────────────────────────────────

/**
 * Create and cache the SMTP transporter.
 * Using a module-level singleton avoids recreating the connection pool
 * on every call.
 */
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const port   = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false'; // true by default

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port,
    secure,                    // true = TLS from the start (port 465)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Increase timeouts for slow SMTP servers
    connectionTimeout: 15_000,
    greetingTimeout:   10_000,
    socketTimeout:     30_000,
    // Pool keeps connections alive for burst sends
    pool:            true,
    maxConnections:  3,
    maxMessages:     100,
    tls: {
      // Allow self-signed certs on custom hosting (set to true in prod
      // only if you trust the host — leviticatechnologies.com uses a valid cert)
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
  });

  return _transporter;
}

// ─── IMAP helpers ─────────────────────────────────────────────────────────────

/**
 * Build a short-lived ImapFlow client.
 * We open + close it per operation to avoid keeping long-lived idle
 * connections (acceptable for low-volume sent-folder appends).
 */
function createImapClient() {
  const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  return new ImapFlow({
    host,
    port,
    secure: true,          // IMAPS (port 993) — always TLS
    auth: { user, pass },
    logger: console,         // set to console to debug IMAP traffic
    tls: {
      rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

/**
 * Known Sent-folder names for common mail servers.
 * We try these in order if the configured name does not exist.
 */
const SENT_FOLDER_CANDIDATES = [
  'Sent',
  'Sent Items',         // Outlook / Exchange
  'Sent Messages',      // Apple Mail
  '[Gmail]/Sent Mail',  // Gmail
  'INBOX.Sent',         // Courier IMAP
];

/**
 * Find the Sent folder — use configured name first, then fall back to
 * common alternatives, then create one if nothing exists.
 *
 * @param {ImapFlow} client   — connected + authenticated client
 * @returns {string}            folder path that exists on the server
 */
async function resolveSentFolder(client) {
  const preferred = process.env.IMAP_SENT_FOLDER || 'Sent';
  const candidates = [preferred, ...SENT_FOLDER_CANDIDATES.filter(f => f !== preferred)];

  // List all mailboxes once
  const mailboxes = new Set();
  const list = await client.list();
  for (const mb of list) {
    console.log(`  - Path: "${mb.path}" (Name: "${mb.name || ''}", SpecialUse: "${mb.specialUse || ''}")`);
    mailboxes.add(mb.path);
    // Some servers return name only; normalise both
    if (mb.name && mb.name !== mb.path) mailboxes.add(mb.name);
  }

  for (const name of candidates) {
    if (mailboxes.has(name)) {
      console.log(`[mailer][imap] Resolved Sent folder to: "${name}"`);
      return name;
    }
  }

  // No Sent folder found — create the preferred one
  console.log(`[mailer][imap] No matching Sent folder found. Creating "${preferred}" folder…`);
  await client.mailboxCreate(preferred);
  return preferred;
}

/**
 * Append raw RFC-822 message bytes into the Sent folder.
 *
 * @param {Buffer} rawMessage   — output of nodemailer's `compile().build()`
 * @returns {boolean}             true on success, false on non-fatal error
 */
async function appendToSent(rawMessage) {
  const client = createImapClient();

  // Register an error handler to prevent uncaught exception crashes
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
    // Non-fatal: email was already sent — just log the IMAP failure
    console.error('[mailer][imap] ❌ Failed to append to Sent folder:', err.message || err);
    return false;

  } finally {
    // Always close — even if append threw
    try { await client.logout(); } catch (_) {}
  }
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * sendMail — send an email and save a copy in the Sent folder.
 *
 * @param {object} options
 * @param {string|string[]}  options.to           Recipient(s)
 * @param {string}           options.subject      Subject line
 * @param {string}           [options.text]       Plain-text body
 * @param {string}           [options.html]       HTML body (takes priority)
 * @param {string}           [options.from]       Override From (default: MAIL_FROM env)
 * @param {string|string[]}  [options.cc]         CC recipient(s)
 * @param {string|string[]}  [options.bcc]        BCC recipient(s)
 * @param {string|string[]}  [options.replyTo]    Reply-To address(es)
 * @param {object[]}         [options.attachments] Nodemailer attachment objects
 * @param {boolean}          [options.skipImap]   Set true to skip Sent-folder append
 *
 * @returns {{ ok: boolean, messageId?: string, imap?: boolean, error?: string }}
 *
 * Attachment object shape (nodemailer standard):
 *   { filename, content (Buffer|string|Stream), path, contentType, cid, encoding }
 *
 * Examples:
 *   // File from disk
 *   { filename: 'report.pdf', path: '/tmp/report.pdf' }
 *
 *   // Buffer (e.g. from multer)
 *   { filename: 'offer.pdf', content: req.file.buffer, contentType: 'application/pdf' }
 *
 *   // Inline image referenced in HTML as <img src="cid:logo">
 *   { filename: 'logo.png', content: fs.readFileSync(logoPath), cid: 'logo' }
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
  // ── 1. Build the mail options ──────────────────────────────────────────
  const mailOptions = {
    from:    from || process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    ...(text       ? { text }        : {}),
    ...(html       ? { html }        : {}),
    ...(cc         ? { cc }          : {}),
    ...(bcc        ? { bcc }         : {}),
    ...(replyTo    ? { replyTo }     : {}),
    ...(attachments.length ? { attachments } : {}),
  };

  // ── 2. Compile to raw RFC-822 bytes BEFORE sending ────────────────────
  let rawMessage = null;
  try {
    const composer = new MailComposer(mailOptions);
    rawMessage = await new Promise((resolve, reject) => {
      composer.compile().build((err, buf) => (err ? reject(err) : resolve(buf)));
    });
  } catch (buildErr) {
    console.warn('[mailer] Could not pre-build raw message:', buildErr.message);
    // Continue — we will still send, just won't be able to append
  }

  // ── 3. Send via SMTP ──────────────────────────────────────────────────
  let info;
  try {
    info = await getTransporter().sendMail(mailOptions);
    console.log(`[mailer][smtp] ✅ Sent  to=${Array.isArray(to) ? to.join(', ') : to}  messageId=${info.messageId}`);
  } catch (smtpErr) {
    const message = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
    console.error('[mailer][smtp] ❌ Send failed:', message);
    return { ok: false, error: message };
  }

  // ── 4. Append to Sent folder via IMAP ────────────────────────────────
  let imapOk = false;
  if (!skipImap && rawMessage) {
    imapOk = await appendToSent(rawMessage);
  }

  return {
    ok:        true,
    messageId: info.messageId,
    imap:      imapOk,
  };
}

// ─── Graceful shutdown helper ─────────────────────────────────────────────────

/**
 * Call this on process exit to cleanly close the SMTP connection pool.
 */
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
