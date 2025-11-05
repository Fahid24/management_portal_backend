const mongoose = require("mongoose");
const employmentType = require("../constant/employmentType");
const jobType = require("../constant/jobType");
const status = require("../constant/status");
const role = require("../constant/role");
const maritalStatus = require("../constant/maritalStatus");
const gender = require("../constant/gender");
const religion = require("../constant/religion");
const fillingStatus = require("../constant/fillingStatus");

const AddressSchema = new mongoose.Schema(
  {
    address: { type: String, default: "" },
    houseNo: { type: String, default: "" },
    flatNo: { type: String, default: "" },
    roadNo: { type: String, default: "" },
    union: { type: String, default: "" },
    subDistrict: { type: String, default: "" },
    district: { type: String, default: "" },
    postOffice: { type: String, default: "" },
    policeStation: { type: String, default: "" },
    village: { type: String, default: "" },
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    zip: { type: String, default: "" },
    currentAddress: { type: String, default: "" },
    proofType: { type: String, default: "" },
    utilityProofUrl: { type: String, default: "" }
  },
  { _id: false }
);

const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    relationship: { type: String, default: "" },
    phonePrimary: { type: String, default: "" },
    phoneAlternate: { type: String, default: "" },
    email: { type: String, default: "" },
    address: { type: String, default: "" },
    nid: { type: String, default: "" },
    nidPhotoUrl: { type: String, default: "" },
    occupation: { type: String, default: "" },
    businessName: { type: String, default: "" },
  },
  { _id: false }
);

const DocumentSchema = new mongoose.Schema(
  {
    docName: { type: String },
    docType: { type: String, default: "" },
    fileUrl: { type: String },
    description: { type: String },
  },
  { _id: false }
);

const FamilyMemberSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    relation: { type: String, default: "" },
  },
  { _id: false }
);
const BankInfoSchema = new mongoose.Schema(
  {
    routingNumber: { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    bankName: { type: String, default: "" },
    branchName: { type: String, default: "" },
  },
  { _id: false }
);

const PreviousWorkExperienceSchema = new mongoose.Schema(
  {
    designation: { type: String, required: true },
    joiningDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    jobType: {
      type: String,
      enum: jobType,
      default: jobType[0],
    },
    employmentType: {
      type: String,
      enum: employmentType,
      default: employmentType[0],
    },
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String },
    bloodGroup: { type: String, default: "" },
    designation: { type: String, default: "" },
    email: { type: String, required: true, unique: true },
    ssnLast4: { type: String, match: /^\d{4}$/, default: "" },
    password: { type: String, required: true, minlength: 6 },
    address: AddressSchema,
    photoUrl: { type: String, default: "" },
    dateOfBirth: { type: Date },
    nid: { type: String, default: "" },
    nidPhotoUrl: { type: String, default: "" },
    birthCertificateNo: { type: String, default: "" },
    religion: {
      type: String,
      enum: religion,
      default: religion[0],
    },
    gender: {
      type: String,
      enum: gender,
      default: gender[0],
    },
    maritalStatus: {
      type: String,
      enum: maritalStatus,
      default: maritalStatus[0],
    },

    role: {
      type: String,
      enum: role,
      default: role[0],
    },
    status: {
      type: String,
      enum: status,
      default: status[0],
    },
    employmentType: {
      type: String,
      enum: employmentType,
      default: employmentType[0],
    },
    workLocation: {
      type: String,
      enum: jobType,
      default: jobType[0],
    },
    shift: {
      type: String,
      enum: ["Day", "Night"],
      default: "Day",
    },
    startDate: { type: Date },
    terminationDate: Date,

    /* Safety/compliance */
    emergencyContact: EmergencyContactSchema,
    documents: [DocumentSchema],
    isPreviouslyEmployed: { type: Boolean, default: false },
    releaseLetter: { type: String, default: "" },
    nocLetter: { type: String, default: "" },
    experienceCertificate: { type: String, default: "" },
    updatedCV: { type: String, default: "" },

    /* Tax & Work Authorization */
    filingStatus: {
      type: String,
      enum: fillingStatus,
      default: fillingStatus[0],
    },
    additionalWithholding: { type: Number, min: 0, default: 0 },
    i9: {
      docType: { type: String, default: "" },
      docNumber: { type: String, default: "" },
      docExpires: Date,
    },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },

    resetPasswordToken: { type: String, default: "" },
    resetPasswordExpires: { type: Date },
    isUpdated: { type: Boolean, default: false },

    familyMembers: [FamilyMemberSchema],

    prevWorkExperience: [PreviousWorkExperienceSchema],

    signature: { type: String, default: "" },

    isVerified: { type: Boolean, default: false },
    isNidVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isAddressVerified: { type: Boolean, default: false },
    isEmergencyContactVerified: { type: Boolean, default: false },
    isDocumentVerified: { type: Boolean, default: false },

    otpCode: { type: String, default: "" },
    otpExpiresAt: { type: Date },

    workAnniversaryEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    bankInfo: BankInfoSchema,
    mannualStorageSet: {
      type: Boolean,
      default: false,
    },
    storageLimit: {
      value: { type: Number, default: 500 }, // Storage value in MB or GB
      unit: {
        type: String,
        enum: ["MB", "GB"],
        default: "MB",
      },
    },
    assets: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Product",
      default: [],
    },
  },
  { timestamps: true }
);

employeeSchema.pre("save", function (next) {
  this.isVerified =
    this.isEmailVerified &&
    this.isPhoneVerified &&
    this.isAddressVerified &&
    this.isEmergencyContactVerified &&
    this.isDocumentVerified;
  next();
});

module.exports = mongoose.model("Employee", employeeSchema);
