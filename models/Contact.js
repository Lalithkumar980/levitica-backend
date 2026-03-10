const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema(
  {
    fname: {
      type: String,
      required: true,
    },
    lname: {
      type: String,
    },
    company: {
      type: String,
    },
    title: {
      type: String,
    }, // Job title e.g. CTO, CEO
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
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
      default: 'Lead',
      enum: ['Lead', 'Prospect', 'Customer'],
    },
    tags: [{ type: String }],
    notes: {
      type: String,
    },
    lastContact: {
      type: Date,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contact', ContactSchema);
