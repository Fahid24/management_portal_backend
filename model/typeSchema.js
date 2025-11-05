const mongoose = require("mongoose");

const TypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    logo: { type: String },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    description: { type: String },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    trackingMode: {
      type: String,
      enum: ["ASSET", "CONSUMABLE"],
      default: "ASSET"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Type", TypeSchema);
