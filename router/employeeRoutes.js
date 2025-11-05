const express = require("express");
const router = express.Router();
const { onboarding, getAllUser, getSingleUser, updateEmployee, deleteEmployee, } = require("../controller/employeeController");

// all user
router.get("/all", getAllUser);

// single user
router.get("/:id", getSingleUser);

// onboarding
router.post("/onboarding", onboarding);

// update 
router.patch("/update", updateEmployee);

// delete
router.delete("/:id", deleteEmployee);

module.exports = router;