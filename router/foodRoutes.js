const express = require("express");
const router = express.Router();

const {
    createFoodRecord,
    updateFoodRecord,
    getFoodRecordByDate,
    getFoodStats,
    deleteFoodRecord,
    getAllFoodRecords,
    getEmployeesForFood,
    getFoodRecordById
} = require("../controller/foodsController");

// create or update
// router.post('/create', createOrUpdateFoodRecord);

router.post('/create', createFoodRecord);
// get employees for food
router.get('/employees', getEmployeesForFood);
// update
router.put('/update/:id', updateFoodRecord);

// get all food records
router.get('/all', getAllFoodRecords);

// stats
router.get('/stats', getFoodStats);

// get by id
router.get('/:id', getFoodRecordById);

router.delete('/delete/:id', deleteFoodRecord);
// fetch by date
router.get('/food', getFoodRecordByDate);



module.exports = router;