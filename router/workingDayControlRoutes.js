const express = require('express');
const {     
    createWorkingDayControl,
    getWorkingDayControl,
    getAllWorkingDayControls 
} = require('../controller/workingDayController');
const router = express.Router();

// Route to create a working day control record
router.post('/create', createWorkingDayControl);

// Route to get a working day control record for a specific month
router.get('/get', getAllWorkingDayControls);

// Route to check if a working day control record exists for a specific month
router.get('/exists', getWorkingDayControl);

module.exports = router;