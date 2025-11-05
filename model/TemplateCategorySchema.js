const mongoose = require('mongoose');

const templateCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
});

module.exports = mongoose.model('TemplateCategory', templateCategorySchema);