const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      required: true,
    },
    client: {
      type: String,
      required: true,
    },
    clientEmail: {
      type: String,
      default: '',
    },
    clientPhone: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['Company', 'Training'],
      default: 'Company',
    },
    category: {
      type: String,
      enum: ['Revenue', 'Training', 'Placement', 'Services'],
      default: 'Revenue',
    },
    baseAmount: {
      type: Number,
      default: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
    },
    gst: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Overdue', 'Partial'],
      default: 'Pending',
    },
    paymentMethod: {
      type: String,
      default: '',
    },
    invoiceDate: {
      type: Date,
    },
    dueDate: {
      type: Date,
    },
    paidDate: {
      type: Date,
    },
    description: {
      type: String,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', InvoiceSchema);
