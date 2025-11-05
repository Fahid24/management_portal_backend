// models/EducationalRequest.js
const mongoose = require('mongoose');

const EducationalRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    courseName: {
      type: String,
      required: true,
    },
    institution: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'urgent'],
      default: 'medium',
      required: true,
    },
    expectedStartDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'in-review'],
      default: 'pending',
    },
    documents: {
      type: [String], // file URLs or paths
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('EducationalRequest', EducationalRequestSchema);
