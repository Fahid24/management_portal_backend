const mongoose = require('mongoose');

const MaintenanceRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    equipmentName: {
      type: String,
      required: true,
    },
    problemDescription: {
      type: String,
      required: true,
    },
    image: {
      type: [String],
      default: []
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'urgent'],
      default: 'low',
      required: true,
    },
    damageDate: {
      type: Date,
      required: true,
    },
    expectedDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'in-progress', 'completed', 'cancelled'], 
      default: 'pending',
      required: true,
    },
    assignedTo: {
      type: String,
      required: false,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MaintenanceRequest', MaintenanceRequestSchema);
