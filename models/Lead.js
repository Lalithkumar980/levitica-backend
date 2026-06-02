const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema(
  {
    fname: {
      type: String,
      required: true,
    },
    lname: {
      type: String,
      required: true,
    },
    company: {
      type: String,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    industry: {
      type: String,
      enum: [
        'Technology',
        'Healthcare',
        'Finance',
        'Retail',
        'Manufacturing',
        'Education',
        'Real Estate',
        'Logistics',
        'Hospitality',
        'Legal',
        'Media',
        'Other',
      ],
    },
    city: {
      type: String,
    },
    country: {
      type: String,
      default: 'India',
    },
    source: {
      type: String,
      required: true,
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
    status: {
      type: String,
      default: 'New',
      enum: ['New', 'Called', 'Emailed', 'No Response', 'Interested', 'Converted', 'Disqualified'],
    },
    jobTitle: {
      type: String,
    },
    techStack: [{
      type: String,
    }],
    heatLevel: {
      type: String,
      enum: ['Hot', 'Warm', 'Cold'],
      default: 'Warm',
    },
    leadScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    estimatedValue: {
      type: Number,
      default: 0,
    },
    lastContacted: {
      type: Date,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', LeadSchema);
