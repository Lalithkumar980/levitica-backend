const User = require('../models/User');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Document = require('../models/Document');
const Candidate = require('../models/Candidate');
const HRActivity = require('../models/HRActivity');
const FinanceActivity = require('../models/FinanceActivity');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');


const { validateRoleAssignment } = require('../utils/roleValidator');

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

    // Validate that restricted roles can only have one user
    // Pass the user ID to exclude the current user from the count
    const validation = await validateRoleAssignment(roleValue, req.params.id);
    if (!validation.allowed) {
      return res.status(400).json({ message: validation.error });
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
      Lead.countDocuments({ owner: userId, isDeleted: { $ne: true } }),
      Deal.countDocuments({ owner: userId, isDeleted: { $ne: true } }),
      Deal.find({ owner: userId, stage: { $in: ['won', 'Won'] }, isDeleted: { $ne: true } }).select('amount').lean(),
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

async function recentActivity(req, res) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const [
      leads, contacts, companies, deals, activities, documents,
      hrActivities, candidates,
      financeActivities, invoices, payments, expenses
    ] = await Promise.all([
      // Sales
      Lead.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Contact.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Company.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Deal.find({}).populate('owner', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      Activity.find({})
        .populate('rep', 'name')
        .populate('dealId', 'title company')
        .populate('contactId', 'fname lname company')
        .sort({ createdAt: -1 }).limit(limit).lean(),
      Document.find({}).populate('uploadedBy', 'name').sort({ createdAt: -1 }).limit(limit).lean(),
      // HR
      HRActivity.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
      Candidate.find({}).select('name position dept offer onboarding createdAt joiningDate').sort({ createdAt: -1 }).limit(limit).lean(),
      // Finance
      FinanceActivity.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
      Invoice.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
      Payment.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
      Expense.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const allActivities = [];

    // 1. Leads
    leads.forEach(l => {
      const name = l.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: l._id,
        type: 'lead_created',
        title: `Lead Added: ${l.fname} ${l.lname}`,
        subtitle: [`By: ${name}`, l.company].filter(Boolean).join(' · '),
        createdAt: l.createdAt,
        timestamp: l.createdAt
      });
    });

    // 2. Contacts
    contacts.forEach(c => {
      const name = c.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: c._id,
        type: 'contact',
        title: `Contact Added: ${c.fname} ${c.lname || ''}`.trim(),
        subtitle: [`By: ${name}`, c.company].filter(Boolean).join(' · '),
        createdAt: c.createdAt,
        timestamp: c.createdAt
      });
    });

    // 3. Companies
    companies.forEach(com => {
      const name = com.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: com._id,
        type: 'company',
        title: `Company Added: ${com.name}`,
        subtitle: [`By: ${name}`, com.industry].filter(Boolean).join(' · '),
        createdAt: com.createdAt,
        timestamp: com.createdAt
      });
    });

    // 4. Deals
    deals.forEach(d => {
      const name = d.owner?.name || 'Unknown Rep';
      allActivities.push({
        id: d._id,
        type: 'deal_created',
        title: `Deal Created: ${d.title}`,
        subtitle: [`By: ${name}`, `Company: ${d.company}`, d.amount ? `Value: ₹${d.amount}` : ''].filter(Boolean).join(' · '),
        createdAt: d.createdAt,
        timestamp: d.createdAt
      });
    });

    // 5. Activity logs
    activities.forEach(a => {
      const name = a.rep?.name || 'Unknown Rep';
      let icon = 'phone';
      if (a.type === 'Email') icon = 'mail';
      if (a.type === 'Meeting' || a.type === 'Demo') icon = 'calendar';
      if (a.type === 'Note') icon = 'edit';
      if (a.type === 'Task') icon = 'check-square';

      const companyName = a.company || (a.dealId && a.dealId.company) || (a.contactId && a.contactId.company) || '';

      allActivities.push({
        id: a._id,
        type: a.type.toLowerCase(),
        title: `${a.type} Logged: ${a.subject}`,
        subtitle: [`By: ${name}`, companyName].filter(Boolean).join(' · '),
        createdAt: a.date || a.createdAt,
        timestamp: a.date || a.createdAt
      });
    });

    // 6. Documents
    documents.forEach(doc => {
      const name = doc.uploadedBy?.name || 'Unknown Rep';
      allActivities.push({
        id: doc._id,
        type: 'document',
        title: `Document Uploaded: ${doc.name}`,
        subtitle: [`By: ${name}`, `Type: ${doc.type}`, doc.company].filter(Boolean).join(' · '),
        createdAt: doc.createdAt,
        timestamp: doc.createdAt
      });
    });

    // 7. HR Activities (modern logs)
    hrActivities.forEach(l => {
      allActivities.push({
        id: l.candidateId || l._id,
        candidateId: l.candidateId,
        type: l.type,
        title: l.title,
        subtitle: l.subtitle || '',
        createdAt: l.createdAt,
        timestamp: l.createdAt
      });
    });

    // 8. Legacy Candidates (HR candidate activity)
    candidates.forEach((c) => {
      const name = c.name || 'Candidate';
      const offer = c.offer || '';
      const onboarding = c.onboarding || '';

      let type = 'candidate';
      let title = `Candidate added: ${name}`;
      let sortDate = c.createdAt;

      if (onboarding === 'Completed') {
        type = 'joined';
        title = `${name} joined`;
        sortDate = c.joiningDate ? new Date(c.joiningDate) : c.createdAt;
      } else if (offer === 'Done') {
        type = 'offer';
        title = `Offer done for ${name}`;
      }

      const rolePart = c.position && c.position !== '—' ? c.position : '';

      allActivities.push({
        id: c._id,
        candidateId: c._id,
        type,
        title,
        subtitle: rolePart,
        createdAt: sortDate,
        timestamp: sortDate
      });
    });

    // 9. Finance Activities (modern logs)
    financeActivities.forEach(l => {
      allActivities.push({
        type: l.type,
        title: l.title,
        subtitle: l.subtitle || '',
        createdAt: l.createdAt,
        timestamp: l.createdAt,
        targetType: l.type || null,
        targetId: l.metadata?.invoiceId || l.metadata?.paymentId || l.metadata?.expenseId || l.metadata?.id || null
      });
    });

    // 10. Invoices
    invoices.forEach(inv => {
      allActivities.push({
        type: 'invoice',
        title: `Invoice created: ${inv.invoiceNo}`,
        subtitle: `${inv.client || 'Client'} · ₹${Number(inv.total || 0).toFixed(2)}`,
        createdAt: inv.createdAt,
        timestamp: inv.createdAt,
        targetType: 'invoice',
        targetId: inv._id
      });
    });

    // 11. Payments
    payments.forEach(pay => {
      allActivities.push({
        type: 'payment',
        title: `Payment received: ₹${Number(pay.amount || 0).toFixed(2)}`,
        subtitle: `${pay.client || 'Client'}${pay.invoiceRef ? ` · Invoice ${pay.invoiceRef}` : ''}`,
        createdAt: pay.createdAt,
        timestamp: pay.createdAt,
        targetType: 'payment',
        targetId: pay._id
      });
    });

    // 12. Expenses
    expenses.forEach(exp => {
      allActivities.push({
        type: 'expense',
        title: `Expense recorded: ${exp.vendor} · ₹${Number(exp.amount || 0).toFixed(2)}`,
        subtitle: `${exp.vendor || 'Vendor'} · ${exp.category || 'Expense'}`,
        createdAt: exp.createdAt,
        timestamp: exp.createdAt,
        targetType: 'expense',
        targetId: exp._id
      });
    });

    // Sort all combined activities by date descending
    allActivities.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));

    // Slice to the requested limit
    const sliced = allActivities.slice(0, limit);

    res.json({ activity: sliced });
  } catch (err) {
    console.error('Admin recent activity error:', err);
    res.status(500).json({ message: 'Failed to fetch admin recent activities' });
  }
}

module.exports = {
  listUsers,
  updateUserRole,
  getUserStats,
  recentActivity,
};
