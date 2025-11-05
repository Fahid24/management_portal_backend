const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema(
  {
    type: { type: mongoose.Schema.Types.ObjectId, ref: "Type" },
    quantity: { type: Number, default: 0 },
    usedQuantity: { type: Number, default: 0 },
    unUseableQuantity: { type: Number, default: 0 },
    underMaintenanceQuantity: { type: Number, default: 0 },
    history: [
      {
        action: { type: String, enum: ["IN", "USED", "RETURN", "DISBURST", "DELETED"] },
        quantity: { type: Number, default: 0 },
        timestamp: { type: Date },
        requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: "Requisition" },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" }
      }
    ],
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inventory', InventorySchema);
