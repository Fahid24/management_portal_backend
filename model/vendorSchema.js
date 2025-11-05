const mongoose = require("mongoose");

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    logo: { type: String },
    contactPerson: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    address: { type: String },
    website: { type: String },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" }, // Active/Inactive status
    documents: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", VendorSchema);
