const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
    details: { type: String, required: true },
    completion: { type: Number, min: 0, max: 100, default: 0 },
    isCompleted: { type: Boolean, default: false },
    completeAt: { type: Date },
    status: { type: String, enum: ["To Do", "In Progress", "Completed", "In Review"], default: "To Do" },
    completionTime: {
        value: { type: Number, min: 0, default: 0 }, // in hours
        unit: { type: String, enum: ["minutes", "hours", "days", "weeks"], default: "hours" }
    },
    kpi: { type: mongoose.Schema.Types.ObjectId, ref: "Kpi", required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Task", taskSchema);
