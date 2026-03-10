const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
  {
    client: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
    },
    method: {
      type: String,
      default: '',
    },
    referenceNo: {
      type: String,
      default: '',
    },
    invoiceRef: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Payment', PaymentSchema);
