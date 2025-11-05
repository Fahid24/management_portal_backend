const mongoose = require("mongoose");

const CredentialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  description: { type: String },
  sharedWith: [
    {
      type: {
        type: String,
        enum: ["all", "user", "department"],
        required: true,
      },
      targetId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "sharedWith.type",
        required: function () {
          return this.type !== "all";
        },
      },
      sharedAt: { type: Date, default: Date.now },
    },
  ],
});

const ProjectCredentialSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    projectName: {
      type: String,
      required: true,
    },
    credentials: [CredentialSchema],
    sharedWith: [
      {
        type: {
          type: String,
          enum: ["all", "user", "department"],
          required: true,
        },
        targetId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "sharedWith.type",
          required: function () {
            return this.type !== "all";
          },
        },
        sharedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);


module.exports = mongoose.model("ProjectCredential", ProjectCredentialSchema);
