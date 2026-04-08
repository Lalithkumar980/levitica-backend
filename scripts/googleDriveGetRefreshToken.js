/**
 * One-time OAuth helper: obtain GOOGLE_REFRESH_TOKEN for server-side Drive uploads.
 *
 * Prerequisite: .env has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 * (redirect URI must match an "Authorized redirect URI" in Google Cloud Console).
 *
 * Run: npm run google:auth
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');
const { google } = require('googleapis');

function trim(v) {
  if (v == null) return '';
  return String(v).trim().replace(/^["']|["']$/g, '');
}

const clientId = trim(process.env.GOOGLE_CLIENT_ID);
const clientSecret = trim(process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = trim(process.env.GOOGLE_REDIRECT_URI);

if (!clientId || !clientSecret || !redirectUri) {
  console.error('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env first.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n1) Open this URL in a browser (signed in as the Google account that will own uploads):\n');
console.log(authUrl);
console.log('\n2) After consent, you will be redirected. Copy the FULL redirect URL from the address bar.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste redirect URL (or paste only the ?code=... value): ', async (line) => {
  rl.close();
  const input = line.trim();
  let code = input;
  try {
    const u = new URL(input);
    code = u.searchParams.get('code') || input;
  } catch {
    /* raw code */
  }

  if (!code) {
    console.error('No authorization code found.');
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.error(
        'No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and run again with prompt=consent (this script already sets prompt).',
      );
      console.log('Tokens received:', Object.keys(tokens));
      process.exit(1);
    }
    console.log('\nAdd this to your .env (keep secret):\n');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (e) {
    console.error('Token exchange failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
});
