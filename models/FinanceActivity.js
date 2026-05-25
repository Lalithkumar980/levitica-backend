const mongoose = require("mongoose");

const FinanceActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "invoice_created",
        "payment_added",
        "expense_added",
        "invoice",
        "payment",
        "expense",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
    },
    icon: {
      type: String,
      default: "banknote",
    },
    performedBy: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FinanceActivity", FinanceActivitySchema);
