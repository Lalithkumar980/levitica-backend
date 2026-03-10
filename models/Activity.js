const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'Call',
        'Email',
        'Meeting',
        'Demo',
        'Follow-up',
        'Note',
        'Task',
      ],
    },
    subject: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      required: true,
    }, // Mandatory per SOW
    date: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      default: 0,
    }, // Duration in minutes (calls)
    outcome: {
      type: String,
      enum: [
        'Connected - Interested',
        'Connected - Not Interested',
        'Voicemail',
        'No Answer',
        'Callback Requested',
        'Wrong Number',
        'Follow-up Scheduled',
        '',
      ],
    },
    company: {
      type: String,
    }, // Denormalized company name
    recording: {
      type: String,
    }, // Filename or URL of call recording
    rep: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },
    followupDate: {
      type: Date,
    },
    followupType: {
      type: String,
    },
  },
  { timestamps: true }
);

// POST-SAVE hook: if followupDate set, auto-create a Task; update deal.lastAct
ActivitySchema.post('save', async function (doc) {
  if (doc.followupDate) {
    try {
      const Task = mongoose.model('Task');
      await Task.create({
        type: doc.followupType || 'Follow-up',
        subject: `Follow-up: ${doc.subject}`,
        dueDate: doc.followupDate,
        priority: 'Medium',
        status: 'Pending',
        rep: doc.rep,
        dealId: doc.dealId,
        company: doc.company,
        notes: 'Auto-created',
      });
    } catch (err) {
      if (err.name !== 'MissingSchemaError') throw err;
      // Task model not registered yet; skip auto-creation
    }
  }
  if (doc.dealId) {
    const Deal = mongoose.model('Deal');
    await Deal.findByIdAndUpdate(doc.dealId, { lastAct: doc.date });
  }
});

module.exports = mongoose.model('Activity', ActivitySchema);
