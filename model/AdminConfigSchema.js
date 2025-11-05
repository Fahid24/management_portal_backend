const mongoose = require("mongoose");
const { unitToPixels } = require("puppeteer");

const KPIWeightsSchema = new mongoose.Schema(
  {
    projectTask: Number,
    dailyTask: Number,
    attendance: Number,
    workHours: Number,
    leaveTaken: Number,
  },
  { _id: false }
);

const AdminConfigSchema = new mongoose.Schema({
  leaveLimitPerPeriod: Number,
  leavePeriodUnit: {
    type: String,
    enum: ["monthly", "yearly"],
    default: "yearly",
  },
  casualLeaveLimit: {
    unit: { type: String, enum: ["monthly", "yearly"], default: "yearly" },
    value: { type: Number, default: 0 },
  },
  annualLeaveLimit: {
    unit: { type: String, enum: ["monthly", "yearly"], default: "yearly" },
    value: { type: Number, default: 0 },
  },
  medicalLeaveLimit: {
    unit: { type: String, enum: ["monthly", "yearly"], default: "yearly" },
    value: { type: Number, default: 0 },
  },
  workingHours: {
    start: String, // "09:00"
    grace: String, // "09:15"
    end: String, // "18:00"
  },
  nightShiftWorkingHours: {
    start: String, // "21:00"
    grace: String, // "21:15"
    end: String, // "06:00"
  },
  maxStorage: {
    value: {
      type: Number,
      default: 800,
      min: 1,
    },
    unit: {
      type: String,
      enum: ["KB", "MB", "GB"],
      default: "MB",
    },
  },
  mealRates: {
    breakfast: { type: Number, default: 50 },
    lunch: { type: Number, default: 130 },
    dinner: { type: Number, default: 100 },
    evening_snacks: { type: Number, default: 5 },
    midnight_snacks: { type: Number, default: 50 },
  },
  guest: [
    {
      name: { type: String, required: true },
    },
  ],
  weekends: {
    type: [String],
    enum: [
      "Saturday",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ],
    default: ["Saturday"],
  },
  workHourPerDay: Number, // e.g., 8 hours
  workHourPerNight: Number, // e.g., 8 hours
  kpiWeights: KPIWeightsSchema,
  confirmation: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  createdAt: { type: Date, default: Date.now },
  updated: [
    {
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
      updatedAt: { type: Date, default: Date.now },
    },
  ],
});

module.exports = mongoose.model("AdminConfig", AdminConfigSchema);
