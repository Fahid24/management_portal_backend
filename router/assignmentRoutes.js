const express = require('express');
const router = express.Router();

const {
    getAllAssignments,
    getSingleAssignment,
    updateTaskProgress,
    reviewTaskAssignment,
    getEmployeeAssignments
} = require('../controller/assignmentController');


// Get all assignments
router.get('/', getAllAssignments);

// Update task progress
router.put('/progress', updateTaskProgress);

// Review task assignment
router.put('/review', reviewTaskAssignment);

// Get all assignments for an employee
router.get('/employee/:id', getEmployeeAssignments);

// Get single assignment by ID
router.get('/:id', getSingleAssignment);


module.exports = router;