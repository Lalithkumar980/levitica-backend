/**
 * check-sent.js
 *
 * Connects to the IMAP server, opens the Sent folder,
 * and lists the last 5 emails to verify if they exist on the server.
 */

const { ImapFlow } = require('imapflow');
require('dotenv').config();

const host = process.env.IMAP_HOST || process.env.SMTP_HOST;
const port = parseInt(process.env.IMAP_PORT || '993', 10);
const user = process.env.IMAP_USER || process.env.SMTP_USER;
const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;

console.log('Connecting to IMAP server:', host);
console.log('User:', user);

const client = new ImapFlow({
  host,
  port,
  secure: true,
  auth: { user, pass },
  tls: {
    rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED !== 'false',
  },
});

async function main() {
  await client.connect();
  console.log('✅ Connected and authenticated successfully!');

  // Open the Sent folder
  // We check for 'INBOX.Sent' first, as it was resolved previously
  const folderPath = 'INBOX.Sent';
  let mailbox = await client.mailboxOpen(folderPath);
  console.log(`\nOpen Mailbox: ${folderPath}`);
  console.log(`Total messages in server Sent folder: ${mailbox.exists}`);

  if (mailbox.exists > 0) {
    console.log('\nListing the last 5 messages in Sent folder:');
    
    // Fetch envelope info for the last 5 messages
    const startRange = Math.max(1, mailbox.exists - 4);
    const range = `${startRange}:${mailbox.exists}`;
    
    for await (const message of client.fetch(range, { envelope: true })) {
      const date = message.envelope.date;
      const subject = message.envelope.subject;
      const to = message.envelope.to.map(t => `${t.name || ''} <${t.address}>`).join(', ');
      console.log(`- UID: ${message.uid}`);
      console.log(`  Date: ${date}`);
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log('--------------------------------------------------');
    }
  } else {
    console.log('The Sent folder is empty on the server!');
  }

  await client.logout();
}

main().catch(err => {
  console.error('❌ Error checking Sent folder:', err);
  client.logout().catch(() => {});
});
