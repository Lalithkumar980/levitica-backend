const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
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
      default: '',
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', ExpenseSchema);
