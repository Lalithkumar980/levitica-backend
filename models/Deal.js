const mongoose = require('mongoose');

// Stage → Probability % (enforce when stage changes in routes):
// lead: 10% | contacted: 25% | qualified: 40% | meeting: 55%
// proposal: 70% | negotiation: 85% | won: 100% | lost: 0%
const STAGE_PROBABILITY = {
  lead: 10,
  contacted: 25,
  qualified: 40,
  meeting: 55,
  proposal: 70,
  negotiation: 85,
  won: 100,
  lost: 0,
};

const DealSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
    }, // Company name (denormalized for speed)
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    }, // In ₹
    stage: {
      type: String,
      required: true,
      default: 'lead',
      enum: [
        'lead',
        'contacted',
        'qualified',
        'meeting',
        'proposal',
        'negotiation',
        'won',
        'lost',
      ],
    },
    prob: {
      type: Number,
      min: 0,
      max: 100,
      default: 10,
    }, // probability %
    product: {
      type: String,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    source: {
      type: String,
      enum: [
        'Website',
        'Referral',
        'Cold Call',
        'LinkedIn',
        'Email Campaign',
        'Event/Trade Show',
        'Partner',
        'Walk-in',
        'Database',
        'Social Media',
        'Advertisement',
        'Other',
      ],
    },
    industry: {
      type: String,
    },
    city: {
      type: String,
    },
    closeDate: {
      type: Date,
    },
    followup: {
      type: Date,
    }, // Next follow-up date
    lastAct: {
      type: Date,
    }, // Auto-updated on activity log
    notes: {
      type: String,
    },
    activities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Activity' }],
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  },
  { timestamps: true }
);

// Helper: get probability for a stage (for use when stage changes)
DealSchema.statics.getProbabilityForStage = function (stage) {
  return STAGE_PROBABILITY[stage] ?? 10;
};

module.exports = mongoose.model('Deal', DealSchema);
module.exports.STAGE_PROBABILITY = STAGE_PROBABILITY;
