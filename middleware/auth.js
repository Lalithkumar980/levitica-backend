const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'levitica-dev-secret-change-in-production';

/** Attach req.user if valid Bearer token. Does not block if no token. */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    User.findById(decoded.userId)
      .then((user) => {
        if (!user) return res.status(401).json({ message: 'User not found' });
        req.user = user;
        next();
      })
      .catch(() => res.status(401).json({ message: 'Invalid token' }));
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/** Use after authenticate. Respond 403 if req.user.role is not Admin. */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

// --- 2.4 Reusable role middleware (use after authenticate) ---
// Role values match User model: 'Admin' | 'HR Management' | 'Sales Manager' | 'Finance Management' | 'Sales Rep'

/** 1. Admin only — 403 if not Admin. Use for: delete, /admin/users. */
function adminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Admins only' });
  }
  next();
}

/** 2. Admin or Manager — 403 if not Admin or Sales Manager. Use for: view all, export, bulk upload. */
function managerOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'Admin' && req.user.role !== 'Sales Manager') {
    return res.status(403).json({ message: 'Manager or Admin only' });
  }
  next();
}

/** Admin or HR Management — onboarding invite and similar HR-only actions. */
function adminOrHRManagement(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'Admin' && req.user.role !== 'HR Management') {
    return res.status(403).json({ message: 'Admin or HR access required' });
  }
  next();
}

/**
 * 3. Owner check — call inside controller after fetching the record.
 * Returns true if user is Admin/Manager (can access any record) or if record.owner === req.user._id.
 * Use before allowing edit/update/delete of a single record.
 * @param {object} record - document with owner field (ObjectId or string)
 * @param {object} req - express request (req.user set by authenticate)
 * @param {string} ownerField - optional; default 'owner'
 */
function isOwnerOrElevated(record, req, ownerField = 'owner') {
  if (!req.user) return false;
  if (req.user.role === 'Admin' || req.user.role === 'Sales Manager') return true;
  if (!record || record[ownerField] == null) return false;
  return String(record[ownerField]) === String(req.user._id);
}

/** Alias for authenticate — use in server.js for protected API routes. */
const verifyToken = authenticate;

module.exports = {
  authenticate,
  verifyToken,
  requireAdmin,
  adminOnly,
  managerOrAdmin,
  adminOrHRManagement,
  isOwnerOrElevated,
  JWT_SECRET,
};
