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
  },
  { timestamps: true }
);

candidateSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Candidate', candidateSchema);
