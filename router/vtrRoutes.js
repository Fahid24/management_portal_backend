const express = require('express');
const router = express.Router();
const {
  getVTRs,
  createVTR,
  updateVTR,
  deleteVTR,
  getSingleVTR,
} = require('../controller/vtrController');

router.post('/create', createVTR); // Create a new VTR
router.get('/getAll', getVTRs); // Get all VTRs
router.delete('/delete/:id', deleteVTR); // Delete a VTR by ID
router.put('/update/:id', updateVTR); // Update a VTR by ID
router.get('/single/:id', getSingleVTR); // Get a single VTR by ID

module.exports = router;