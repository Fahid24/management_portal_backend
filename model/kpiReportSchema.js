const mongoose = require("mongoose");

const kpiReportSchema = new mongoose.Schema({
  assigneeType: { type: String, enum: ["Employee", "Department"], required: true },
  assignee:     { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "assigneeType" },
  periodType:   { type: String, enum: ["day", "week", "month", "year"], required: true },
  periodStart:  { type: Date, required: true },
  periodEnd:    { type: Date, required: true },
  kpiScore:     { type: Number, required: true },
  weight:       { type: Number },
  details:      { type: Object }, // Use as needed for custom breakdowns
  calculatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("KPIReport", kpiReportSchema);
