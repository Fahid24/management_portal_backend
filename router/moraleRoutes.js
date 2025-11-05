const express = require('express');
const router = express.Router();
const { createMoral, getAllMorals } = require('../controller/moralController');

router.post('/create', createMoral);
router.get('/all', getAllMorals);

module.exports = router;
