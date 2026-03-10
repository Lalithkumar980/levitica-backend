/**
 * Role-based access control — SalesPulse CRM
 * Aligns with: Admin | Manager (Sales Manager) | Sales Rep
 *
 * Capability matrix:
 * - View ALL: Admin, Manager ✅  |  Rep: own only
 * - Create: Admin, Manager (any owner) ✅  |  Rep: self only (owner = self)
 * - Edit: Admin, Manager (any) ✅  |  Rep: own only
 * - Delete: Admin only ✅  |  Manager, Rep: ❌
 * - Export CSV: Admin, Manager ✅  |  Rep: ❌
 * - Bulk CSV upload: Admin, Manager ✅  |  Rep: ❌
 * - Manage Users/Roles: Admin only ✅  |  Manager, Rep: ❌
 * - View Reports: Admin, Manager (all) ✅  |  Rep: self only
 * - Dashboard: Admin, Manager (leaderboard) ✅  |  Rep: own KPIs only
 *
 * 2.2 Rep vs Rep — Isolation Rule
 * Sales Rep 1 and Sales Rep 2 are completely isolated. Rep 1 cannot see Rep 2's
 * leads, deals, contacts, activities, tasks, or documents — and vice versa.
 * This is enforced at the BACKEND query level using the "owner" field, not just frontend.
 *
 * For every GET (list) on rep-scoped resources, you MUST use scopeQueryByRole() (or
 * applyRepIsolation()) so that when req.user.role === "Sales Rep", the filter
 * includes { owner: req.user._id }. Example:
 *
 *   const filter = scopeQueryByRole(req, { status: 'active' });
 *   const results = await Lead.find(filter);
 *
 * 2.3 Manager vs Admin — Key Differences
 * Action                    | Admin | Manager
 * --------------------------|-------|--------
 * Delete any record         | ✅    | ❌ 403 Forbidden
 * Access /admin/users route| ✅ Full CRUD | ❌ 403 Forbidden
 * View all deals/leads/contacts | ✅ | ✅
 * Reassign rep on a deal    | ✅ Can change owner | ✅ Can change owner
 * Bulk CSV lead import     | ✅    | ✅
 * See rep leaderboard      | ✅    | ✅
 *
 * Only Admin: delete, manage users. Both Admin and Manager: view all, reassign owner, bulk import, leaderboard.
 */

const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Sales Manager',
  REP: 'Sales Rep',
};

/** True if user can view every record in the DB (Admin or Manager) */
function canViewAll(req) {
  if (!req.user) return false;
  return req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
}

/** True if user is a Sales Rep (own records only) */
function isRep(req) {
  return req.user && req.user.role === ROLES.REP;
}

/** True if user can delete any record (Admin only) */
function canDelete(req) {
  return req.user && req.user.role === ROLES.ADMIN;
}

/** True if user can export CSV (Admin or Manager) */
function canExport(req) {
  if (!req.user) return false;
  return req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
}

/** True if user can bulk CSV upload (Admin or Manager) */
function canBulkUpload(req) {
  if (!req.user) return false;
  return req.user.role === ROLES.ADMIN || req.user.role === ROLES.MANAGER;
}

/** True if user can manage users/roles (Admin only) */
function canManageUsers(req) {
  return req.user && req.user.role === ROLES.ADMIN;
}

/** True if user can reassign owner on a deal/lead (Admin or Manager only; Rep cannot) */
function canReassignOwner(req) {
  return canViewAll(req);
}

/**
 * REP ISOLATION — Use for EVERY GET (list) on rep-scoped resources.
 * Returns a Mongoose query filter:
 * - Admin / Manager: no extra filter (view all records).
 * - Sales Rep: adds filter.owner = req.user._id (ObjectId) so Rep sees only own records.
 *
 * Apply to: leads, deals, contacts, activities, tasks, documents (and any other rep-scoped collection).
 *
 * @param {object} req - express request (must have req.user set by authenticate)
 * @param {object} baseQuery - existing query object (e.g. { status: 'active' })
 * @param {string} ownerField - name of the field that stores owner user id (default 'owner')
 * @returns {object} filter to pass to Model.find(filter)
 */
function scopeQueryByRole(req, baseQuery = {}, ownerField = 'owner') {
  if (!req.user) return baseQuery;
  if (canViewAll(req)) return baseQuery;
  // Rep: only own records — enforced at backend query level (Rep vs Rep isolation)
  return { ...baseQuery, [ownerField]: req.user._id };
}

/** Alias for scopeQueryByRole — use for every GET when resource is rep-scoped (leads, deals, contacts, etc.). */
function applyRepIsolation(req, baseQuery = {}, ownerField = 'owner') {
  return scopeQueryByRole(req, baseQuery, ownerField);
}

/**
 * Use when creating a record. For Rep, owner must be self. For Admin/Manager, owner can be any.
 * Call this before creating; if Rep and body.owner !== req.user._id, override body.owner to self.
 * @param {object} req
 * @param {object} body - request body that may contain owner
 * @param {string} ownerField - field name for owner (default 'owner')
 * @returns {object} body with owner set correctly (Rep forced to self)
 */
function ensureOwnerForCreate(req, body = {}, ownerField = 'owner') {
  const out = { ...body };
  if (isRep(req)) {
    out[ownerField] = req.user._id;
  }
  // Admin/Manager can set owner to anyone; if not set, could default to self or leave to route
  return out;
}

/**
 * True if req.user can edit this record. Admin/Manager: yes. Rep: only if record.owner === req.user._id.
 * @param {object} req
 * @param {object} record - document with owner field (ObjectId or string)
 * @param {string} ownerField - default 'owner'
 */
function canEditRecord(req, record, ownerField = 'owner') {
  if (!req.user) return false;
  if (canViewAll(req)) return true;
  if (!record || record[ownerField] == null) return false;
  return String(record[ownerField]) === String(req.user._id);
}

/**
 * Require Admin or Manager. Use for: export, bulk upload, view-all list.
 * Use after authenticate().
 */
function requireManagerOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== ROLES.ADMIN && req.user.role !== ROLES.MANAGER) {
    return res.status(403).json({ message: 'Manager or Admin access required' });
  }
  next();
}

/**
 * Require Admin only. Use for: delete, manage users.
 * Use after authenticate(). (Same as existing requireAdmin in auth.js; kept here for clarity.)
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

/**
 * Require permission to export. 403 if Rep.
 */
function requireExport(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!canExport(req)) return res.status(403).json({ message: 'Export not allowed for your role' });
  next();
}

/**
 * Require permission to bulk upload. 403 if Rep.
 */
function requireBulkUpload(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!canBulkUpload(req)) return res.status(403).json({ message: 'Bulk upload not allowed for your role' });
  next();
}

/**
 * Require permission to delete. 403 if not Admin.
 */
function requireDelete(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (!canDelete(req)) return res.status(403).json({ message: 'Delete not allowed for your role' });
  next();
}

/**
 * Require Finance Management or Admin. Use for all finance routes (invoices, expenses, payments, reports).
 */
function requireFinanceOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== ROLES.ADMIN && req.user.role !== 'Finance Management') {
    return res.status(403).json({ message: 'Finance or Admin access required' });
  }
  next();
}

module.exports = {
  ROLES,
  canViewAll,
  isRep,
  canDelete,
  canExport,
  canBulkUpload,
  canManageUsers,
  canReassignOwner,
  scopeQueryByRole,
  applyRepIsolation,
  ensureOwnerForCreate,
  canEditRecord,
  requireManagerOrAdmin,
  requireAdmin,
  requireExport,
  requireBulkUpload,
  requireDelete,
  requireFinanceOrAdmin,
};
