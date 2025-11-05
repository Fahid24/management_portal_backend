const mongoose = require("mongoose");
const RequisitionStatus = require("../constant/requisitionStatus");
const Time = require('../utils/time');

const RequisitionSchema = new mongoose.Schema(
  {
    requisitionID: { type: String, unique: true },
    requisitionTitle: { type: String, required: true },
    description: { type: String }, // Overall requisition description
    items: [
      {
        vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // Reference to Vendor
        type: { type: mongoose.Schema.Types.ObjectId, ref: "Type" }, // Reference to Type
        description: { type: String }, // Description of the item (e.g., "Office Chair")
        quantityRequested: { type: Number, required: true }, // Total Quantity requested
        estimatedCost: { type: Number }, // Total estimated cost for the item
        approvedVendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }, // Reference to Vendor
        quantityApproved: { type: Number, default: 0 }, // Quantity approved (tracked dynamically)
        approvedCost: { type: Number, default: 0 }, // Total approved cost (tracked dynamically)
        addedToInventory: { type: Number, default: 0 }, // Whether the item has been added to inventory
        documents: [{ type: String }], // Array of documents related to the item
      },
    ],
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    actionDate: { type: Date },
    comments: { type: String },
    documents: [{ type: String }], // Array of documents related to the requisition
    totalQuantityRequested: { type: Number, default: 0 }, // Total quantity requested across all items
    totalEstimatedCost: { type: Number, default: 0 }, // Total estimated cost across all items
    totalQuantityApproved: { type: Number, default: 0 }, // Total quantity approved across all items
    totalApprovedCost: { type: Number, default: 0 }, // Total cost approved across all items
    status: { type: String, enum: RequisitionStatus, default: RequisitionStatus[0] },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
  },
  { timestamps: true }
);

// Auto-generate requisition ID before saving (MMYY + continuous count per month)
RequisitionSchema.pre("save", async function (next) {
  if (this.isNew && !this.requisitionID) {
    // Get current month/year in Asia/Dhaka
    const now = Time.now(); // Luxon DateTime in Asia/Dhaka
    const month = now.toFormat("MM"); // 01–12
    const year = now.toFormat("yy");  // last 2 digits of year
    const prefix = `REQ${month}${year}`;

    // Find the last requisition for this month/year
    const lastDoc = await mongoose
      .model("Requisition")
      .findOne({ requisitionID: new RegExp(`^${prefix}`) })
      .sort({ createdAt: -1 })
      .select("requisitionID");

    let newNumber = 1;
    if (lastDoc && lastDoc.requisitionID) {
      const lastNumber = parseInt(lastDoc.requisitionID.replace(prefix, ""), 10);
      if (!isNaN(lastNumber)) {
        newNumber = lastNumber + 1;
      }
    }

    // Example: REQ0825000001
    this.requisitionID = `${prefix}${String(newNumber).padStart(6, "0")}`;
  }
  next();
});


module.exports = mongoose.model("Requisition", RequisitionSchema);
