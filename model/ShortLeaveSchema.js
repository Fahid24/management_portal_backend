const mongoose = require("mongoose");
const shortLeaveStatus = require("../constant/shortLevaeStatus");
const leaveAction = require("../constant/leaveAction");

const ShortLeaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

    date: { type: Date, required: true }, // Single day only
    startTime: { type: String, required: true }, // e.g. "14:00"
    endTime: { type: String, required: true },   // e.g. "16:30"

    durationHours: { type: Number }, // optional: calculated and saved for easy reporting

    reason: { type: String },

    status: {
      type: String,
      enum: shortLeaveStatus,
      default: shortLeaveStatus[0], // default to "pending_dept_head"
    },

    type: {
      type: String,
      enum: ["sick", "casual", "other"],
      default: "casual", // default to casual leave
    },

    // Department head approval
    deptHeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    deptHeadAction: { type: String, enum: leaveAction, default: leaveAction[0] }, // null, "approved", "rejected"
    deptHeadComment: { type: String },
    deptHeadActionAt: { type: Date },

    // Admin approval
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    adminAction: { type: String, enum: leaveAction, default: leaveAction[0] }, // null, "approved", "rejected"
    adminComment: { type: String },
    adminActionAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShortLeave", ShortLeaveSchema);
