const mongoose = require('mongoose');

// Stage → Probability % (enforce when stage changes in routes):
const STAGE_PROBABILITY = {
  qualified: 40,
  meeting: 55,
  proposal: 70,
  negotiation: 85,
  won: 100,
  lost: 0,
  Qualified: 40,
  Proposal: 70,
  Negotiation: 85,
  Won: 100,
  Lost: 0,
};

const DealSchema = new mongoose.Schema(
  {
    // Legacy fields
    title: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
    },
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
    },
    stage: {
      type: String,
      required: true,
      default: 'Proposal',
      enum: [
        'meeting',
        'proposal',
        'negotiation',
        'won',
        'qualified',
        'lost',
        'Qualified',
        'Proposal',
        'Negotiation',
        'Won',
        'Lost',
      ],
    },
    prob: {
      type: Number,
      min: 0,
      max: 100,
      default: 55,
    },
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
    },
    lastAct: {
      type: Date,
    },
    notes: {
      type: String,
    },
    activities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Activity' }],
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],

    // Spec fields (Flow E)
    name: {
      type: String,
      required: true,
    },
    source_lead_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    sourceLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
    },
    contact: {
      type: String,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
    },
    heat: {
      type: String,
      enum: ['Hot', 'Warm', 'Cold'],
      default: 'Warm',
      required: true,
    },
    heatLevel: {
      type: String,
      enum: ['Hot', 'Warm', 'Cold'],
      default: 'Warm',
    },
    expected_close_date: {
      type: Date,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    last_contacted_at: {
      type: Date,
    },
    lost_reason: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { timestamps: true }
);

// Bidirectional compatibility mapping
DealSchema.pre('validate', async function (next) {
  // 1. Stage Normalization
  if (this.stage) {
    const stageMap = {
      qualified: 'Qualified',
      Qualified: 'Qualified',
      meeting: 'Proposal',
      proposal: 'Proposal',
      Proposal: 'Proposal',
      negotiation: 'Negotiation',
      Negotiation: 'Negotiation',
      won: 'Won',
      Won: 'Won',
      lost: 'Lost',
      Lost: 'Lost',
    };
    const norm = stageMap[this.stage];
    if (norm) {
      this.stage = norm;
    }
  }

  // 2. Lost Reason Check
  if (this.stage === 'Lost' && !this.lost_reason) {
    return next(new Error('A reason is required when marking a deal as Lost.'));
  }

  // 3. Name/Title Sync
  const nameDiff = this.name !== this.title;
  if (nameDiff) {
    if (this.isModified('name')) {
      this.title = this.name;
    } else if (this.isModified('title')) {
      this.name = this.title;
    }
  }

  if (!this.name && !this.title) {
    let contactName = 'Contact';
    if (this.contact_id || this.contactId) {
      try {
        const Contact = mongoose.model('Contact');
        const c = await Contact.findById(this.contact_id || this.contactId);
        if (c) {
          contactName = [c.fname, c.lname].filter(Boolean).join(' ').trim();
        }
      } catch (err) {
        console.error('Deal pre-validate contact lookup error:', err);
      }
    } else if (this.contact) {
      contactName = this.contact.trim();
    }
    const monthYear = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' });
    this.name = `${contactName} – ${monthYear}`;
    this.title = this.name;
  }

  // 4. Company ID & Name Sync
  try {
    const Company = mongoose.model('Company');
    if (String(this.companyId) !== String(this.company_id)) {
      if (this.isModified('company_id') && this.company_id) {
        this.companyId = this.company_id;
        const comp = await Company.findById(this.company_id);
        if (comp) this.company = comp.name;
      } else if (this.isModified('companyId') && this.companyId) {
        this.company_id = this.companyId;
        const comp = await Company.findById(this.companyId);
        if (comp) this.company = comp.name;
      } else if (this.company_id) {
        this.companyId = this.company_id;
      } else if (this.companyId) {
        this.company_id = this.companyId;
      }
    }

    if (!this.company_id && this.company) {
      let comp = await Company.findOne({ name: new RegExp('^' + this.company.trim() + '$', 'i') });
      if (!comp) {
        comp = await Company.create({
          name: this.company.trim(),
          owner: this.owner || this.owner_id,
        });
      }
      this.company_id = comp._id;
      this.companyId = comp._id;
    } else if (this.company_id && !this.company) {
      const comp = await Company.findById(this.company_id);
      if (comp) this.company = comp.name;
    }
  } catch (err) {
    console.error('Deal pre-validate company sync error:', err);
  }

  // 5. Contact ID & Name Sync
  try {
    const Contact = mongoose.model('Contact');
    if (String(this.contactId) !== String(this.contact_id)) {
      if (this.isModified('contact_id') && this.contact_id) {
        this.contactId = this.contact_id;
      } else if (this.isModified('contactId') && this.contactId) {
        this.contact_id = this.contactId;
      } else if (this.contact_id) {
        this.contactId = this.contact_id;
      } else if (this.contactId) {
        this.contact_id = this.contactId;
      }
    }

    if (this.contact_id && !this.contact) {
      const c = await Contact.findById(this.contact_id);
      if (c) this.contact = [c.fname, c.lname].filter(Boolean).join(' ').trim();
    } else if (!this.contact_id && this.contact) {
      const parts = this.contact.trim().split(/\s+/);
      const fname = parts[0] || 'Contact';
      const lname = parts.slice(1).join(' ') || '';

      let c = await Contact.findOne({ fname, lname });
      if (!c) {
        c = await Contact.create({
          fname,
          lname,
          phone: '0000000000',
          company: this.company,
          companyId: this.company_id || this.companyId,
          owner: this.owner || this.owner_id,
        });
      }
      this.contact_id = c._id;
      this.contactId = c._id;
    }
  } catch (err) {
    console.error('Deal pre-validate contact sync error:', err);
  }

  // 6. Value Sync
  if (this.value !== this.amount) {
    if (this.isModified('value')) {
      this.amount = this.value;
    } else {
      this.value = this.amount;
    }
  }

  // 7. Heat Sync
  if (this.heat !== this.heatLevel) {
    if (this.isModified('heat')) {
      this.heatLevel = this.heat;
    } else {
      this.heat = this.heatLevel;
    }
  }

  // 8. Close Date Sync
  const time1 = this.expected_close_date ? new Date(this.expected_close_date).getTime() : 0;
  const time2 = this.closeDate ? new Date(this.closeDate).getTime() : 0;
  if (time1 !== time2) {
    if (this.isModified('expected_close_date')) {
      this.closeDate = this.expected_close_date;
    } else {
      this.expected_close_date = this.closeDate;
    }
  }

  // 9. Owner Sync
  if (String(this.owner) !== String(this.owner_id)) {
    if (this.isModified('owner_id')) {
      this.owner = this.owner_id;
    } else {
      this.owner_id = this.owner;
    }
  }

  // 10. Last Contacted Sync
  const time3 = this.last_contacted_at ? new Date(this.last_contacted_at).getTime() : 0;
  const time4 = this.lastAct ? new Date(this.lastAct).getTime() : 0;
  if (time3 !== time4) {
    if (this.isModified('last_contacted_at')) {
      this.lastAct = this.last_contacted_at;
    } else {
      this.last_contacted_at = this.lastAct;
    }
  }

  // 11. source_lead_id / sourceLeadId Sync
  if (String(this.sourceLeadId) !== String(this.source_lead_id)) {
    if (this.isModified('source_lead_id')) {
      this.sourceLeadId = this.source_lead_id;
    } else {
      this.source_lead_id = this.sourceLeadId;
    }
  }

  next();
});

DealSchema.virtual('created_at').get(function () {
  return this.createdAt;
});
DealSchema.virtual('updated_at').get(function () {
  return this.updatedAt;
});
DealSchema.virtual('deal_age_days').get(function () {
  if (!this.createdAt) return 0;
  return Math.floor((Date.now() - this.createdAt) / 86400000);
});

DealSchema.set('toJSON', { virtuals: true });
DealSchema.set('toObject', { virtuals: true });

DealSchema.statics.getProbabilityForStage = function (stage) {
  return STAGE_PROBABILITY[stage] ?? 10;
};

module.exports = mongoose.model('Deal', DealSchema);
module.exports.STAGE_PROBABILITY = STAGE_PROBABILITY;
