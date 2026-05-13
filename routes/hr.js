const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Candidate = require('../models/Candidate');
const HRActivity = require('../models/HRActivity');

router.use(authenticate);


function formatDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function safeStr(v) {
  const s = v == null ? '' : String(v).trim();
  return s;
}

/**
 * GET /api/hr/recent-activity
 * Returns recent HR activity including candidate intakes, stage changes, and feedback.
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    // Fetch recorded activities
    const logs = await HRActivity.find().sort({ createdAt: -1 }).limit(limit).lean();

    // If we have recorded activities, use them. 
    // We also fetch some candidates to ensure the list isn't empty on day 1.
    const candidates = await Candidate.find()
      .select('name position dept offer onboarding createdAt joiningDate')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const legacyActivity = candidates.map((c) => {
      const name = safeStr(c.name) || 'Candidate';
      const created = formatDate(c.createdAt);
      const offer = safeStr(c.offer);
      const onboarding = safeStr(c.onboarding);

      let type = 'candidate';
      let title = `Candidate added: ${name}`;
      let icon = 'person';
      let sortDate = c.createdAt;

      if (onboarding === 'Completed') {
        type = 'joined';
        title = `${name} joined`;
        sortDate = c.joiningDate ? new Date(c.joiningDate) : c.createdAt;
      } else if (offer === 'Done') {
        type = 'offer';
        title = `Offer done for ${name}`;
      }

      const rolePart = safeStr(c.position) && safeStr(c.position) !== '—' ? c.position : '';
      const subtitle = [rolePart, formatDate(sortDate)].filter(Boolean).join(' · ');

      return { type, title, subtitle, icon, sortDate };
    });

    const modernActivity = logs.map(l => ({
      type: l.type,
      title: l.title,
      subtitle: [l.subtitle, formatDate(l.createdAt)].filter(Boolean).join(' · '),
      icon: l.icon || 'person',
      sortDate: l.createdAt
    }));

    // Merge and sort
    const combined = [...modernActivity, ...legacyActivity]
      .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate))
      .slice(0, limit)
      .map(({ sortDate, ...item }) => item);

    res.json({ activity: combined });
  } catch (err) {
    console.error('HR recent activity error:', err);
    res.status(500).json({ message: 'Failed to fetch recent activity' });
  }
});


module.exports = router;

