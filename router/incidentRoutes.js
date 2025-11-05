const express = require('express');
const router = express.Router();
const { createIncident, getAllIncident, getOneIncident, updateIncident, deleteIncident } = require('../controller/incidentController');

// Get all incidents
router.get('/all', getAllIncident);

// Create a new incident
router.post('/create', createIncident);

// Get a single incident by ID
router.get('/:id', getOneIncident);

// Update an incident by ID
router.patch('/update/:id', updateIncident);

// Delete an incident by ID
router.delete('/:id', deleteIncident);

module.exports = router;
