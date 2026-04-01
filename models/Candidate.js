const mongoose = require('mongoose');

const referredBySchema = new mongoose.Schema(
  {
    initials: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  { _id: false }
);

const recruiterSchema = new mongoose.Schema(
  {
    initials: { type: String, default: '' },
    name: { type: String, default: '' },
  },
  { _id: false }
);

const PIPELINE_STAGES = ['Screening', 'Tech Round 1', 'Tech Round 2', 'HR Round', 'Final Decision'];

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    note: { type: String, default: null },
    position: { type: String, default: '—', trim: true },
    dept: { type: String, default: '—', trim: true },
    interviewDate: { type: String, default: '—', trim: true },
    came: { type: String, default: '—', trim: true },
    screening: { type: String, default: 'Not Yet', trim: true },
    technical: { type: String, default: 'Not Yet', trim: true },
    hrRound: { type: String, default: 'Not Yet', trim: true },
    offer: { type: String, default: '—', trim: true },
    salary: { type: String, default: '', trim: true },
    onboarding: { type: String, default: null },
    joiningDate: { type: String, default: null },
    referredBy: { type: referredBySchema, default: null },
    recruiter: { type: recruiterSchema, required: true, default: () => ({ initials: '—', name: '—' }) },

    // Hireflow-style intake & kanban pipeline (optional for legacy rows)
    email: { type: String, default: '', lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    candidateType: { type: String, enum: ['fresher', 'experienced'], default: 'fresher' },
    location: { type: String, default: '', trim: true },
    expYears: { type: Number, default: 0 },
    expectedSalaryLpa: { type: Number, default: 0 },
    currentCTCLpa: { type: Number, default: 0 },
    companyName: { type: String, default: '', trim: true },
    prevRoles: { type: String, default: '', trim: true },
    skills: { type: [String], default: [] },
    degree: { type: String, default: '', trim: true },
    college: { type: String, default: '', trim: true },
    graduationYear: { type: String, default: '', trim: true },
    source: { type: String, default: '', trim: true },
    refDetail: { type: String, default: '', trim: true },
    pipelineStage: {
      type: String,
      enum: PIPELINE_STAGES,
      default: 'Screening',
    },
    resumeUrl: { type: String, default: '' },
    resumeFilename: { type: String, default: '' },
  },
  { timestamps: true }
);

candidateSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }
);

candidateSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Candidate', candidateSchema);
