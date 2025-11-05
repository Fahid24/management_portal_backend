const mongoose = require('mongoose');

const dailyTaskSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    title: {
        type: String,
        required: true,
    },
    details: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ["To Do", "In Progress", "Completed", "In Review"],
        default: "To Do"
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project'
    },
    assignedDate: {
        type: Date,
        default: Date.now
    },
    startDate: {
        type: Date,
        default: null // Will be set when status changes to "In Progress"
    },
    dueDate: {
        type: Date,
        required: true
    },
    completion: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    completionTime: {
        value: {
            type: Number,
            min: 0,
            default: 0 // in hours
        },
        unit: {
            type: String,
            enum: ["minutes", "hours", "days", "weeks"],
            default: "hours"
        }
    },
    completedDate: {
        type: Date
    },
    completedDetails: {
        type: String
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    attachments: [{
        type: String,
        default: ''
    }],
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    }
}, {
    timestamps: true
});

const DailyTask = mongoose.model('DailyTask', dailyTaskSchema);

module.exports = DailyTask;
