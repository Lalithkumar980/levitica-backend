const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    industry: {
      type: String,
    },
    city: {
      type: String,
    },
    country: {
      type: String,
      default: 'India',
    },
    website: {
      type: String,
    },
    phone: {
      type: String,
    },
    employees: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    }, // Annual revenue in ₹
    status: {
      type: String,
      default: 'Lead',
      enum: ['Lead', 'Prospect', 'Customer', 'Partner'],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    deals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Deal' }],
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Company', CompanySchema);
