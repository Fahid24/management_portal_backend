const mongoose = require("mongoose");

const KpiSchema = new mongoose.Schema({
  criteria: { type: String, required: true, unique: true }, 
  description: String,  
  isDeleted: { type: Boolean, default: false },  
  deletedAt: { type: Date },  
}, { timestamps: true });

module.exports = mongoose.model("Kpi", KpiSchema);
