const mongoose = require('mongoose');

const HRActivitySchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Candidate',
      required: false,
      default: null,
    },
    candidateName: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['intake', 'stage_change', 'feedback', 'onboarding', 'joining', 'document_verification', 'offer_letter', 'payment'],
    },
    title: { type: String, required: true },
    subtitle: { type: String },
    icon: { type: String, default: 'person' },
    performedBy: { type: String }, // User name
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HRActivity', HRActivitySchema);
