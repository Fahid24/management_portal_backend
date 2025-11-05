const mongoose = require("mongoose");
const Time = require("../utils/time");

const ExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    category: { type: String, required: true },
    amount: { type: Number, default: 0 },

    // Date fields
    date: { type: Date, required: true }, // full date
    monthKey: { type: String }, // e.g. "2025-08"
    yearKey: { type: String },  // e.g. "2025"

    proofUrl: { type: [String] }, // file/image

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },

    // Audit history
    history: [
      {
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        changes: {type: String },
        date: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Auto-populate monthKey & yearKey before saving
ExpenseSchema.pre("save", function (next) {
  if (this.date) {
    const dt = Time.fromJSDate(this.date);
    if (Time.isValidDateTime(dt)) {
      this.monthKey = dt.toFormat("yyyy-MM");
      this.yearKey = dt.toFormat("yyyy");
    }
  }
  next();
});

module.exports = mongoose.model("Expense", ExpenseSchema);
