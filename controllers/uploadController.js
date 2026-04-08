const { getDriveClient, ensureFolderPath, uploadBufferToFolder, sanitizeSegment } = require('../services/googleDriveService');

const DEFAULT_ROOT_FOLDER = 'CandidateUploads';

/**
 * POST /upload and POST /api/upload — multipart field `file` (single) or `files` (multiple).
 * Optional body field `subfolder` — created under CandidateUploads if provided.
 * Requires Authorization (verifyToken applied in routes).
 */
async function uploadToDrive(req, res) {
  const rawFiles = req.files;
  let list = [];
  if (Array.isArray(rawFiles)) {
    list = rawFiles;
  } else if (rawFiles && typeof rawFiles === 'object') {
    list = []
      .concat(rawFiles.file || [], rawFiles.files || [])
      .filter(Boolean);
  }

  if (!list.length) {
    return res.status(400).json({ message: 'No file uploaded. Use form field "file" or "files".' });
  }

  const subfolderRaw =
    typeof req.body?.subfolder === 'string'
      ? req.body.subfolder.trim()
      : typeof req.query?.subfolder === 'string'
        ? req.query.subfolder.trim()
        : '';

  const rootName = (process.env.GOOGLE_DRIVE_ROOT_FOLDER || DEFAULT_ROOT_FOLDER).trim() || DEFAULT_ROOT_FOLDER;
  const pathSegs = [rootName];
  if (subfolderRaw) {
    pathSegs.push(sanitizeSegment(subfolderRaw));
  }

  try {
    const drive = await getDriveClient();
    const folderId = await ensureFolderPath(drive, pathSegs);

    const results = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const baseName = sanitizeSegment(f.originalname || `upload-${i + 1}`);
      const name = list.length > 1 ? `${i + 1}-${baseName}` : baseName;
      // eslint-disable-next-line no-await-in-loop
      const { fileId, fileUrl } = await uploadBufferToFolder({
        drive,
        folderId,
        fileName: name,
        buffer: f.buffer,
        mimeType: f.mimetype || 'application/octet-stream',
      });
      results.push({ fileId, fileUrl });
    }

    if (results.length === 1) {
      return res.status(201).json({
        fileId: results[0].fileId,
        fileUrl: results[0].fileUrl,
      });
    }
    return res.status(201).json({ files: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload] Google Drive error', msg);
    return res.status(502).json({
      message: 'Could not upload file to storage',
      detail: process.env.NODE_ENV === 'production' ? undefined : msg,
    });
  }
}

module.exports = {
  uploadToDrive,
};
