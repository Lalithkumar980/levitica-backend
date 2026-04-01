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
    type: {
      type: String,
      enum: ['Company', 'Training'],
      default: 'Company',
    },
    category: {
      type: String,
      enum: ['Revenue', 'Expense'],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', InvoiceSchema);
