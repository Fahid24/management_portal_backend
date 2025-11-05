const express = require("express");
const router = express.Router();
const progressController = require("../controller/progressController");

// Track lesson/quiz progress
router.post("/", progressController.trackProgress);

// Admin: Get all progress on a course
router.get("/course/:courseId", progressController.getCourseProgress);

// Get user's course progress
router.get("/:userId/:courseId", progressController.getUserProgress);

// generate certificate
router.post("/certificate", progressController.generateCertificate);

// get all certificates for a user
router.get("/certificate/user/:userId", progressController.getAllCertificateByUser);

// get certificate
router.get("/certificate/:userId/:courseId", progressController.getCertificate);

// verify certificate (for QR code)
router.get("/certificate/verify/:userId/:courseId", progressController.verifyCertificate);

module.exports = router;
