# Google Drive upload setup

Onboarding file uploads and `POST /api/upload` use the Google Drive API with a **single Google account** (refresh token). Candidates do **not** sign in with Google; only your backend uses these credentials.

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services** → **Enable APIs** → enable **Google Drive API**.

## 2. OAuth client (Web application)

1. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs**: add the exact URL you will use locally, for example:
   - `http://localhost:5001/oauth2callback`
4. Copy **Client ID** and **Client secret**.

## 3. OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (or Internal if Workspace only).
3. Add scope: `https://www.googleapis.com/auth/drive` (or a narrower scope later if you tighten the app).
4. Add your Google account as a **test user** while the app is in Testing.

## 4. Backend `.env`

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5001/oauth2callback
GOOGLE_REFRESH_TOKEN=
# Optional: root folder name in My Drive (created if missing)
GOOGLE_DRIVE_ROOT_FOLDER=CandidateUploads
```

## 5. Get `GOOGLE_REFRESH_TOKEN`

1. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env` (leave refresh token empty).
2. From the `backend` folder run:

   ```bash
   npm run google:auth
   ```

3. Open the printed URL, sign in, approve access.
4. You will be redirected to your redirect URI — the page may 404 locally; **copy the full URL** from the browser address bar (it contains `code=...`).
5. Paste into the script; it prints `GOOGLE_REFRESH_TOKEN=...` — add that line to `.env`.
6. Restart the API.

## 6. Verify

- Submit the onboarding form from the SPA (files should land under **CandidateUploads → onboarding → &lt;name&gt;** in that Google account’s Drive).
- Or call `POST /api/upload` with `Authorization: Bearer <jwt>` and multipart field `file` or `files`.

## Authenticated upload endpoint

- `POST /upload` and `POST /api/upload` require a valid JWT (same auth as the rest of the HR app).
- Response (single file): `{ "fileId": "...", "fileUrl": "https://drive.google.com/file/d/.../view" }`.
- Multiple files: `{ "files": [ { "fileId", "fileUrl" }, ... ] }`.

## Existing onboarding records in MongoDB

If you already stored submissions with the old schema (`oneDrivePath`), those documents will not match the new `driveFileId` field. New submissions use `driveFileId` + `webUrl`. Migrate old documents manually if you still need them in the app, or leave them as historical data only.

## Troubleshooting

- **invalid_grant**: refresh token revoked or clock skew; run `google:auth` again.
- **access_denied**: add your account as a test user on the consent screen, or publish the app.
- **Insufficient Permission**: ensure Drive API is enabled and scope includes Drive access.
