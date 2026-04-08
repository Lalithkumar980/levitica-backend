/**
 * Onboarding package upload: multiple files + JSON payload into Google Drive under
 * {GOOGLE_DRIVE_ROOT_FOLDER}/candidate_<email>/.
 */

const {
  getDriveClient,
  ensureFolderPath,
  uploadBufferToFolder,
  sanitizeSegment,
} = require('./googleDriveService');

const DEFAULT_ROOT_FOLDER = 'CandidateUploads';

/**
 * @param {{ candidateEmail: string; files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>; formPayload: object }} opts
 * @returns {Promise<{ uploaded: Array<{ slotId: string; originalName: string; driveFileId: string; webUrl: string; contentType: string }> }>}
 */
async function uploadOnboardingPackage({ candidateEmail, files, formPayload }) {
  const drive = await getDriveClient();
  const rootName = (process.env.GOOGLE_DRIVE_ROOT_FOLDER || DEFAULT_ROOT_FOLDER).trim() || DEFAULT_ROOT_FOLDER;
  const emailSegment = sanitizeSegment(String(candidateEmail || '').toLowerCase() || 'unknown');
  const leafFolderId = await ensureFolderPath(drive, [rootName, `candidate_${emailSegment}`]);

  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safeName = sanitizeSegment(f.originalname || 'document');
    const slotId = safeName.includes('-') ? safeName.split('-')[0] : safeName;
    // eslint-disable-next-line no-await-in-loop
    const { fileId, fileUrl } = await uploadBufferToFolder({
      drive,
      folderId: leafFolderId,
      fileName: safeName,
      buffer: f.buffer,
      mimeType: f.mimetype || 'application/octet-stream',
    });
    uploaded.push({
      slotId,
      originalName: f.originalname || safeName,
      driveFileId: fileId,
      webUrl: fileUrl,
      contentType: f.mimetype || '',
    });
  }

  const jsonName = 'onboarding-form-data.json';
  const jsonBuffer = Buffer.from(JSON.stringify(formPayload, null, 2), 'utf8');
  const jsonMeta = await uploadBufferToFolder({
    drive,
    folderId: leafFolderId,
    fileName: jsonName,
    buffer: jsonBuffer,
    mimeType: 'application/json',
  });
  uploaded.push({
    slotId: 'onboarding_json',
    originalName: jsonName,
    driveFileId: jsonMeta.fileId,
    webUrl: jsonMeta.fileUrl,
    contentType: 'application/json',
  });

  return { uploaded };
}

module.exports = {
  uploadOnboardingPackage,
};
