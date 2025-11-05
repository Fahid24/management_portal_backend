const express = require("express");
const router = express.Router();
const { login,changepassword, forgotPassword, resetPassword, sendOtp, verifyEmailOtp } = require("../controller/authController");

// login
router.post("/login", login);

// change password
router.patch("/changepassword", changepassword);

// forget password
router.patch('/forgotpassword', forgotPassword);

// reset password
router.patch('/resetpassword',  resetPassword); 

// send Otp
router.post("/send-otp", sendOtp);

// verify Email Otp
router.post("/verify-email-otp", verifyEmailOtp);

module.exports = router;