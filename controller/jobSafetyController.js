const JobSafety = require('../model/jobSafetySchema');
const Time = require('../utils/time');

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

/* ───────────────────── POST  /api/job-safety ───────────────────── */

async function createJobSafety(req, res) {
  try {
    const body = { ...req.body };

    if (body.dateOfProject) {
      const date = Time.fromISO(body.dateOfProject);
      if (!Time.isValidDateTime(date)) {
        return res.status(400).json({ error: "Invalid dateOfProject format" });
      }
      body.dateOfProject = Time.toJSDate(date);
    }

    const newJobSafety = new JobSafety(body);
    const savedJobSafety = await newJobSafety.save();
    res.status(201).json(savedJobSafety);
  } catch (err) {
    console.error('Error creating job safety record:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ───────────────────── GET  /api/job-safety ───────────────────── */
async function getAllJobSafety(req, res) {
  try {
    const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const { userId } = req.query;

    let filter = {};
    if (userId) {
      filter.employeeId = userId;
    }

    const [totalDocs, jobSafetyRecords] = await Promise.all([
      JobSafety.countDocuments(filter),
      JobSafety.find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('employeeId'),
    ]);

    res.status(200).json({
      data: jobSafetyRecords,
      pagination: buildPagination({ totalDocs, page, limit }),
    });
  } catch (err) {
    console.error('Error fetching all job safety records:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ───────────────────── GET  /api/job-safety/:id ───────────────── */
async function getOneJobSafety(req, res) {
  try {
    const jobSafety = await JobSafety.findById(req.params.id)
      .populate('employeeId'); // Populate employee details
    if (!jobSafety) return res.status(404).json({ error: 'Job safety record not found' });
    res.status(200).json(jobSafety);
  } catch (err) {
    console.error('Error fetching job safety record by ID:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ─────────────────── PATCH /api/job-safety/:id ────────────── */
async function updateJobSafety(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    const jobSafety = await JobSafety.findById(id);
    if (!jobSafety) return res.status(404).json({ error: 'Job safety record not found' });

    /* deep-merge everything (nested objects merge instead of replace) */
    deepMerge(jobSafety, updates);

    await jobSafety.save();

    res.status(200).json({
      message: 'Job safety record updated successfully',
      jobSafety,
    });
  } catch (err) {
    console.error('Error updating job safety record:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ─────────────────── DELETE /api/job-safety/:id ────────────── */
async function deleteJobSafety(req, res) {
  try {
    const { id } = req.params;

    const jobSafety = await JobSafety.findByIdAndDelete(id);

    if (!jobSafety) return res.status(404).json({ error: 'Job safety record not found' });

    res.status(200).json({ message: 'Job safety record deleted successfully' });
  } catch (err) {
    console.error('Error deleting job safety record:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

/* ─────────────────── GET /api/job-safety/employee/:employeeId ────────────── */
async function getJobSafetyByEmployee(req, res) {
  try {
    const { employeeId } = req.params;
    const page  = Math.max(parseInt(req.query.page,  10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const [totalDocs, jobSafetyRecords] = await Promise.all([
      JobSafety.countDocuments({ employeeId }),
      JobSafety.find({ employeeId })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('employeeId'),
    ]);

    res.status(200).json({
      data: jobSafetyRecords,
      pagination: buildPagination({ totalDocs, page, limit }),
    });
  } catch (err) {
    console.error('Error fetching job safety records for employee:', err);
    res.status(500).json({ detail: 'Internal Server Error', error: err.message });
  }
}

module.exports = {
  createJobSafety,
  getAllJobSafety,
  getOneJobSafety,
  updateJobSafety,
  deleteJobSafety,
  getJobSafetyByEmployee,
};
