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
    name: {
      type: String,
      required: true,
    },
    company: {
      type: String,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
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
      enum: ['New', 'Called', 'Emailed', 'Onhold', 'No Response', 'Interested', 'Converted', 'Disqualified', 'Moved to Deals'],
    },
    jobTitle: {
      type: String,
    },
    title: {
      type: String,
    },
    techStack: [{
      type: String,
    }],
    tech_stack: [{
      type: String,
    }],
    heatLevel: {
      type: String,
      enum: ['Hot', 'Warm', 'Cold'],
      default: 'Warm',
    },
    heat: {
      type: String,
      enum: ['Hot', 'Warm', 'Cold'],
      default: 'Warm',
      required: true,
    },
    leadScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    estimatedValue: {
      type: Number,
      default: 0,
    },
    value: {
      type: Number,
      default: 0,
    },
    lastContacted: {
      type: Date,
    },
    last_contacted_at: {
      type: Date,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    owner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: {
      type: String,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
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
LeadSchema.pre('validate', async function (next) {
  // 1. Name Sync
  const currentName = this.name || '';
  const expectedName = [this.fname, this.lname].filter(Boolean).join(' ').trim();
  if (currentName !== expectedName) {
    if (this.isModified('name') && this.name) {
      const parts = this.name.trim().split(/\s+/);
      this.fname = parts[0] || '';
      this.lname = parts.slice(1).join(' ') || '';
      this.name = [this.fname, this.lname].filter(Boolean).join(' ').trim();
    } else if (this.isModified('fname') || this.isModified('lname')) {
      this.name = expectedName;
    } else {
      if (this.name) {
        const parts = this.name.trim().split(/\s+/);
        this.fname = parts[0] || '';
        this.lname = parts.slice(1).join(' ') || '';
        this.name = [this.fname, this.lname].filter(Boolean).join(' ').trim();
      } else if (this.fname || this.lname) {
        this.name = expectedName;
      }
    }
  }

  // 2. Title Sync
  if (this.title !== this.jobTitle) {
    if (this.isModified('title')) {
      this.jobTitle = this.title;
    } else {
      this.title = this.jobTitle;
    }
  }

  // 3. Tech Stack Sync
  const techStackJson = JSON.stringify(this.techStack || []);
  const tech_stackJson = JSON.stringify(this.tech_stack || []);
  if (techStackJson !== tech_stackJson) {
    if (this.isModified('tech_stack')) {
      this.techStack = this.tech_stack;
    } else {
      this.tech_stack = this.techStack;
    }
  }

  // 4. Heat Sync
  if (this.heat !== this.heatLevel) {
    if (this.isModified('heat')) {
      this.heatLevel = this.heat;
    } else {
      this.heat = this.heatLevel;
    }
  }

  // 5. Score Sync
  if (this.score !== this.leadScore) {
    if (this.isModified('score')) {
      this.leadScore = this.score;
    } else {
      this.score = this.leadScore;
    }
  }

  // 6. Value Sync
  if (this.value !== this.estimatedValue) {
    if (this.isModified('value')) {
      this.estimatedValue = this.value;
    } else {
      this.value = this.estimatedValue;
    }
  }

  // 7. Owner Sync
  if (String(this.owner) !== String(this.owner_id)) {
    if (this.isModified('owner_id')) {
      this.owner = this.owner_id;
    } else {
      this.owner_id = this.owner;
    }
  }

  // 8. Last Contacted Sync
  const time1 = this.last_contacted_at ? new Date(this.last_contacted_at).getTime() : 0;
  const time2 = this.lastContacted ? new Date(this.lastContacted).getTime() : 0;
  if (time1 !== time2) {
    if (this.isModified('last_contacted_at')) {
      this.lastContacted = this.last_contacted_at;
    } else {
      this.last_contacted_at = this.lastContacted;
    }
  }

  // 9. Company ID / Name Sync
  try {
    const Company = mongoose.model('Company');
    if (this.isModified('company_id') && this.company_id) {
      const comp = await Company.findById(this.company_id);
      if (comp) this.company = comp.name;
    } else if (this.isModified('company') && this.company) {
      let comp = await Company.findOne({ name: new RegExp('^' + this.company.trim() + '$', 'i') });
      if (!comp) {
        comp = await Company.create({
          name: this.company.trim(),
          owner: this.owner || this.owner_id,
        });
      }
      this.company_id = comp._id;
    } else if (!this.company_id && this.company) {
      let comp = await Company.findOne({ name: new RegExp('^' + this.company.trim() + '$', 'i') });
      if (!comp) {
        comp = await Company.create({
          name: this.company.trim(),
          owner: this.owner || this.owner_id,
        });
      }
      this.company_id = comp._id;
    } else if (this.company_id && !this.company) {
      const comp = await Company.findById(this.company_id);
      if (comp) this.company = comp.name;
    }
  } catch (err) {
    console.error('Lead pre-validate company error:', err);
  }

  next();
});

LeadSchema.virtual('created_at').get(function() {
  return this.createdAt;
});
LeadSchema.virtual('updated_at').get(function() {
  return this.updatedAt;
});

LeadSchema.set('toJSON', { virtuals: true });
LeadSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Lead', LeadSchema);
