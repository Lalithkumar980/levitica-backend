const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['Call', 'Email', 'Meeting', 'Demo', 'Follow-up', 'Task'],
    },
    subject: {
      type: String,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    priority: {
      type: String,
      default: 'Medium',
      enum: ['High', 'Medium', 'Low'],
    },
    status: {
      type: String,
      default: 'Pending',
      enum: ['Pending', 'Completed'],
    },
    rep: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
    },
    company: {
      type: String,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', TaskSchema);
