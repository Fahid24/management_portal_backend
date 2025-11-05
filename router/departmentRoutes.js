// routes/departmentRoutes.js
const express = require("express");
const router = express.Router();
const {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  softDeleteDepartment,
  hardDeleteDepartment,
  getDepartmentList,
} = require("../controller/departmentController");

router.get("/", getDepartments);
router.get("/:id", getDepartmentById);
router.post("/", createDepartment);
router.patch("/:id", updateDepartment);
router.delete("/hard/:id", hardDeleteDepartment);
router.delete("/:id", softDeleteDepartment);
router.get("/departments/list", getDepartmentList);


module.exports = router;
