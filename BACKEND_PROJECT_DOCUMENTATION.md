# Levitica Backend - Project Documentation

This document explains your current backend folder structure, what each folder/file does, and how the full backend works from request to database.

## 1) High-Level Architecture

- Runtime: `Node.js` + `Express`
- Database: `MongoDB` using `Mongoose`
- Auth: `JWT` (Bearer token)
- Uploads: `multer` (local uploads + Google Drive uploads)
- Mail: `nodemailer` for onboarding invite emails
- Pattern used: `Route -> Controller -> Model -> MongoDB`

Main app entry is `server.js`. It loads env variables, connects DB, registers middleware, mounts routes, and starts HTTP server.

## 2) Request Flow (How backend works)

1. Client calls endpoint (example: `GET /api/v1/leads`).
2. Route in `routes/*.js` matches URL.
3. Route runs middleware (auth/role checks/upload parser).
4. Route calls controller function in `controllers/*.js`.
5. Controller reads/writes data through `models/*.js` (Mongoose).
6. Response returns JSON to frontend.

## 3) Root Files

- `.env` - local environment variables (secrets, DB URL, JWT key, SMTP, Google OAuth).
- `.env.example` - sample env template for setup.
- `.gitignore` - ignored files/folders in git.
- `package.json` - dependencies and scripts:
  - `npm start` -> starts `server.js`
  - `npm run dev` -> starts with nodemon
  - `npm run google:auth` -> Google refresh-token helper
- `package-lock.json` - exact dependency lockfile.
- `server.js` - central backend bootstrap and route mounting.
- `GOOGLE_DRIVE_SETUP.md` - Google Drive integration setup notes.

## 4) Folder-by-Folder + File-by-File

### `config/`

- `db.js` - MongoDB connection logic, Windows DNS compatibility tweak (`ipv4first`), and safe error logging.

### `controllers/`

Controllers contain business logic for each module.

- `activityController.js` - activity CRUD/list filters (`calls`, `emails` views).
- `adminController.js` - admin user management/stat endpoints.
- `companyController.js` - company CRUD.
- `contactController.js` - contact CRUD.
- `dealController.js` - deal CRUD + kanban + CSV export.
- `documentController.js` - document CRUD.
- `expenseController.js` - finance expense CRUD.
- `financeReportController.js` - finance dashboard + P/L report.
- `importController.js` - lead import handling (CSV/XLSX body/file) + import history.
- `invoiceController.js` - invoice CRUD with finance calculations support.
- `leadController.js` - lead CRUD + convert lead + CSV export.
- `onboardingController.js` - send invite, validate token, submit onboarding, list submissions.
- `paymentController.js` - payment CRUD.
- `reportController.js` - CRM analytics/dashboard reports.
- `taskController.js` - task CRUD + mark complete.
- `uploadController.js` - upload files to Google Drive endpoint logic.

### `middleware/`

Middleware is reusable code run before controllers.

- `auth.js` - JWT auth (`authenticate`/`verifyToken`), role guards (`adminOnly`, `adminOrHRManagement`).
- `roles.js` - role/capability matrix helpers, rep isolation filters, finance/admin guard.
- `upload.js` - multer configs:
  - leads import files (`csv/xlsx/xls`)
  - profile photo upload (`uploads/profiles`)
  - candidate resume upload (`uploads/resumes`)
- `onboardingUpload.js` - onboarding `files[]` upload parser (memory storage + file type/size limits).
- `driveUpload.js` - multipart parser for Google Drive upload endpoints.

### `models/`

Mongoose schema layer (database structure + rules).

- `Activity.js` - activities (calls/emails/meetings), auto follow-up task creation hook.
- `Candidate.js` - HR candidate pipeline, intake fields, feedback rounds, resume metadata.
- `Company.js` - company master data and linked contacts/deals.
- `Contact.js` - people/contact records with owner and status.
- `Deal.js` - sales pipeline deals and stage-probability mapping.
- `Document.js` - document metadata linked to deals/contacts/users.
- `Expense.js` - expense entries for finance module.
- `ImportHistory.js` - tracks bulk import run stats/errors.
- `Invitation.js` - onboarding invite token + expiry + used state.
- `Invoice.js` - invoice records with GST/status/payment fields.
- `Lead.js` - lead intake and ownership.
- `OnboardingCandidate.js` - submitted onboarding forms + uploaded document slots.
- `Payment.js` - payment receipts/transactions.
- `Task.js` - tasks for reps/deals/contacts.
- `TrainingFee.js` - training fee records and derived balance.
- `User.js` - users, roles, permissions, password hashing + encrypted password display field.

### `routes/`

Route files map endpoints to controllers/middleware.

- `activities.js` - `/api/v1/activities` routes (list/create/get/update/delete, calls/emails).
- `admin.js` - `/api/v1/admin` routes (admin-only user/role/stats).
- `auth.js` - `/api/auth/login`.
- `candidates.js` - `/api/candidates` candidate list/intake/bulk/feedback/stage/CRUD.
- `companies.js` - `/api/v1/companies` CRUD.
- `contacts.js` - `/api/v1/contacts` CRUD.
- `deals.js` - `/api/v1/deals` CRUD + kanban + export.
- `documents.js` - `/api/v1/documents` CRUD.
- `expenses.js` - `/api/v1/finance/expenses` CRUD.
- `financeReports.js` - `/api/v1/finance/reports` dashboard + P/L.
- `hr.js` - `/api/hr/recent-activity`.
- `import.js` - `/api/v1/import` history + leads upload/import.
- `invoices.js` - `/api/v1/finance/invoices` CRUD.
- `leads.js` - `/api/v1/leads` CRUD + convert + export.
- `onboarding.js` - `/api/onboarding` invite/token/submit/submissions.
- `payments.js` - `/api/v1/finance/payments` CRUD.
- `reports.js` - `/api/v1/reports` dashboard/pipeline/performance/forecast/etc.
- `tasks.js` - `/api/v1/tasks` CRUD + complete.
- `team.js` - `/api/v1/team/users` team assignment helper list.
- `trainingFees.js` - `/api/training-fees` list/stats/CRUD.
- `users.js` - `/api/users` profile endpoints + admin user management endpoints.

### `scripts/`

- `googleDriveGetRefreshToken.js` - one-time helper to generate `GOOGLE_REFRESH_TOKEN`.
- `seedAdmin.js` - one-time script to seed an admin user.

### `services/`

- `googleDriveService.js` - low-level Google Drive operations (auth, folders, upload, public links).
- `onboardingDriveUpload.js` - onboarding package upload workflow to Drive.

### `utils/`

- `csvExport.js` - CSV escape and conversion helpers.
- `email.js` - nodemailer transport and onboarding invite sender.
- `encrypt.js` - AES encryption/decryption helper (used for password display copy).

### `uploads/`

Runtime storage for local uploaded files (generated at runtime):

- `uploads/profiles/*` - user profile images.
- `uploads/resumes/*` - candidate resume files.

## 5) API Mount Map from `server.js`

Public/basic:
- `GET /` - API running check
- `GET /api/health` - app health
- `GET /api/health/db` - DB connection status
- `GET /oauth2callback` - Google OAuth helper callback page

Auth/User/HR:
- `/api/auth`
- `/api/users`
- `/api/hr`
- `/api/training-fees`
- `/api/candidates`
- `/api/onboarding`

Protected CRM/Finance (`verifyToken`):
- `/api/v1/leads`
- `/api/v1/contacts`
- `/api/v1/companies`
- `/api/v1/deals`
- `/api/v1/activities`
- `/api/v1/tasks`
- `/api/v1/documents`
- `/api/v1/import`
- `/api/v1/reports`
- `/api/v1/admin`
- `/api/v1/team`
- `/api/v1/finance/invoices`
- `/api/v1/finance/expenses`
- `/api/v1/finance/payments`
- `/api/v1/finance/reports`

Also exposed aliases:
- `/send-invite`, `/validate-token`, `/submit`, `/upload`, `/api/upload`

## 6) Security + Role Model

Roles used:
- `Admin`
- `HR Management`
- `Sales Manager`
- `Finance Management`
- `Sales Rep`

Important behavior:
- JWT token required for protected modules.
- `roles.js` applies rep isolation logic (`owner` filtering) so Sales Reps only see their own records.
- Finance routes restricted to `Finance Management` or `Admin`.
- Admin-only operations (user management/delete actions) are guarded.

## 7) How to Run & Build

### Local setup

1. Install dependencies:
   - `npm install`
2. Configure `.env`:
   - `PORT`
   - `MONGODB_URI`
   - `JWT_SECRET`
   - optional SMTP + Google Drive keys
3. Start:
   - production-like: `npm start`
   - dev auto-reload: `npm run dev`

### Optional one-time scripts

- Seed admin:
  - `node scripts/seedAdmin.js`
- Generate Google refresh token:
  - `npm run google:auth`

## 8) Learning Order (Best way to study this project)

Follow this order to understand quickly:

1. `server.js` (global app flow and route mounting)
2. `middleware/auth.js` + `middleware/roles.js` (security model)
3. One feature end-to-end (example):
   - `routes/leads.js`
   - `controllers/leadController.js`
   - `models/Lead.js`
4. Repeat for:
   - deals (`deals.js`, `dealController.js`, `Deal.js`)
   - candidates HR flow (`candidates.js`, `Candidate.js`)
   - onboarding flow (`onboarding.js`, `onboardingController.js`, `Invitation.js`, `OnboardingCandidate.js`)
   - finance flow (`invoices/expenses/payments/financeReports`)
5. Finish with import/export and external integrations:
   - `importController.js`, `csvExport.js`, `googleDriveService.js`, `email.js`

## 9) Common Extension Points (Where to add new things)

- New API feature:
  1. Add schema in `models/`
  2. Add logic in `controllers/`
  3. Add endpoints in `routes/`
  4. Mount route in `server.js`
- New permission rule:
  - Add role helper/middleware in `middleware/roles.js`
- New upload type:
  - Add multer config in `middleware/upload.js` (or `driveUpload.js` for Drive)
- New report:
  - Add function in `controllers/reportController.js` or `financeReportController.js`, then route entry.

---

If you want, I can generate a second document next: a complete endpoint reference (`METHOD + URL + body + response + role access`) for every route in this backend.
