const mongoose = require("mongoose");

// models/Department.js
const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  departmentHead: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  departmentHeads: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
  projectManagers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
  kpiCriteria: [{
    _id: false,
    kpi: { type: mongoose.Schema.Types.ObjectId, ref: "Kpi"},
    value: { type: Number, min: 0, max: 100}
  }],
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, { timestamps: true });

departmentSchema.virtual('employees', {
  ref: 'Employee',
  localField: '_id',
  foreignField: 'department',
  justOne: false //false
});



departmentSchema.set('toObject', { virtuals: true });
departmentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Department', departmentSchema);

