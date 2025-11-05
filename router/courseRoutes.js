// routes/course.js
const express = require("express");
const router = express.Router();
const courseController = require("../controller/courseController");

router.post("/", courseController.createCourse);
router.get("/", courseController.getAllCourses);
router.get("/course-summary", courseController.getCourseSummary);
router.get("/user-summaries", courseController.getUserCourseSummaries);
router.get("/:id", courseController.getCourseById);
router.put("/:id", courseController.updateCourse);
router.delete("/:id", courseController.deleteCourse);
router.get("/:id/progress", courseController.getCourseProgress);
router.get("/by-department/:departmentId", courseController.getCoursesByDepartmentId);
router.get("/completed/all", courseController.getAllCompletedUsersWithCourses);
router.put("/completed/all/:progressId", courseController.updateCertificateApproval);

module.exports = router;
