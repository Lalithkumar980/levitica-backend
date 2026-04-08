/**
 * Onboarding package upload: multiple files + JSON payload into Google Drive under
 * {GOOGLE_DRIVE_ROOT_FOLDER}/onboarding/{candidateFolderName}/.
 */

const {
  getDriveClient,
  ensureFolderPath,
  uploadBufferToFolder,
  sanitizeSegment,
} = require('./googleDriveService');

const DEFAULT_ROOT_FOLDER = 'CandidateUploads';

/**
 * @param {{ candidateFolderName: string; files: Array<{ originalname: string; buffer: Buffer; mimetype: string }>; formPayload: object }} opts
 * @returns {Promise<{ uploaded: Array<{ originalName: string; driveFileId: string; webUrl: string; contentType: string }> }>}
 */
async function uploadOnboardingPackage({ candidateFolderName, files, formPayload }) {
  const drive = await getDriveClient();
  const rootName = (process.env.GOOGLE_DRIVE_ROOT_FOLDER || DEFAULT_ROOT_FOLDER).trim() || DEFAULT_ROOT_FOLDER;
  const folder = sanitizeSegment(candidateFolderName);
  const leafFolderId = await ensureFolderPath(drive, [rootName, 'onboarding', folder]);

  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let safeName = sanitizeSegment(f.originalname || 'document');
    if (files.length > 1) {
      safeName = `${i + 1}-${safeName}`;
    }
    // eslint-disable-next-line no-await-in-loop
    const { fileId, fileUrl } = await uploadBufferToFolder({
      drive,
      folderId: leafFolderId,
      fileName: safeName,
      buffer: f.buffer,
      mimeType: f.mimetype || 'application/octet-stream',
    });
    uploaded.push({
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
