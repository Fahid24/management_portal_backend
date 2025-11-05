const mongoose = require("mongoose");

const taskAssignmentSchema = new mongoose.Schema({
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true }],
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    status: { type: String, enum: ["NotStarted", "InProgress", "InReview", "Completed", "OnHold", "Reviewed"], default: "NotStarted" },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department"},
    attachment: [{ type: String }],
    assignedAt: { type: Date, default: Date.now },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    reviewedAt: { type: Date } 
}, { timestamps: true });

module.exports = mongoose.model("TaskAssignment", taskAssignmentSchema);