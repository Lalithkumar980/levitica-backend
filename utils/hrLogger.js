const HRActivity = require('../models/HRActivity');

/**
 * Log an HR activity event for the dashboard.
 */
async function logHRActivity({ candidateId, candidateName, type, title, subtitle, icon, performedBy }) {
  try {
    await HRActivity.create({
      candidateId: candidateId || null,
      candidateName: candidateName || 'Unknown',
      type,
      title,
      subtitle: subtitle || '',
      icon: icon || 'person',
      performedBy: performedBy || 'System',
    });
  } catch (err) {
    console.error('Failed to log HR activity:', err);
  }
}

module.exports = { logHRActivity };
