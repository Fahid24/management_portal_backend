const mongoose = require('mongoose');

const workingDayControlSchema = new mongoose.Schema({
    monthKey: {
        type: String, // Format: YYYY-MM
        required: true,
        unique: true,
    },
    isCompleted: {
        type: Boolean,
        default: false,
    },
    completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    completedAt: {
        type: Date,
    },
});

module.exports = mongoose.model('WorkingDayControl', workingDayControlSchema);