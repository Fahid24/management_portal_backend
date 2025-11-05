const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 
  departmentId: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  type: { type: String, required: true }, 
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed }, 
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
