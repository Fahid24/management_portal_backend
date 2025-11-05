const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema({
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
  },
  completedDate: { type: Date, required: true },
  signature: { type: String, required: true },
  incidentDateTime: { type: Date, required: true },
  personsInvolved: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  }],
  incidentDescription: { type: String, required: true },
  witnesses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  }],
  injuries: { type: String, required: true },
  reportedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
  },
  reportedDate: Date,
  howReported: {
    type: String,
    enum: ["form", "in person", "email", "phone", "other"],
    default: "form"
  },
  followUpActions: { type: String, required: true },
});

module.exports = mongoose.model("Incident", incidentSchema);
