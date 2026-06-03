const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema(
  {
    // Legacy fields
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
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
    title: {
      type: String,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
      required: true,
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
      default: 'Prospect',
      enum: ['Prospect', 'Customer', 'Partner'],
    },
    department: {
      type: String,
      enum: ['Engineering', 'Product', 'IT', 'Procurement', 'C-Suite', 'Operations'],
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

    // Spec fields (Flow F)
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
    },
    company_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    type: {
      type: String,
      enum: ['Prospect', 'Customer', 'Partner'],
      default: 'Prospect',
      required: true,
    },
    last_activity_at: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound unique index for email per company
ContactSchema.index({ company_id: 1, email: 1 }, { unique: true });

// Bidirectional compatibility mapping
ContactSchema.pre('validate', async function (next) {
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

  // 2. Role Sync
  if (this.role !== this.title) {
    if (this.isModified('role')) {
      this.title = this.role;
    } else {
      this.role = this.title;
    }
  }

  // 3. Type Sync
  if (this.type !== this.status) {
    if (this.isModified('type')) {
      this.status = this.type;
    } else {
      this.type = this.status;
    }
  }

  // 4. Last Activity Sync
  const time1 = this.last_activity_at ? new Date(this.last_activity_at).getTime() : 0;
  const time2 = this.lastContact ? new Date(this.lastContact).getTime() : 0;
  if (time1 !== time2) {
    if (this.isModified('last_activity_at')) {
      this.lastContact = this.last_activity_at;
    } else {
      this.last_activity_at = this.lastContact;
    }
  }

  // 5. Company Sync
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
          owner: this.owner,
        });
      }
      this.company_id = comp._id;
      this.companyId = comp._id;
    } else if (this.company_id && !this.company) {
      const comp = await Company.findById(this.company_id);
      if (comp) this.company = comp.name;
    }
  } catch (err) {
    console.error('Contact pre-validate company error:', err);
  }

  next();
});

ContactSchema.virtual('created_at').get(function() {
  return this.createdAt;
});
ContactSchema.virtual('updated_at').get(function() {
  return this.updatedAt;
});

ContactSchema.set('toJSON', { virtuals: true });
ContactSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Contact', ContactSchema);
