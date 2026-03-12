const mongoose = require('mongoose');

const trainingFeeSchema = new mongoose.Schema(
  {
    candidateName: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    totalFees: { type: Number, required: true, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, default: 'Pending', trim: true }, // Paid | Partial | Pending
    paymentMode: { type: String, default: '', trim: true },
    date: { type: Date, default: null },
    referredBy: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

trainingFeeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  const balance = Math.max(0, (obj.totalFees || 0) - (obj.paidAmount || 0));
  obj.balance = balance;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('TrainingFee', trainingFeeSchema);
