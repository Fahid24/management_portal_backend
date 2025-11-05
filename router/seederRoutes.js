const express = require("express");
const router = express.Router();
const { handleSeederAction } = require("../controller/seederController");

router.post("/run-seeder", handleSeederAction);

module.exports = router;
