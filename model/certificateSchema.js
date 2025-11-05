// certificate schema
const mongoose = require("mongoose");
const certificateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  certificatePath: { type: String, required: true }, // Path to the generated certificate
  issuedAt: { type: Date, default: Date.now }, // When the certificate was issued
}, {
  timestamps: true,
});

module.exports = mongoose.model("Certificate", certificateSchema);