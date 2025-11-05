const express = require('express');
const router = express.Router();
const {
    getAdminConfig,
    checkSetupStatus,
    createAdminConfig,
    updateAdminConfig
} = require('../controller/adminConfigController');

// @route  GET /api/admin/config
router.get('/', getAdminConfig);

// @route  GET /api/admin/config/status
router.get('/status', checkSetupStatus);

// @route  POST /api/admin/config/setup
router.post('/setup', createAdminConfig);

// @route  PUT /api/admin/config/update
router.put('/update', updateAdminConfig);

module.exports = router;
