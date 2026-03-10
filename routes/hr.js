const express = require('express');
const router = express.Router();
const Candidate = require('../models/Candidate');

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
 * Returns recent HR activity derived from Candidates.
 *
 * Response shape:
 * { activity: [{ type, title, subtitle, icon }] }
 */
router.get('/recent-activity', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const candidates = await Candidate.find()
      .select('name position dept offer onboarding createdAt joiningDate')
      .lean();

    // Map and sort by activity date (most recent first)
    let activity = candidates
      .map((c) => {
        const name = safeStr(c.name) || 'Candidate';
        const position = safeStr(c.position);
        const dept = safeStr(c.dept);
        const created = formatDate(c.createdAt);
        const joiningDate = formatDate(c.joiningDate);

        const offer = safeStr(c.offer);
        const onboarding = safeStr(c.onboarding);

        let type = 'candidate';
        let title = name;
        let icon = 'person';
        let activityDate = created;
        let sortDate = c.createdAt; // Default sort date

        if (onboarding === 'Completed') {
          type = 'joined';
          title = `${name} joined`;
          icon = 'person';
          activityDate = joiningDate || created;
          // Sort by joiningDate if available, otherwise createdAt
          sortDate = c.joiningDate ? new Date(c.joiningDate) : c.createdAt;
        } else if (offer === 'Done') {
          type = 'offer';
          title = `Offer done for ${name}`;
          icon = 'offer';
          sortDate = c.createdAt;
        }

        const rolePart = position && position !== '—' ? position : '';
        const deptPart = dept && dept !== '—' ? dept : '';
        const meta = [rolePart, deptPart].filter(Boolean).join(' · ');
        const subtitle = [meta, activityDate].filter(Boolean).join(' · ') || activityDate || '';

        return { type, title, subtitle, icon, sortDate };
      })
      .sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate)) // Sort by date descending
      .slice(0, limit) // Apply limit after sorting
      .map(({ sortDate, ...item }) => item); // Remove sortDate from final response

    res.json({ activity });
  } catch (err) {
    console.error('HR recent activity error:', err);
    res.status(500).json({ message: 'Failed to fetch recent activity' });
  }
});

module.exports = router;

