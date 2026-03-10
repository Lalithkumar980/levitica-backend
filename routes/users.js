const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { decrypt } = require('../utils/encrypt');

const ROLE_DEFAULTS = {
  Admin: { viewAll: true, delete: true, export: true, admin: true, bulkImport: true, viewReports: true, modules: ['/dashboard', '/leads', '/contacts', '/companies', '/deals -6'] },
  'HR Management': { viewAll: true, delete: false, export: true, admin: false, bulkImport: true, viewReports: true, modules: ['/dashboard', '/candidates'] },
  'Sales Manager': { viewAll: true, delete: false, export: true, admin: false, bulkImport: true, viewReports: true, modules: ['/dashboard', '/leads', '/contacts', '/companies', '/deals -7'] },
  'Finance Management': { viewAll: true, delete: false, export: true, admin: false, bulkImport: false, viewReports: true, modules: ['/finance', '/invoices', '/expenses', '/payments'] },
  'Sales Rep': { viewAll: false, delete: false, export: true, admin: false, bulkImport: false, viewReports: true, modules: ['/dashboard', '/leads', '/contacts', '/companies', '/deals -4'] },
};

const ALL_ROLES = ['Admin', 'HR Management', 'Sales Manager', 'Finance Management', 'Sales Rep'];
const ROLE_CLASS_MAP = {
  Admin: 'bg-blue-100 text-blue-700',
  'HR Management': 'bg-violet-100 text-violet-700',
  'Sales Manager': 'bg-emerald-100 text-emerald-700',
  'Finance Management': 'bg-sky-100 text-sky-700',
  'Sales Rep': 'bg-amber-100 text-amber-700',
};

/** GET /api/users — list all users (admin only); includes decrypted password for admin view */
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const list = await User.find().sort({ createdAt: -1 }).select('+passwordEncrypted').lean();
    const withExtra = list.map((u) => {
      const obj = { ...u, id: u._id.toString(), dept: u.department };
      const initials = (u.name || '').trim().split(/\s+/);
      obj.initials = initials.length >= 2
        ? (initials[0][0] + initials[initials.length - 1][0]).toUpperCase()
        : (initials[0] || '').slice(0, 2).toUpperCase() || '—';
      obj.roleClass = ROLE_CLASS_MAP[u.role] || 'bg-gray-100 text-gray-700';
      delete obj.password;
      obj.passwordDisplay = u.passwordEncrypted ? decrypt(u.passwordEncrypted) : '';
      delete obj.passwordEncrypted;
      return obj;
    });
    res.json(withExtra);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ message: 'Failed to list users' });
  }
});

/** POST /api/users — create user (admin only). Body: fullName, email, role, department, password */
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { fullName, email, role, department, password } = req.body || {};
    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name and email are required' });
    }
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ message: 'Password is required (min 6 characters)' });
    }
    const r = (role && ALL_ROLES.includes(role)) ? role : 'Sales Rep';
    const defaults = ROLE_DEFAULTS[r] || ROLE_DEFAULTS['Sales Rep'];
    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }
    const user = await User.create({
      name: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      password: String(password).trim(),
      role: r,
      department: department || 'Sales',
      ...defaults,
    });
    const sent = user.toJSON();
    sent.passwordDisplay = user.passwordEncrypted ? decrypt(user.passwordEncrypted) : '';
    res.status(201).json(sent);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A user with this email already exists' });
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

/** PUT /api/users/:id — update user (admin only). Body: name, email, role, department, password (optional) */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, password } = req.body || {};
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (name != null) user.name = String(name).trim();
    if (email != null) user.email = String(email).trim().toLowerCase();
    if (role && ALL_ROLES.includes(role)) user.role = role;
    if (department != null) user.department = String(department).trim();
    if (password != null && String(password).trim()) {
      user.password = String(password).trim();
      user.markModified('password');
    }
    const defaults = ROLE_DEFAULTS[user.role] || ROLE_DEFAULTS['Sales Rep'];
    user.viewAll = defaults.viewAll;
    user.delete = defaults.delete;
    user.export = defaults.export;
    user.admin = defaults.admin;
    user.bulkImport = defaults.bulkImport;
    user.viewReports = defaults.viewReports;
    user.modules = defaults.modules;
    await user.save();
    const sent = user.toJSON();
    sent.passwordDisplay = user.passwordEncrypted ? decrypt(user.passwordEncrypted) : '';
    res.json(sent);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A user with this email already exists' });
    console.error('Update user error:', err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

module.exports = router;
