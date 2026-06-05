const { sendMail } = require('./utils/mailer');
require('dotenv').config();

async function run() {
  console.log('Sending test email with attachment...');
  const res = await sendMail({
    to: 'info@leviticatechnologies.com', // user's email might be different, let's use a dummy or let them run it
    subject: 'Test Attachment',
    text: 'Please find the attached file.',
    attachments: [
      {
        filename: 'test.txt',
        content: Buffer.from('Hello world! This is a test file.', 'utf8'),
        contentType: 'text/plain'
      }
    ]
  });
  console.log(res);
}

run().catch(console.error);
