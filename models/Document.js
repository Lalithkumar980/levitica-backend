const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    }, // Original filename
    type: {
      type: String,
      required: true,
      enum: [
        'Proposal',
        'Contract',
        'Call Recording',
        'Document',
        'Presentation',
        'Other',
      ],
    },
    url: {
      type: String,
    }, // S3 / storage URL
    size: {
      type: String,
    }, // e.g. "2.4 MB" (display only)
    mimeType: {
      type: String,
    },
    company: {
      type: String,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', DocumentSchema);
