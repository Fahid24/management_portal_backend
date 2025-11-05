const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['email', 'sms', 'in-app'],
    required: true
  },
  timing: {
    type: String,
    enum: ['5_minutes_before', '30_minutes_before', '1_hour_before', '1_day_before'],
    required: true
  },
  recipients: {
    type: String,
    required: true
  }
}, { _id: false });

const recurringPatternSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
  },
  interval: { type: Number },
  endDate: { type: Date },
}, { _id: false });

const metadataSchema = new mongoose.Schema({
  department: { type: String },
  recurringPattern: { type: recurringPatternSchema },
  notifications: { type: [notificationSchema], default: [] },
  attachments: { type: [String], default: [] }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: {
    type: String,
    enum: ['party', 'meeting', 'training', 'discussion', 'holiday', 'conference', 'workshop', 'birthday', 'webinar', 'other', 'make-up-day', 'on-call', 'weekend', 'work-aniversary'],
    required: true
  },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  startTime: { type: String },
  endTime: { type: String },
  allDay: { type: Boolean, default: false },
  location: { type: String },
  attendees: { type: [String], default: [] }, // list of emails
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'confirmed', 'cancelled', 'completed'],
    default: 'draft'
  },
  targetType: {
    type: String,
    enum: ['all', 'department', 'role', 'user'],
    required: true
  },
  targetValues: {
    type: [String], // this can be an array of userIds, department names, or role names
    default: []
  },
  isRecurring: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  createdByRole: {
    type: String,
    enum: ["Admin", "Manager", "DepartmentHead", "Employee"],
    required: true
  },
  metadata: { type: metadataSchema, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);