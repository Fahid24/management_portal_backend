const Employee = require("../model/employeeSchema");
const { hash, compare, withoutPassword } = require("../utils/secret");
const crypto = require("crypto");
const sendEmail = require("../utils/email");
const sendEmailUtil = require("../utils/emailService");
const {
  employeeOnboardingTemplate,
  generateSurveyEmailTemplate,
  otpEmail,
} = require("../utils/emailTemplates");
const Time = require("../utils/time");
const TTL = (parseInt(process.env.TOKEN_TTL_MINUTES, 10) || 30) * 60 * 1000;
const { companyName } = require("../constant/companyInfo");

/* ─────────────────── POST /api/auth/login ──────────────── */
async function login(req, res) {
  try {
    const user = await Employee.findOne({ email: req.body.email }).populate({
      path: "department",
      populate: { path: "departmentHeads" },
    });
    if (user?.status === "Terminated") {
      return res.status(403).json({ error: "User account is terminated" });
    }
    if (user?.status === "Resigned") {
      return res.status(403).json({ error: "User account is resigned" });
    }
    if (!user || !compare(req.body.password, user.password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const sampleData = {
      name: "John Smith",
      role: "Senior Tree Climber",
      email: "john.smith@monkeymans.com",
      morale: "High",
      support: "Usually",
      clarity: "Very Clear",
      skills: "Mostly Used",
      recognition: "Sometimes",
      safety: "Very Safe",
      suggestion: "Better communication tools would help during tree work.",
      followup: "Yes",
    };
    // console.log(employeeOnboardingTemplate);

    const emailHTML = generateSurveyEmailTemplate(sampleData);
    // sendEmailUtil(
    //  process.env.MAIL_USER,
    //   'Survey Notification',
    //   emailHTML,
    // )
    res.status(200).json({
      message: "User logged in successfully",
      user: withoutPassword(user),
    });
  } catch (err) {
    console.error("Error during login:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ─────────────── PATCH /api/auth/change-password ────────── */
async function changepassword(req, res) {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    const user = await Employee.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!compare(currentPassword, user.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    user.password = hash(newPassword);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Error during password change:", err);
    res
      .status(500)
      .json({ detail: "Internal Server Error", error: err.message });
  }
}

/* ------------------ POST /api/auth/forgot-password ----------------- */
async function forgotPassword(req, res) {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email is required" });

  const user = await Employee.findOne({ email });
  if (!user) return res.status(404).json({ error: "User not found" });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  const expiresAt = Time.now().plus({ milliseconds: TTL });
  user.resetPasswordExpires = Time.toJSDate(expiresAt);
  await user.save({ validateBeforeSave: false });

  const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

  await sendEmailUtil(
    user.email,
    "Reset your password",
    `
      <p>Hello ${user.firstName || ""},</p>
      <p>Click the link below to set a new password (valid ${
        TTL / 60000
      } min):</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>If you didn’t request this, just ignore this email.</p>
    `
  );

  res.status(200).json({ message: "Reset link sent to email" });
}

/* ------------------ POST /api/auth/reset-password ------------------ */
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res
      .status(400)
      .json({ error: "Both token and newPassword are required" });

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await Employee.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Time.toJSDate(Time.now()) },
  });

  if (!user) return res.status(400).json({ error: "Token invalid or expired" });

  user.password = hash(newPassword);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  res.status(200).json({ message: "Password reset successful" });
}

// --------------------- POST /api/auth/send-otp -----------------
async function sendOtp(req, res) {
  try {
    const { email } = req.body;

    const user = await Employee.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    user.otpCode = otp;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    // Minimal values for template
    const emailBody = otpEmail
      .replace(/\$firstName/g, user.firstName || "User")
      .replace(/\$otp/g, otp)
      .replace(/\$currentYear/g, new Date().getFullYear());

    await sendEmailUtil(
      user.email,
      `Your Verification Code - ${companyName}`,
      emailBody
    );

    res.status(200).json({ message: "OTP sent to your email." });
  } catch (err) {
    console.error("Error sending OTP:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

// POST /api/auth/verify-email-otp
async function verifyEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;

    const user = await Employee.findOne({ email });
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    if (
      !user.otpCode ||
      !user.otpExpiresAt ||
      user.otpCode !== otp ||
      new Date() > user.otpExpiresAt
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid or expired OTP" });
    }

    user.isEmailVerified = true;
    user.otpCode = "";
    user.otpExpiresAt = null;

    await user.save();
    // Optional: sanitize user object (remove password & sensitive fields)
    const { password, otpCode, otpExpiresAt, ...safeUser } = user.toObject();

    res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      user: safeUser,
    });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}

module.exports = {
  login,
  changepassword,
  forgotPassword,
  resetPassword,
  sendOtp,
  verifyEmailOtp,
};
