const mongoose = require('mongoose');

const fileEntrySchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    /** Google Drive file id */
    driveFileId: { type: String, required: true },
    /** Shareable view link (anyone with link after permission set) */
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
    files: { type: [fileEntrySchema], default: [] },
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
