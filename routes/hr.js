const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Candidate = require('../models/Candidate');
const HRActivity = require('../models/HRActivity');

router.use(authenticate);


function formatDateTime(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;

    return dt.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
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
      const subtitle = [rolePart, formatDateTime(sortDate)].filter(Boolean).join(' · ');

      return { id: c._id, candidateId: c._id, type, title, subtitle, icon, sortDate, timestamp: sortDate };
    });

    const modernActivity = logs
      .filter(l => l.type !== 'intake')
      .map(l => ({
        id: l.candidateId || l._id,
        candidateId: l.candidateId,
        type: l.type,
        title: l.title,
        subtitle: [l.subtitle, formatDateTime(l.createdAt)].filter(Boolean).join(' · '),
        icon: l.icon || 'person',
        metadata: l.metadata || {},
        sortDate: l.createdAt,
        timestamp: l.createdAt
      }));

    // Merge and sort
    const combined = [...modernActivity, ...legacyActivity]
      .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

    // De-duplicate by candidateId + type
    const seen = new Set();
    const unique = [];
    for (const item of combined) {
      const key = `${item.candidateId || item.id || item._id}-${item.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    const sliced = unique.slice(0, limit).map(({ sortDate, ...item }) => item);

    res.json({ activity: sliced });
  } catch (err) {
    console.error('HR recent activity error:', err);
    res.status(500).json({ message: 'Failed to fetch recent activity' });
  }
});


module.exports = router;

