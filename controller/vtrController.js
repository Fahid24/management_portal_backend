const VTR = require('../model/vtrSchema');
const Employee = require('../model/employeeSchema');
const sendEmailUtil = require('../utils/emailService');
const { verifiableTimeRecordEmail } = require('../utils/emailTemplates');


function buildPaginationMeta({ totalDocs, page, limit }) {
  return {
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  };
}

// Create VTR
exports.createVTR = async (req, res) => {
  try {
    const vtr = new VTR(req.body);
    await vtr.save();

    // Fetch creator info
    const creator = await Employee.findById(vtr.createdBy);
    if (!creator) throw new Error("Creator not found");

    // Fetch crew member names
    const crewMemberDocs = await Employee.find({ _id: { $in: vtr.crewMembers } });
    const crewNames = crewMemberDocs.map((cm) => `${cm.firstName} ${cm.lastName}`);

    // Convert timeSlots object to timeStamp array
    const timeStamp = Object.entries(vtr.timeSlots || {}).map(([time, value]) => ({
      time,
      value,
    }));

    // Prepare email content
    const htmlContent = verifiableTimeRecordEmail({
      fullName: vtr.completedBy,
      roll: creator.role || "N/A",
      email: creator.email || "N/A",
      submittedTime: new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
      dateOfProject: vtr.dateOfProject,
      workOrder: vtr.workOrder,
      customerName: vtr.customerName,
      salesRep: vtr.salesRep,
      crew: vtr.crewTeam,
      crewMembers: crewNames,
      timeStamp,
      completeProject: vtr.timeToComplete,
      estimatedTimeOnSite: vtr.estimatedTime,
      actualTimeOnSite: vtr.actualTime,
      feedback: vtr.feedback,
    });

    // Send email
    await sendEmailUtil(
      process.env.MAIL_USER,
      "New Verifiable Time Record Submitted",
      htmlContent,
    );

    res.status(201).json({ success: true, data: vtr });
  } catch (err) {
    console.error("VTR creation error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// Get all VTRs with pagination
exports.getVTRs = async (req, res) => {
  try {
    let { page = 1, limit = 10, userId, search } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    let filter = {};
    let isAdmin = false;
    // console.log("User ID from query:", userId);
    if (userId) {
      const user = await Employee.findById(userId);
      // console.log("user", user);
      if (user && user.role === 'Admin') {
        isAdmin = true;
      }
    }


    if (!isAdmin && userId) {
      filter = { createdBy: userId };
    }

    if (search) {
      const regex = new RegExp(search, 'i'); // Case-insensitive search
      filter = {
        ...filter,
        $or: [
          { workOrder: regex },
          { customerName: regex },
          { salesRep: regex },
          { crewTeam: regex },
          { feedback: regex },
          { completedBy: regex },
        ],
      };
    }

    const total = await VTR.countDocuments(filter);
    const vtrs = await VTR.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('crewMembers', 'firstName lastName')
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: "VTRs fetched successfully.",
      data: vtrs,
      pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Get single VTR by ID
exports.getSingleVTR = async (req, res) => {
  try {
    const vtr = await VTR.findById(req.params.id);
    if (!vtr) {
      return res.status(404).json({ success: false, message: 'VTR not found' });
    }
    res.status(200).json({ success: true, data: vtr });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Delete VTR by ID
exports.deleteVTR = async (req, res) => {
  try {
    const vtr = await VTR.findByIdAndDelete(req.params.id);
    if (!vtr) {
      return res.status(404).json({ success: false, message: 'VTR not found' });
    }
    res.status(200).json({ success: true, message: 'VTR deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Update VTR by ID
exports.updateVTR = async (req, res) => {
  try {
    const vtr = await VTR.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!vtr) {
      return res.status(404).json({ success: false, message: 'VTR not found' });
    }
    res.status(200).json({ success: true, message: 'VTR updated successfully', data: vtr });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};