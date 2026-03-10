const User = require('../models/User');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const Task = require('../models/Task');

const ALLOWED_ROLES = ['Admin', 'HR Management', 'Sales Manager', 'Finance Management', 'Sales Rep'];
const ROLE_ALIASES = {
  admin: 'Admin',
  'hr management': 'HR Management',
  hr: 'HR Management',
  manager: 'Sales Manager',
  'sales manager': 'Sales Manager',
  'finance management': 'Finance Management',
  finance: 'Finance Management',
  rep: 'Sales Rep',
  'sales rep': 'Sales Rep',
};

function resolveRole(value) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return ROLE_ALIASES[normalized] || (ALLOWED_ROLES.includes(value.trim()) ? value.trim() : null);
}

async function listUsers(req, res) {
  try {
    const list = await User.find()
      .select('-password -passwordEncrypted')
      .sort({ createdAt: -1 })
      .lean();
    const withId = list.map((u) => ({ ...u, id: u._id.toString() }));
    res.json({ users: withId });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ message: 'Failed to list users' });
  }
}

async function updateUserRole(req, res) {
  try {
    const roleValue = resolveRole(req.body?.role);
    if (!roleValue) {
      return res.status(400).json({
        message: 'Invalid role. Allowed: Admin, HR Management, Sales Manager, Finance Management, Sales Rep (or alias: manager, rep, hr, finance)',
      });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: roleValue },
      { new: true, runValidators: true }
    ).select('-password -passwordEncrypted');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Role updated', user });
  } catch (err) {
    console.error('Admin update role error:', err);
    res.status(500).json({ message: err.message || 'Failed to update role' });
  }
}

async function getUserStats(req, res) {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select('name email role').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    const [leadsCount, dealsCount, wonDeals, activitiesByType, tasksCount, overdueTasks] = await Promise.all([
      Lead.countDocuments({ owner: userId }),
      Deal.countDocuments({ owner: userId }),
      Deal.find({ owner: userId, stage: 'won' }).select('amount').lean(),
      Activity.aggregate([{ $match: { rep: userId } }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Task.countDocuments({ rep: userId }),
      Task.countDocuments({ rep: userId, status: 'Pending', dueDate: { $lt: new Date() } }),
    ]);
    const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const byType = {};
    activitiesByType.forEach((t) => (byType[t._id] = t.count));
    res.json({
      user: { id: userId, name: user.name, email: user.email, role: user.role },
      stats: {
        leadsCount,
        dealsCount,
        wonRevenue,
        tasksCount,
        overdueTasks,
        activitiesByType: byType,
        totalActivities: activitiesByType.reduce((s, t) => s + t.count, 0),
      },
    });
  } catch (err) {
    console.error('Admin user stats error:', err);
    res.status(500).json({ message: 'Failed to fetch user stats' });
  }
}

module.exports = {
  listUsers,
  updateUserRole,
  getUserStats,
};
