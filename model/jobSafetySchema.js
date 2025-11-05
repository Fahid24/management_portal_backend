const mongoose = require('mongoose');

const jobSafetySchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
    },
  team: [{
    type: String,
    required: true,
    trim: true
  }],
  personsInvolved: [{
    type: String,
    required: true,
    trim: true
  }],
  customerNameWorkOrder: {
    type: String,
    required: [true, 'Customer name/work order is required'],
    trim: true
  },
  dateOfProject: {
    type: Date,
    required: [true, 'Date of project is required']
  },
  ppeRequired: [{
    type: String,
    required: true,
    trim: true
  }],
  conesSignsChocks: [{
    type: String,
    required: true,
    trim: true
  }],
  equipmentRequired: [{
    type: String,
    required: true,
    trim: true
  }],
  toolsRequired: [{
    type: String,
    required: true,
    trim: true
  }],
  chemicalsRequired: [{
    type: String,
    required: true,
    trim: true
  }],
  workActivities: [{
    type: String,
    required: true,
    trim: true
  }],
  potentialHazards: [{
    type: String,
    required: true,
    trim: true
  }],
  safetyMeasuresDiscussed: [{
    type: String,
    required: true,
    trim: true
  }],
  statesOfMind: [{
    type: String,
    required: true,
    trim: true
  }],
  errorsThatLeadToInjury: [{
    type: String,
    required: true,
    trim: true
  }],
  maintenanceChecksRequired: {
    type: Boolean,
    required: [true, 'Maintenance checks status is required'],
    default: false
  },
  sprinklersIrrigation: {
    type: String,
    required: [true, 'Sprinklers/irrigation information is required'],
    trim: true
  },
  pathLights: {
    type: String,
    required: [true, 'Path lights information is required'],
    trim: true
  },
  landscapedPlants: {
    type: String,
    required: [true, 'Landscaped plants information is required'],
    trim: true
  },
  otherObstacles: {
    type: String,
    required: [true, 'Other obstacles information is required'],
    trim: true
  },
  groundProtectionMats: {
    type: String,
    required: [true, 'Ground protection mats information is required'],
    trim: true
  },
  certificatesPermitsApprovals: {
    type: String,
    required: [true, 'Certificates/permits/approvals information is required'],
    trim: true
  },
  mindsetAttitude: {
    type: String,
    required: [true, 'Mindset/attitude information is required'],
    trim: true
  },
  designatedAerialRescuePersonnel: [{
    type: String,
    required: true,
    trim: true
  }],
  whosCalling911: [{
    type: String,
    required: true,
    trim: true
  }],
  nearestHospital: {
    type: String,
    required: [true, 'Nearest hospital information is required'],
    trim: true
  },
  nearestUrgentCare: {
    type: String,
    required: [true, 'Nearest urgent care information is required'],
    trim: true
  },
  approvedBy: [{
    type: String,
    required: true,
    trim: true
  }],
  // Additional fields for "Other" options
  teamOther: {
    type: String,
    trim: true
  },
  personsInvolvedOther: {
    type: String,
    trim: true
  },
  approvedByOther: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields automatically
});

// Add index for better query performance
jobSafetySchema.index({ dateOfProject: -1 });
jobSafetySchema.index({ customerNameWorkOrder: 1 });

const JobSafety = mongoose.model('JobSafety', jobSafetySchema);

module.exports = JobSafety;
