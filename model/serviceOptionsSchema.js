const mongoose = require("mongoose");

const serviceOptionSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceOption", serviceOptionSchema);
