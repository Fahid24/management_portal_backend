const mongoose = require("mongoose");

const proofSchema = new mongoose.Schema({
  url: {
    type: String,

  },
  linkType: {
    type: String,
  },
});

const serviceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
});

const clientIncomeSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    receivedAmount: {
      type: Number,
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ClientInfo", // assuming you have a Client model
      // required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
    },
    refInvoiceNo: {
      type: String,
    },
    proof: [proofSchema],
    services: [serviceSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClientIncome", clientIncomeSchema);
