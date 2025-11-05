const express = require("express"); 
const router = express.Router();

const {
    getShortLeaveRequests,
    requestShortLeave,
    handleShortLeaveAction,
    getSingleShortLeave,
    updateShortLeave,
    deleteLeaveRequest,
} = require("../controller/shortLeaveController");

// Get all short leave requests
router.get("/", getShortLeaveRequests);

// Employee requests a short leave
router.post("/request", requestShortLeave);

// Department head or admin handles short leave action
router.patch("/action/:id", handleShortLeaveAction);

// Get a single short leave request by ID
router.get("/:id", getSingleShortLeave);

// Update a short leave request
router.patch("/update/:id", updateShortLeave);

// Delete a short leave request
router.delete("/delete/:id", deleteLeaveRequest);

module.exports = router;
