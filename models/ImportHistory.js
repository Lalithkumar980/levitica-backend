const mongoose = require('mongoose');

const errorEntrySchema = new mongoose.Schema(
  {
    row: { type: Number },
    reason: { type: String },
  },
  { _id: false }
);

const ImportHistorySchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: true,
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    imported: {
      type: Number,
      default: 0,
    },
    duplicates: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Processing', 'Done', 'Failed'],
      default: 'Processing',
    },
    errors: [errorEntrySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImportHistory', ImportHistorySchema);
