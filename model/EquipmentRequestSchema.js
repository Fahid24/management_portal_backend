const mongoose = require('mongoose');

const EquipmentRequestSchema = new mongoose.Schema(
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
        purpose: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'urgent'],
            default: 'medium',
            required: true,
        },
        expectedDate: {
            type: Date,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'in-review'],
            default: 'pending',
        },
        image: {
            type: [String],
            default: []
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('EquipmentRequest', EquipmentRequestSchema);
