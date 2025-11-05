const express = require("express");
const {
    submitEquipmentRequest,
    submitMaintenanceRequest,
    updateEquipmentRequest,
    updateMaintenanceRequest,
    deleteEquipmentRequest,
    deleteMaintenanceRequest,
    getEquipmentRequestsByEmployee,
    getMaintenanceRequestsByEmployee,
    getAllRequestsWithFilters,
    submitLearningRequest,
    updateLearningRequest,
    deleteLearningRequest,
    getLearningRequestsByEmployee
} = require("../controller/applicationsController");
const router = express.Router();

router.post("/equipment-request", submitEquipmentRequest);

router.post("/maintenance-request", submitMaintenanceRequest);

router.put('/equipment-request/:id', updateEquipmentRequest);

router.put('/maintenance-request/:id', updateMaintenanceRequest);

router.delete('/equipment/:id', deleteEquipmentRequest);

router.delete('/maintenance/:id', deleteMaintenanceRequest);

router.get('/equipment/employee/:employeeId', getEquipmentRequestsByEmployee);

router.get('/maintenance/employee/:employeeId', getMaintenanceRequestsByEmployee);

router.post('/learning-request', submitLearningRequest);

router.put('/learning-request/:id', updateLearningRequest);

router.delete('/learning-request/:id', deleteLearningRequest);

router.get('/learning/employee/:employeeId', getLearningRequestsByEmployee);

router.get('/all', getAllRequestsWithFilters)

module.exports = router;
