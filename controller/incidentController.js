const Incident = require('../model/incidentSchema');
const Employee = require('../model/employeeSchema');
const Department = require('../model/departmentSchema');
const { incidentReportEmail } = require('../utils/emailTemplates');
const sendEmailUtil = require('../utils/emailService');
const Time = require('../utils/time');
const { incidentSendingEmails } = require('../baseUrl');

/* ─────────────────────────── helpers ─────────────────────────── */
function buildPagination({ totalDocs, page, limit }) {
  return {
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
}

/* merge helper for nested objects */
function deepMerge(target = {}, patch = {}) {
  Object.entries(patch).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      target[k] = deepMerge({ ...(target[k] || {}) }, v);
    } else {
      target[k] = v;
    }
  });
  return target;
}

/* ───────────────────── POST  /api/incident ───────────────────── */
const createIncident = async (req, res) => {
  try {
    const {
      completedBy,
      completedDate,
      signature,
      incidentDateTime,
      personsInvolved,
      incidentDescription,
      witnesses,
      injuries,
      reportedTo,
      reportedDate,
      howReported,
      followUpActions,
    } = req.body;

    // Validate required date fields with Luxon
    const completedDT = Time.fromISO(completedDate);
    if (!Time.isValidDateTime(completedDT)) {
      return res.status(400).json({ error: 'Invalid completedDate format' });
    }

    const incidentDT = Time.fromISO(incidentDateTime);
    if (!Time.isValidDateTime(incidentDT)) {
      return res.status(400).json({ error: 'Invalid incidentDateTime format' });
    }

    let reportedJSDate = undefined;
    if (reportedDate) {
      const reportedDT = Time.fromISO(reportedDate);
      if (!Time.isValidDateTime(reportedDT)) {
        return res.status(400).json({ error: 'Invalid reportedDate format' });
      }
      reportedJSDate = Time.toJSDate(reportedDT);
    }

    const newIncident = new Incident({
      completedBy,
      completedDate: Time.toJSDate(completedDT),
      signature,
      incidentDateTime: Time.toJSDate(incidentDT),
      personsInvolved,
      incidentDescription,
      witnesses,
      injuries,
      reportedTo,
      reportedDate: reportedJSDate,
      howReported,
      followUpActions,
    });

    const savedIncident = await newIncident.save();

    // Re-fetch with populated references
    const populatedIncident = await Incident.findById(savedIncident._id)
      .populate("completedBy")
      .populate("personsInvolved")
      .populate("witnesses")
      .populate("reportedTo");

    // Format data for email
    const emailHTML = incidentReportEmail({
      employee: {
        fullName: `${populatedIncident.completedBy?.firstName || ""} ${populatedIncident.completedBy?.lastName || ""}`.trim() || "Unknown",
        email: populatedIncident.completedBy?.email || "N/A",
        role: populatedIncident.completedBy?.role || "N/A"
      },
      involvedPersons: populatedIncident.personsInvolved.map(p =>
        `${p.firstName || ""} ${p.lastName || ""}`.trim()
      ),
      witnesses: populatedIncident.witnesses.map(w =>
        `${w.firstName || ""} ${w.lastName || ""}`.trim()
      ),
      injuries: populatedIncident.injuries,
      reportedTo: `${populatedIncident.reportedTo?.firstName || ""} ${populatedIncident.reportedTo?.lastName || ""}`.trim() || "N/A",
      incidentDate: populatedIncident.incidentDateTime.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles"
      }),
      description: populatedIncident.incidentDescription,
      followUpActions: populatedIncident.followUpActions,
      signature: populatedIncident.signature
    });

    // Send the email
    await sendEmailUtil(
      incidentSendingEmails,
      "New Incident Report Submitted",
      emailHTML
    );

    res.status(201).json(populatedIncident);
  } catch (err) {
    console.error("Error creating incident:", err);
    res.status(500).json({ detail: "Internal Server Error", error: err.message });
  }
};

/* ───────────────────── GET  /api/incident ───────────────────── */
async function getAllIncident(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const { userId, from, to } = req.query;

    let filter = {};
    if (userId) {
      const user = await Employee.findById(userId);
      if (!user) {
        return res.status(200).json({
          data: [],
          pagination: buildPagination({ totalDocs: 0, page, limit }),
        });
      }

      if (user.role === 'Admin') {
        filter = {};
      } else {
        const departmentFilter = user.role === 'DepartmentHead'
          ? { departmentHeads: userId }
          : { projectManagers: userId };

        const deptIds = await Department.find({ ...departmentFilter, isDeleted: false }).select('_id');
        const departmentIds = deptIds.map(d => d._id);

        const employeesInDept = await Employee.find({
          department: { $in: departmentIds }
        }).select('_id');

        const empIds = employeesInDept.map(e => e._id);

        filter = {
          $or: [
            { completedBy: { $in: [...empIds, userId] } },
            { personsInvolved: { $in: [...empIds, userId] } },
            { witnesses: { $in: [...empIds, userId] } },
            { reportedTo: { $in: [...empIds, userId] } }
          ]
        };
      }
    }

    if (from !== 'null' && to !== 'null') {
      const fromDT = Time.fromISO(from).startOf('day');
      const toDT = Time.fromISO(to).endOf('day');

      if (!Time.isValidDateTime(fromDT) || !Time.isValidDateTime(toDT)) {
        return res.status(400).json({ error: 'Invalid from/to date format' });
      }

      filter.incidentDateTime = {
        $gte: Time.toJSDate(fromDT),
        $lte: Time.toJSDate(toDT),
      };
    }

    const [totalDocs, incidents] = await Promise.all([
      Incident.countDocuments(filter),
      Incident.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ _id: -1 })
        .populate('completedBy reportedTo personsInvolved witnesses'),
    ]);

    res.status(200).json({
      data: incidents,
      pagination: buildPagination({ totalDocs, page, limit }),
    });
  } catch (err) {
    console.error('Error fetching all incidents:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ───────────────────── GET  /api/incident/:id ───────────────── */
async function getOneIncident(req, res) {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('completedBy reportedTo'); // Populate employee details
    if (!incident) return res.status(404).json({ error: 'Incident not found' });
    res.status(200).json(incident);
  } catch (err) {
    console.error('Error fetching incident by ID:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ─────────────────── PATCH /api/incident/:id ────────────── */
async function updateIncident(req, res) {
  try {
    const { id } = req.params; // Incident ID in the URL
    const updates = req.body;   // Whatever the client sent

    const incident = await Incident.findById(id);
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    /* deep-merge everything (nested objects merge instead of replace) */
    deepMerge(incident, updates);

    await incident.save();

    res.status(200).json({
      message: 'Incident updated successfully',
      incident,
    });
  } catch (err) {
    console.error('Error updating incident:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ─────────────────── DELETE /api/incident/:id ────────────── */
async function deleteIncident(req, res) {
  try {
    const { id } = req.params; // Incident ID in the URL

    const incident = await Incident.findByIdAndDelete(id);

    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    res.status(200).json({ message: 'Incident deleted successfully' });
  } catch (err) {
    console.error('Error deleting incident:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}


module.exports = {
  createIncident,
  getAllIncident,
  getOneIncident,
  updateIncident,
  deleteIncident,
};
