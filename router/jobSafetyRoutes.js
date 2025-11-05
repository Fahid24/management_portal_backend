const express = require('express');
const router = express.Router();
const {
  createJobSafety,
  getAllJobSafety,
  getOneJobSafety,
  updateJobSafety,
  deleteJobSafety,
  getJobSafetyByEmployee
} = require('../controller/jobSafetyController');

// Create a new job safety record
router.post('/', createJobSafety);

// Get all job safety records with pagination
router.get('/', getAllJobSafety);

// Get a single job safety record by ID
router.get('/:id', getOneJobSafety);

// Update a job safety record
router.patch('/:id', updateJobSafety);

// Delete a job safety record
router.delete('/:id', deleteJobSafety);

// Get all job safety records for a specific employee
router.get('/employee/:employeeId', getJobSafetyByEmployee);

module.exports = router;
