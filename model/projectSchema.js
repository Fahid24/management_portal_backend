const mongoose = require("mongoose");
const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ["NotStarted", "InProgress", "Completed", "Reviewed", "OnHold", "Cancelled"], default: "NotStarted" },
    startDate: { type: Date },
    dueDate: { type: Date },
    endDate: { type: Date },

    departments: [{
        department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
        departmentHead: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        departmentHeads: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],
        kpiCriteria: [{
            _id: false,
            kpi: { type: mongoose.Schema.Types.ObjectId, ref: "Kpi" },
            value: { type: Number, min: 0, max: 100 }
        }],
    }],

    managers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Employee" }],

    employees: [{
        _id: false,
        employee: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        assignedAt: { type: Date, default: Date.now }
    }],

    remarks: [{
        _id: false,
        remarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
        remark: { type: String, required: true },
        date: { type: Date, default: Date.now }
    }],
    isProjectBasedKpi: { type: Boolean, default: false }, // If true, project has its own KPIs
    projectKpi: {
        type: [{
            department: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Department',
                required: true
            },
            kpiCriteria: [{
                _id: false,
                kpi: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Kpi',
                    required: true
                },
                value: {
                    type: Number,
                    min: 0,
                    max: 100,
                    required: true
                }
            }]
        }],
        default: []
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date }
}, { timestamps: true });

projectSchema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'project'
});
projectSchema.set('toObject', { virtuals: true });
projectSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("Project", projectSchema);
