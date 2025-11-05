const express = require("express");
const router = express.Router();
const {
  requestLeave,
  deptHeadAction,
  adminAction,
  getLeaves,
  getLeaveStats,
  getLeavesByUserId,
  getLeaveStatsForAdmin,
  getLeavesForDepartmentHead,
  getSingleLeave,
  updateLeave,
  deleteLeave,
} = require("../controller/leaveController");

// Get leave requests (filter by employee or department)
router.get("/", getLeaves);

// Get leave stats
router.get("/stats", getLeaveStats);

// Get leave statistics for admin/department head with role-based access
router.get("/admin-stats", getLeaveStatsForAdmin);

// Employee submits leave request
router.post("/request", requestLeave);

// Department head approves/rejects leave
router.patch("/dept-head-action/:id", deptHeadAction);

// Admin approves/rejects leave
router.patch("/admin-action/:id", adminAction);

// Get leave requests by userID
router.get("/user/:userId", getLeavesByUserId);

// Department head: get all leave requests for their department's employees
router.get("/department-head/leaves", getLeavesForDepartmentHead);

// Get single leave request by ID
router.get("/:id", getSingleLeave);

// Update leave request
router.put("/:id", updateLeave);

// Delete leave request
router.delete("/:id", deleteLeave);

module.exports = router;
