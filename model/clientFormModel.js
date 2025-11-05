const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
    },
    userId:{
      type:String
    },
    userRole:{
      type:String
    },
     date: {
      type: Date,

    },
    phone: {
      type: String,
      // required: [true, "Phone number is required"],
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    companyEmail: {
      type: String,
      // required: true,
      lowercase: true,
      trim: true,
    },
    companyLogo: {
      type: String,
    },
    clientType: {
      type: String,
      enum: ["One Time", "Recurring"],
    },
    paymentType: {
      type: String,
      enum: ["Prepaid", "Postpaid"],
    },
    country: String,
    state: String,
    timeZone: String,
    website: String,
    details: {
      type: String,
      default: "",
      trim: true,
    },
    services: [
      {
        label: { type: String, required: true },
        value: { type: String, required: true },
      },
    ],
    attachments: [
      {
        label: String, // "file" or "link"
        url: String, // URL of the uploaded file or link
        name: String, // file name or link name
      },
    ],
    employees: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee", // Reference to Employee collection
      // required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project", // Reference to Employee collection
      // required: true,
    },

    communicationChannels: [
      {
        type: {
          type: String,
          //  required: true
        },
        value: {
          type: String,
          //  required: true
        },
      },
    ],
    teamMembers: [
      {
        name: { type: String }, // Member name
        email: { type: String }, // Member email
        phone: { type: String }, // Member phone (optional if not always given)
        role: { type: String }, // Member role

       memberCommunicationChannel: [
          {
            type: { type: String },  // now just "whatsapp", "discord"
            value: {type: String}, // actual contact value
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClientInfo", clientSchema);
