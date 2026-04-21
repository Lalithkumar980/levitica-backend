const mongoose = require('mongoose');

const documentSlotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, default: '' },
    uploaded: { type: Boolean, default: false },
    originalName: { type: String, default: '' },
    /** Google Drive file id */
    driveFileId: { type: String, default: '' },
    /** Shareable view link (anyone with link after permission set) */
    fileUrl: { type: String, default: '' },
    webUrl: { type: String, default: '' },
    contentType: { type: String, default: '' },
  },
  { _id: false }
);

/** Onboarding submissions (distinct from HR `Candidate` model). */
const onboardingCandidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    documentSlots: { type: [documentSlotSchema], default: [] },
    /** Denormalized from formData.mode for queries and HR lists. */
    applicationMode: {
      type: String,
      enum: ['fresher', 'experienced'],
      default: null,
      index: true,
    },
    /** Extra fields from the form (JSON-serializable). */
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
    invitationToken: { type: String, default: null },
  },
  { timestamps: true }
);

onboardingCandidateSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('OnboardingCandidate', onboardingCandidateSchema);
