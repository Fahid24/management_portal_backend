const mongoose = require('mongoose');

const moralSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: false },
  morale: {
    type: String,
    required: [true, 'Morale feedback is required'],
    trim: true
  },
  support: {
    type: String,
    required: [true, 'Support feedback is required'],
    trim: true
  },
  expectations: {
    type: String,
    required: [true, 'Expectations feedback is required'],
    trim: true
  },
  skillsUsage: {
    type: String,
    required: [true, 'Skills usage feedback is required'],
    trim: true
  },
  recognition: {
    type: String,
    required: [true, 'Recognition feedback is required'],
    trim: true
  },
  safety: {
    type: String,
    required: [true, 'Safety feedback is required'],
    trim: true
  },
  improvementSuggestions: {
    type: String,
    required: [true, 'Improvement suggestions are required'],
    trim: true
  },
  followUp: {
    type: String,
    required: [true, 'Follow-up information is required'],
    trim: true
  },
  followUpName: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
});

const Moral = mongoose.model('Moral', moralSchema);

module.exports = Moral;
