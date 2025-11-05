const express = require("express");
const router = express.Router();
const {
  checkIn,
  checkOut,
  createAttendance,
  getAttendanceRecords,
  getAttendanceStats,
  getSingleEmployeeWorkStats,
  getWorkStats,
  getAttendanceByEmployeeID,
  deleteAttendanceRecord,
  getAttendanceSummary,
  getAttendanceById,
  updateAttendanceRecord,
  getDetailedAttendanceReport,
} = require("../controller/attendenceController");

// Admin: Create attendance for any employee
router.post("/admin-create", createAttendance);

// Employee check-in
router.post("/checkin", checkIn);

// Employee check-out
router.post("/checkout", checkOut);

// Update attendance record by ID
router.put("/:id", updateAttendanceRecord);

// Get all working hour for all employee
router.get("/workstats/all", getWorkStats);

// Get working hour for a employee
router.get("/workstats/single", getSingleEmployeeWorkStats);

// Get all attendance stats
router.get("/stats", getAttendanceStats);

// Get attendance records for a specific employee by ID
router.get("/single-employee/:id", getAttendanceByEmployeeID);

// Delete attendance record by ID
router.delete("/:id", deleteAttendanceRecord);

// Get attendance summary for multiple employees
router.get("/summary", getAttendanceSummary);

// Get detailed attendance report with status codes
router.get("/detailed-report", getDetailedAttendanceReport);

// Get attendance by ID
router.get("/by-id/:id", getAttendanceById);

// Get attendance records for a specific employee by ID
router.get("/:employeeId", getAttendanceRecords);

module.exports = router;
