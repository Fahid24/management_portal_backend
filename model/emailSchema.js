const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
    to: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    date: { type: Date, default: Date.now, required: true },
    status: {
        type: String,
        enum: ['sent', 'failed', 'pending', 'trash'],
        required: true
    },
    error: { type: String, default: '' },
    fileName: { type: String, default: '' }
});

module.exports = mongoose.model('Email', emailSchema);
