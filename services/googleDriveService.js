/**
 * Google Drive API integration (OAuth2 refresh token).
 * Uploads files, ensures folders exist, sets link sharing (anyone with link can view).
 */

const { Readable } = require('stream');
const { google } = require('googleapis');

/** Trim env values and strip wrapping quotes from .env */
function trimEnv(v) {
  if (v == null) return '';
  let s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function logDrive(msg, data) {
  console.log(`[google-drive] ${msg}`, data != null ? data : '');
}

/**
 * Escape a string for use inside a Google Drive API `q` filter (single-quoted).
 * @param {string} s
 */
function escapeDriveQueryString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Throws if required Google OAuth env vars are missing. */
function assertConfig() {
  const clientId = trimEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = trimEnv(process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri = trimEnv(process.env.GOOGLE_REDIRECT_URI);
  const refreshToken = trimEnv(process.env.GOOGLE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error(
      'Google Drive: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and GOOGLE_REFRESH_TOKEN in .env',
    );
  }
}

/**
 * Build an authenticated Drive v3 client. Tokens refresh automatically via googleapis.
 * @returns {Promise<import('googleapis').drive_v3.Drive>}
 */
async function getDriveClient() {
  assertConfig();
  const oauth2Client = new google.auth.OAuth2(
    trimEnv(process.env.GOOGLE_CLIENT_ID),
    trimEnv(process.env.GOOGLE_CLIENT_SECRET),
    trimEnv(process.env.GOOGLE_REDIRECT_URI),
  );
  oauth2Client.setCredentials({
    refresh_token: trimEnv(process.env.GOOGLE_REFRESH_TOKEN),
  });

  // googleapis refreshes access_token automatically when it expires (uses refresh_token).
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Find a folder by exact name under a parent, or create it.
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string} name
 * @param {string} parentId - use 'root' for My Drive root
 * @returns {Promise<string>} folder id
 */
async function ensureFolder(drive, name, parentId = 'root') {
  const safeName = escapeDriveQueryString(name);
  const safeParent = escapeDriveQueryString(parentId);
  const q = `name='${safeName}' and '${safeParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const list = await drive.files.list({
    q,
    fields: 'files(id,name)',
    spaces: 'drive',
    pageSize: 5,
  });

  const existing = list.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  if (!created.data.id) {
    throw new Error('Google Drive: folder create returned no id');
  }
  return created.data.id;
}

/**
 * Allow anyone with the link to view the file.
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string} fileId
 */
async function makeFilePublicLink(drive, fileId) {
  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'anyone',
      role: 'reader',
    },
    fields: 'id',
  });
}

/**
 * Public view URL for a file (works after `anyone` reader permission).
 * @param {string} fileId
 */
function buildFileViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Upload a buffer as a new file inside a folder, then make it link-readable.
 * @param {object} opts
 * @param {import('googleapis').drive_v3.Drive} opts.drive
 * @param {string} opts.folderId
 * @param {string} opts.fileName
 * @param {Buffer} opts.buffer
 * @param {string} [opts.mimeType]
 * @returns {Promise<{ fileId: string; fileUrl: string }>}
 */
async function uploadBufferToFolder({ drive, folderId, fileName, buffer, mimeType }) {
  const body = Readable.from(buffer);
  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType: mimeType || 'application/octet-stream',
      body,
    },
    fields: 'id,name',
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error('Google Drive: upload returned no file id');
  }

  await makeFilePublicLink(drive, fileId);
  const fileUrl = buildFileViewUrl(fileId);
  return { fileId, fileUrl };
}

/**
 * Resolve (or create) the root upload folder and an optional nested path of folder names.
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string[]} pathSegments - e.g. ['CandidateUploads', 'onboarding', 'Jane Doe']
 * @returns {Promise<string>} leaf folder id
 */
async function ensureFolderPath(drive, pathSegments) {
  let parentId = 'root';
  for (const segment of pathSegments) {
    if (!segment) continue;
    // eslint-disable-next-line no-await-in-loop
    parentId = await ensureFolder(drive, segment, parentId);
  }
  return parentId;
}

/**
 * Sanitize a single path segment for Drive folder/file names.
 * @param {string} name
 */
function sanitizeSegment(name) {
  const s = String(name || 'candidate')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
  return s || 'candidate';
}

module.exports = {
  trimEnv,
  getDriveClient,
  ensureFolder,
  ensureFolderPath,
  uploadBufferToFolder,
  makeFilePublicLink,
  buildFileViewUrl,
  sanitizeSegment,
  logDrive,
};
