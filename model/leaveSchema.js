const mongoose = require("mongoose");

const LeaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    leaveType: { 
      type: String, 
      enum: [
        "Medical",
        "Annual",
        "Casual"
      ], 
      required: true 
    },
    reason: { type: String },
    // Multi-stage status
    status: { 
      type: String, 
      enum: [
        "pending_dept_head", // waiting for department head
        "pending_admin",     // waiting for admin
        "approved",          // fully approved
        "rejected"           // rejected at any stage
      ], 
      default: "pending_dept_head" 
    },
    // Department head approval
    deptHeadId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    deptHeadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
    deptHeadAction: { type: String, enum: ["approved", "rejected", null], default: null },
    deptHeadComment: { type: String },
    deptHeadActionAt: { type: Date },
    // Admin approval
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    adminAction: { type: String, enum: ["approved", "rejected", null], default: null },
    adminComment: { type: String },
    adminActionAt: { type: Date },
    paidLeave: { type: Number, default: 0 },
    unpaidLeave: { type: Number, default: 0 },
  },
  { timestamps: true } 
);

module.exports = mongoose.model("Leave", LeaveSchema);
