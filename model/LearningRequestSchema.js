const mongoose = require('mongoose');

// Learning request schema for any user to request a learning module/topic
const LearningRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    topicTitle: {
      type: String,
      required: true,
    },
    educationType: {
      type: String,
      enum: [
        "Internal Training",
        "In-Person Conference",
        "Online Training"
      ],
      required: true,
    },
    topicDescription: {
      type: String,
      required: true,
    },
    preferredLearningFormat: {
      type: String,
      enum: ["video", "article", "course", "webinar", "any"],
      default: "any",
    },
    justification: {
      type: String,
      required: false, // Optional: Why the employee wants to learn this
    },
    priority: {
      type: String,
      enum: ["low", "medium", "urgent"],
      default: "medium",
    },
    expectedCompletionDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "in-progress"],
      default: "pending",
    },
    responseBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee", // Use Employee for admin/manager/any responder
    },
    responseAt: {
      type: Date,
    },
    responseRemarks: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('LearningRequest', LearningRequestSchema);
