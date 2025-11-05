const Moral = require("../model/moraleSchema");
const sendEmailUtil = require("../utils/emailService");
const { generateSurveyEmailTemplate } = require("../utils/emailTemplates");


exports.createMoral = async (req, res) => {
  try {
    const moral = new Moral(req.body);
    const savedMoral = await moral.save();

    let populatedMoral;
    // Populate employee data
    if (savedMoral.employeeId) {
      populatedMoral = await savedMoral.populate('employeeId', 'firstName lastName email role photoUrl');
    }


    const emailHTML = generateSurveyEmailTemplate(savedMoral);
    sendEmailUtil(
      process.env.MAIL_USER,
      'Survey Notification',
      emailHTML,
    )

    res.status(201).json({
      success: true,
      message: 'Moral survey created and email sent successfully',
      data: savedMoral
    });

  } catch (error) {
    console.error('Error creating moral or sending email:', error);
    res.status(400).json({
      success: false,
      message: 'Error creating moral survey or sending email',
      error: error.message
    });
  }
};

// Get all moral survey entries
exports.getAllMorals = async (req, res) => {
  try {
    const morals = await Moral.find().sort({ createdAt: -1 }).populate({
        path: 'employeeId',
        select: 'firstName lastName', // 👈 Only bring the name field
      });;
    
    res.status(200).json({
      success: true,
      count: morals.length,
      data: morals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching moral surveys",
      error: error.message,
    });
  }
};

// Get moral surveys by employee ID
exports.getMoralsByEmployeeId = async (req, res) => {
  try {
    const morals = await Moral.find({ employeeId: req.params.employeeId }).sort(
      { createdAt: -1 }
    );

    if (!morals.length) {
      return res.status(404).json({
        success: false,
        message: "No moral surveys found for this employee",
      });
    }

    res.status(200).json({
      success: true,
      count: morals.length,
      data: morals,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching moral surveys for employee",
      error: error.message,
    });
  }
};

// Get a single moral survey entry by ID
exports.getMoralById = async (req, res) => {
  try {
    const moral = await Moral.findById(req.params.id);
    if (!moral) {
      return res.status(404).json({
        success: false,
        message: "Moral survey not found",
      });
    }
    res.status(200).json({
      success: true,
      data: moral,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching moral survey",
      error: error.message,
    });
  }
};

// Update a moral survey entry
exports.updateMoral = async (req, res) => {
  try {
    const moral = await Moral.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!moral) {
      return res.status(404).json({
        success: false,
        message: "Moral survey not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Moral survey updated successfully",
      data: moral,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Error updating moral survey",
      error: error.message,
    });
  }
};

// Delete a moral survey entry
exports.deleteMoral = async (req, res) => {
  try {
    const moral = await Moral.findByIdAndDelete(req.params.id);
    if (!moral) {
      return res.status(404).json({
        success: false,
        message: "Moral survey not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Moral survey deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting moral survey",
      error: error.message,
    });
  }
};
