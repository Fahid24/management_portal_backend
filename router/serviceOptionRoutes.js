const express = require("express");
const { addServiceOption, getServiceOption, deleteServiceOption } = require("../controller/serviceOptionController");

const router = express.Router();


// Add Services Option
router.post("/add", addServiceOption);
// Get Services Option
router.get("/", getServiceOption);

//delete service option
router.delete("/:id", deleteServiceOption);

module.exports = router;
