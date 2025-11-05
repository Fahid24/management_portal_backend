const mongoose = require('mongoose');
// const { Target } = require('puppeteer');

const emailSchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String },
    body: { type: String, required: true },
    placeholders: [{ type: String, trim: true }],
    des: { type: String },
    type: { type: String, enum: ['built-in', 'custom'], default: 'custom' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateCategory' }, // Reference

});

module.exports = mongoose.model('EmailTemplate', emailSchema);