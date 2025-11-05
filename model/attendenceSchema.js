const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  from: { type: String }, // e.g., "office", "remote"
  latitude: { type: Number },
  longitude: { type: Number },
  locationName: { type: String }, // e.g., "New York", "San Francisco"
});

const AttendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    employeeShift: { type: String, default: "Day" },
    date: { type: Date },
    checkIn: { type: Date },
    checkOut: { type: Date },
    checkInLocation: { type: locationSchema}, // Location details
    checkOutLocation: { type: locationSchema }, // Location details
    // e.g., "New York", "San Francisco"
    status: { type: String, enum: ["present", "absent", "late", "on leave", "graced"], default: "present" },
    manuallyCreated: { type: Boolean, default: false }, // Whether attendance was created manually
    isStatusUpdated: { type: Boolean, default: false }, // Whether status was updated manually
    lateReason: { type: String }, // Reason for being late
    remarks: { type: String }, // Additional remarks
    updated: [
      {
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        updatedAt: { type: Date, default: Date.now },
        changes: { type: String }, // Description of changes made
      },
    ]
  },
  { timestamps: true }
);


AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
