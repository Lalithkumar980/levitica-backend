/**
 * test-email-smtp.js
 *
 * Verifies email delivery via SMTP and append via IMAP, saving logs to imap-test-log.txt.
 */

const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, 'imap-test-log.txt');

// Ensure log file is clean
fs.writeFileSync(logFile, `=== TEST RUN AT ${new Date().toISOString()} ===\n`);

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
  originalLog.apply(console, args);
  fs.appendFileSync(logFile, args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

console.error = function(...args) {
  originalError.apply(console, args);
  fs.appendFileSync(logFile, 'ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

console.warn = function(...args) {
  originalWarn.apply(console, args);
  fs.appendFileSync(logFile, 'WARN: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

// Load environment variables
require('dotenv').config();

console.log('Loaded SMTP host:', process.env.SMTP_HOST);
console.log('Loaded SMTP user:', process.env.SMTP_USER);

const { sendMail } = require('./utils/mailer');

async function runTest() {
  const testRecipient = 'info@leviticatechnologies.com';
  const subject = `Test Email - SMTP + IMAP - ${new Date().toISOString()}`;
  
  console.log(`Sending test email to ${testRecipient}...`);
  
  const result = await sendMail({
    to: testRecipient,
    subject: subject,
    text: 'Hello, this is a test of SMTP email sending with automatic IMAP Sent-folder append.',
    html: '<p>Hello, this is a <strong>test</strong> of SMTP email sending with automatic <strong>IMAP Sent-folder append</strong>.</p>',
  });
  
  console.log('Test result:', result);
  
  if (result.ok) {
    console.log('✅ SMTP Mail sent successfully. Message ID:', result.messageId);
    if (result.imap) {
      console.log('✅ IMAP Append succeeded. Check your Sent folder!');
    } else {
      console.warn('⚠️ IMAP Append failed or skipped.');
    }
  } else {
    console.error('❌ SMTP Mail send failed:', result.error);
  }
}

runTest().catch(err => {
  console.error('Uncaught error in test script:', err);
});
