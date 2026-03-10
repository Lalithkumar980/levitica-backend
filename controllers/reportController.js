const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const User = require('../models/User');
const { scopeQueryByRole, canViewAll, requireManagerOrAdmin } = require('../middleware/roles');

const REP_FIELD = 'rep';
const STAGE_ORDER = ['lead', 'contacted', 'qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost'];
const ACTIVE_STAGES = STAGE_ORDER.filter((s) => s !== 'won' && s !== 'lost');

async function dashboard(req, res) {
  try {
    const leadFilter = scopeQueryByRole(req, {});
    const dealFilter = scopeQueryByRole(req, {});
    const activityFilter = scopeQueryByRole(req, {}, REP_FIELD);
    const taskFilter = scopeQueryByRole(req, {}, REP_FIELD);
    const [totalLeads, wonDeals, pipelineDeals, activityCount, overdueTasks] = await Promise.all([
      Lead.countDocuments(leadFilter),
      Deal.find({ ...dealFilter, stage: 'won' }).select('amount').lean(),
      Deal.find({ ...dealFilter, stage: { $in: ACTIVE_STAGES } }).select('amount').lean(),
      Activity.countDocuments(activityFilter),
      Task.countDocuments({ ...taskFilter, status: 'Pending', dueDate: { $lt: new Date() } }),
    ]);
    const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const pipelineValue = pipelineDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const wonCount = wonDeals.length;
    const lostCount = await Deal.countDocuments({ ...dealFilter, stage: 'lost' });
    const closedCount = wonCount + lostCount;
    const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;
    res.json({
      totalLeads, wonRevenue, pipelineValue, winRate, activityCount, overdueTasks, wonCount, lostCount,
    });
  } catch (err) {
    console.error('Dashboard report error:', err);
    res.status(500).json({ message: 'Failed to load dashboard' });
  }
}

async function pipeline(req, res) {
  try {
    const dealFilter = scopeQueryByRole(req, {});
    const groups = await Deal.aggregate([
      { $match: dealFilter },
      { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$amount' } } },
    ]);
    const byStage = {};
    STAGE_ORDER.forEach((s) => (byStage[s] = { stage: s, count: 0, totalValue: 0 }));
    groups.forEach((g) => {
      if (byStage[g._id]) {
        byStage[g._id].count = g.count;
        byStage[g._id].totalValue = g.totalValue;
      } else byStage[g._id] = { stage: g._id, count: g.count, totalValue: g.totalValue };
    });
    res.json({ pipeline: STAGE_ORDER.map((stage) => byStage[stage]) });
  } catch (err) {
    console.error('Pipeline report error:', err);
    res.status(500).json({ message: 'Failed to load pipeline' });
  }
}

async function repPerformance(req, res) {
  try {
    const reps = await User.find({ role: 'Sales Rep' }).select('_id name email').lean();
    const result = await Promise.all(
      reps.map(async (rep) => {
        const repId = rep._id;
        const [deals, wonDeals, pipelineDeals, lostDeals, calls, emails] = await Promise.all([
          Deal.find({ owner: repId }).select('amount stage').lean(),
          Deal.find({ owner: repId, stage: 'won' }).select('amount').lean(),
          Deal.find({ owner: repId, stage: { $in: ACTIVE_STAGES } }).select('amount').lean(),
          Deal.countDocuments({ owner: repId, stage: 'lost' }),
          Activity.countDocuments({ rep: repId, type: 'Call' }),
          Activity.countDocuments({ rep: repId, type: 'Email' }),
        ]);
        const wonValue = wonDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        const pipelineValue = pipelineDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
        const wonCount = wonDeals.length;
        const closedCount = wonCount + lostDeals;
        const winRate = closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;
        return {
          repId, repName: rep.name, repEmail: rep.email, dealsTotal: deals.length,
          wonCount, wonValue, pipelineValue, callsLogged: calls, emailsLogged: emails, winRate,
        };
      })
    );
    res.json({ reps: result });
  } catch (err) {
    console.error('Rep performance error:', err);
    res.status(500).json({ message: 'Failed to load rep performance' });
  }
}

async function forecast(req, res) {
  try {
    const deals = await Deal.find({ stage: { $in: ACTIVE_STAGES } }).select('amount prob').lean();
    const weighted = deals.reduce(
      (s, d) => s + (Number(d.amount) || 0) * ((Number(d.prob) || 0) / 100),
      0
    );
    res.json({ forecast: Math.round(weighted * 100) / 100, dealCount: deals.length });
  } catch (err) {
    console.error('Forecast error:', err);
    res.status(500).json({ message: 'Failed to load forecast' });
  }
}

async function leadsBySource(req, res) {
  try {
    const leadFilter = scopeQueryByRole(req, {});
    const groups = await Lead.aggregate([
      { $match: leadFilter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ bySource: groups.map((g) => ({ source: g._id || 'Unknown', count: g.count })) });
  } catch (err) {
    console.error('Leads-by-source error:', err);
    res.status(500).json({ message: 'Failed to load leads by source' });
  }
}

async function activities(req, res) {
  try {
    const activityFilter = scopeQueryByRole(req, {}, REP_FIELD);
    const byType = await Activity.aggregate([
      { $match: activityFilter },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    let perRep = null;
    if (canViewAll(req)) {
      const perRepAgg = await Activity.aggregate([
        { $group: { _id: { rep: '$rep', type: '$type' }, count: { $sum: 1 } } },
      ]);
      const repMap = {};
      perRepAgg.forEach((r) => {
        const repId = String(r._id.rep);
        if (!repMap[repId]) repMap[repId] = { repId, byType: {} };
        repMap[repId].byType[r._id.type] = r.count;
      });
      const repIds = [...new Set(perRepAgg.map((r) => String(r._id.rep)))];
      const users = await User.find({ _id: { $in: repIds } }).select('name').lean();
      const userMap = {};
      users.forEach((u) => (userMap[String(u._id)] = u.name));
      perRep = Object.entries(repMap).map(([repId, data]) => ({
        repId,
        repName: userMap[repId] || repId,
        byType: data.byType,
      }));
    }
    res.json({
      byType: byType.map((g) => ({ type: g._id, count: g.count })),
      perRep,
    });
  } catch (err) {
    console.error('Activities report error:', err);
    res.status(500).json({ message: 'Failed to load activities report' });
  }
}

module.exports = {
  dashboard,
  pipeline,
  repPerformance,
  forecast,
  leadsBySource,
  activities,
};
