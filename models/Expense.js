const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['Infrastructure', 'Rent', 'Salaries', 'Software', 'Travel', 'Marketing', 'Utilities'],
      default: 'Infrastructure',
    },
    amount: {
      type: Number,
      required: true,
    },
    vendor: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Paid', 'Pending'],
      default: 'Paid',
    },
    paymentMethod: {
      type: String,
      default: '',
    },
    date: {
      type: Date,
    },
    receiptNo: {
      type: String,
      default: '',
    },
    recurring: {
      type: String,
      enum: ['No', 'Yes Monthly', 'One-off'],
      default: 'One-off',
    },
    notes: {
      type: String,
    },
    screenshotUrl: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', ExpenseSchema);
