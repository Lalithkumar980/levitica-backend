const HRActivity = require('../models/HRActivity');
const { broadcast } = require('./broadcast');

/**
 * Log an HR activity event for the dashboard.
 */
async function logHRActivity({ candidateId, candidateName, type, title, subtitle, icon, performedBy, metadata }) {
  try {
    const doc = await HRActivity.create({
      candidateId: candidateId || null,
      candidateName: candidateName || 'Unknown',
      type,
      title,
      subtitle: subtitle || '',
      icon: icon || 'person',
      performedBy: performedBy || 'System',
      metadata: metadata || {},
    });

    // Broadcast real-time notification to all connected WebSocket clients
    broadcast({
      type: `hr_${type}`,
      data: {
        title,
        subtitle: subtitle || '',
        createdAt: doc.createdAt,
        candidateId: candidateId || null,
        candidateName: candidateName || 'Unknown',
        ...(metadata || {}),
      },
    });
  } catch (err) {
    console.error('Failed to log HR activity:', err);
  }
}

module.exports = { logHRActivity };

