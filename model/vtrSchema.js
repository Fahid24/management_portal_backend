const mongoose = require('mongoose');

const vtrSchema = new mongoose.Schema({
  workOrder: { type: String, required: true },
  customerName: { type: String, required: true },
  dateOfProject: { type: String, required: true },
  estimatedTime: { type: String, required: true },
  actualTime: { type: String, required: true },
  completedBy: { type: String, required: true },
  crewMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }],
  crewTeam: { type: String },
  feedback: { type: String, required: true },
  salesRep: { type: String, required: true },
  timeSlots: { type: Object },
  timeToComplete: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
});

module.exports = mongoose.model('VTR', vtrSchema);
