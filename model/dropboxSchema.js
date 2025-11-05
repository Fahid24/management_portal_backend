const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    _id: Number, // explicitly define it as Number
    fileUrl: { type: String, required: true },
    docType: { type: String, default: "other" },
    fileSize: { type: Number, required: true },
  },
  { timestamps: true }
);

const dropboxSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    docName: { type: String, required: true },
    files: {
      type: [fileSchema],
      default: [],
      // validate: (v) => Array.isArray(v) && v.length > 0,
    },
    sharedWith: [
      {
        type: {
          type: String,
          enum: ["all", "user", "department"],
          required: true,
        },
        targetId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: "sharedWith.type", // dynamic ref
          required: function () {
            return this.type !== "all";
          },
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

dropboxSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_, ret) => {
    delete ret._id;
  },
});

module.exports = mongoose.model("Dropbox", dropboxSchema);
