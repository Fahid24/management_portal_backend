const mongoose = require("mongoose");
const MaintenanceRequest = require("../model/MaintenanceRequestSchema");
const EquipmentRequest = require("../model/EquipmentRequestSchema");
const EducationalRequest = require("../model/EducationalRequest");
const LearningRequest = require("../model/LearningRequestSchema");
const employeeSchema = require("../model/employeeSchema");
const {
  requestNotificationEmail,
  applicationStatusChangeEmail,
} = require("../utils/emailTemplates");
const sendEmailUtil = require("../utils/emailService");
const Time = require("../utils/time");
const {
  educationalReqSendingEmails,
  equipmentAndMaintenanceSendingEmails,
} = require("../baseUrl");

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const submitMaintenanceRequest = async (req, res) => {
  const {
    employeeId,
    equipmentName,
    problemDescription,
    priority,
    damageDate,
    expectedDate,
    image = [],
  } = req.body;
  const user = await employeeSchema.findById(employeeId);
  if (
    !employeeId ||
    !equipmentName ||
    !problemDescription ||
    !priority ||
    !damageDate ||
    !expectedDate
  ) {
    return res
      .status(400)
      .json({ message: "All fields are required except image." });
  }

  const allowedPriorities = ["low", "medium", "urgent"];
  if (!allowedPriorities.includes(priority)) {
    return res
      .status(400)
      .json({ message: "Priority must be one of: low, medium, urgent." });
  }

  // Parse and validate dates using Luxon
  const parsedDamageDate = Time.fromISO(damageDate);
  const parsedExpectedDate = Time.fromISO(expectedDate);

  if (!Time.isValidDateTime(parsedDamageDate)) {
    return res.status(400).json({ message: "Invalid damageDate format." });
  }
  if (!Time.isValidDateTime(parsedExpectedDate)) {
    return res.status(400).json({ message: "Invalid expectedDate format." });
  }

  try {
    const request = new MaintenanceRequest({
      employeeId,
      equipmentName,
      problemDescription,
      priority,
      damageDate: Time.toJSDate(parsedDamageDate),
      expectedDate: Time.toJSDate(parsedExpectedDate),
      image: Array.isArray(image) ? image : [image],
    });

    await request.save();
    res.status(201).json({
      message: "Maintenance request submitted successfully.",
      data: request,
    });
    const emailHTML = requestNotificationEmail({
      applicationType: "Maintenance Request",
      expectedDate,
      employee: {
        fullName: user?.firstName + " " + user?.lastName,
        email: user?.email,
        role: user?.role,
      },
      commonFields: {
        equipmentName: equipmentName,
        priority: capitalizeFirstLetter(priority),
        expectedDate: expectedDate,
      },

      extraFields: {
        description: problemDescription,
        damageDate: damageDate,
      },
    });

    sendEmailUtil(
      equipmentAndMaintenanceSendingEmails,
      "Maintenance Request Notification",
      emailHTML
    );
  } catch (err) {
    console.error("Maintenance save error:", err);
    res.status(500).json({
      message: "Failed to save maintenance request.",
      error: err.message,
    });
  }
};

const submitEquipmentRequest = async (req, res) => {
  const {
    employeeId,
    equipmentName,
    purpose,
    quantity,
    priority,
    expectedDate,
    image = [],
  } = req.body;

  if (
    !employeeId ||
    !equipmentName ||
    !purpose ||
    !quantity ||
    !priority ||
    !expectedDate
  ) {
    return res.status(400).json({ message: "All fields are required." });
  }
  const user = await employeeSchema.findById(employeeId);

  if (isNaN(quantity) || quantity < 1) {
    return res
      .status(400)
      .json({ message: "Quantity must be a number greater than 0." });
  }

  const allowedPriorities = ["low", "medium", "urgent"];
  if (!allowedPriorities.includes(priority)) {
    return res
      .status(400)
      .json({ message: "Priority must be one of: low, medium, urgent." });
  }

  // Validate and parse expectedDate with Luxon
  const parsedExpectedDate = Time.fromISO(expectedDate);
  if (!Time.isValidDateTime(parsedExpectedDate)) {
    return res.status(400).json({ message: "Invalid expectedDate format." });
  }

  try {
    const request = new EquipmentRequest({
      employeeId,
      equipmentName,
      purpose,
      quantity,
      priority,
      expectedDate: Time.toJSDate(parsedExpectedDate), // store in DB as native JS Date
      image: Array.isArray(image) ? image : [image],
    });

    await request.save();
    res.status(201).json({
      message: "Equipment request submitted successfully.",
      data: request,
    });
    const emailHTML = requestNotificationEmail({
      applicationType: "Equipment Request",
      expectedDate,
      employee: {
        fullName: user?.firstName + " " + user?.lastName,
        email: user?.email,
        role: user?.role,
      },
      commonFields: {
        equipmentName: equipmentName,
        priority: capitalizeFirstLetter(priority),
        expectedDate: expectedDate,
      },
      extraFields: {
        quantity: quantity,
        purpose: purpose,
      },
    });
    sendEmailUtil(
      equipmentAndMaintenanceSendingEmails,
      "Equipment Request Notification",
      emailHTML
    );
  } catch (err) {
    res.status(500).json({
      message: "Failed to save equipment request.",
      error: err.message,
    });
  }
};

const submitLearningRequest = async (req, res) => {
  try {
    const {
      employeeId,
      topicTitle,
      educationType,
      topicDescription,
      preferredLearningFormat,
      justification,
      priority,
      expectedCompletionDate,
    } = req.body;

    if (!employeeId || !topicTitle || !topicDescription) {
      return res.status(400).json({
        message: "employeeId, topicTitle, and topicDescription are required.",
      });
    }
    const user = await employeeSchema.findById(employeeId);

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employeeId format." });
    }

    if (
      preferredLearningFormat &&
      !["video", "article", "course", "webinar", "any"].includes(
        preferredLearningFormat
      )
    ) {
      return res.status(400).json({
        message:
          "preferredLearningFormat must be one of: video, article, course, webinar, any.",
      });
    }

    if (
      educationType &&
      ![
        "Internal Training",
        "In-Person Conference",
        "Online Training",
      ].includes(educationType)
    ) {
      return res.status(400).json({
        message:
          "educationType must be one of: Internal Training, In-Person Conference, Online Training.",
      });
    }

    if (priority && !["low", "medium", "urgent"].includes(priority)) {
      return res
        .status(400)
        .json({ message: "Priority must be one of: low, medium, urgent." });
    }

    let parsedDate;
    if (expectedCompletionDate) {
      const dt = Time.fromISO(expectedCompletionDate);
      if (!Time.isValidDateTime(dt)) {
        return res
          .status(400)
          .json({ message: "Invalid expectedCompletionDate format." });
      }
      parsedDate = Time.toJSDate(dt);
    }

    const request = new LearningRequest({
      employeeId,
      topicTitle,
      educationType,
      topicDescription,
      preferredLearningFormat,
      justification,
      priority,
      expectedCompletionDate: parsedDate,
    });

    await request.save();
    res.status(201).json({
      message: "Learning request submitted successfully.",
      data: request,
    });

    const emailHTML = requestNotificationEmail({
      applicationType: "Education Request",
      employee: {
        fullName: user?.firstName + " " + user?.lastName,
        email: user?.email,
        role: user?.role,
      },
      commonFields: {
        title: topicTitle,
        priority: capitalizeFirstLetter(priority),
        expectedDate: expectedCompletionDate,
      },
      extraFields: {
        educationType: educationType,
        description: topicDescription,
        justification,
        learningFormat: preferredLearningFormat,
      },
    });
    sendEmailUtil(
      educationalReqSendingEmails,
      "Equipment Request Notification",
      emailHTML
    );
  } catch (err) {
    res.status(500).json({
      message: "Failed to save learning request.",
      error: err.message,
    });
  }
};

const updateEquipmentRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      equipmentName,
      purpose,
      quantity,
      priority,
      expectedDate,
      status,
      image,
      reviewerName,
      remarks,
    } = req.body;

    const existingRequest = await EquipmentRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Equipment request not found" });
    }

    // Allow updates only if current status is pending
    if (!status && existingRequest.status !== "pending") {
      return res
        .status(403)
        .json({ message: "Only requests with pending status can be updated." });
    }

    // Track previous status for change detection
    const previousStatus = existingRequest.status;

    // Update fields
    if (equipmentName !== undefined)
      existingRequest.equipmentName = equipmentName;
    if (purpose !== undefined) existingRequest.purpose = purpose;
    if (quantity !== undefined) {
      if (quantity < 1)
        return res.status(400).json({ message: "Quantity must be at least 1" });
      existingRequest.quantity = quantity;
    }
    if (priority !== undefined) {
      if (!["low", "medium", "urgent"].includes(priority)) {
        return res.status(400).json({ message: "Invalid priority value" });
      }
      existingRequest.priority = priority;
    }
    if (expectedDate !== undefined) {
      const dt = Time.fromISO(expectedDate);
      if (!Time.isValidDateTime(dt)) {
        return res.status(400).json({ message: "Invalid expectedDate format" });
      }
      existingRequest.expectedDate = Time.toJSDate(dt);
    }
    if (status !== undefined) {
      if (!["pending", "approved", "rejected", "in-review"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      existingRequest.status = status;
    }
    if (image !== undefined)
      existingRequest.image = Array.isArray(image) ? image : [image];

    await existingRequest.save();

    // Send email if status changed to approved/rejected
    if (
      status &&
      status !== previousStatus &&
      ["approved", "rejected"].includes(status)
    ) {
      const user = await employeeSchema.findById(existingRequest.employeeId);
      if (user && user.email) {
        const emailBody = applicationStatusChangeEmail({
          applicationType: "Equipment Request",
          status: status.charAt(0).toUpperCase() + status.slice(1),
          employee: {
            fullName: user.firstName + " " + user.lastName,
            email: user.email,
            role: user.role,
          },
          commonFields: {
            equipmentName: existingRequest.equipmentName,
            priority: capitalizeFirstLetter(existingRequest.priority),
            expectedDate: existingRequest.expectedDate
              ? Time.fromJSDate(existingRequest.expectedDate).toISODate()
              : "",
          },
          extraFields: {
            quantity: existingRequest.quantity,
            purpose: existingRequest.purpose,
          },
          reviewerName: reviewerName || "",
          remarks: remarks || "",
        });
        await sendEmailUtil(
          user.email,
          `Your Equipment Request has been ${
            status.charAt(0).toUpperCase() + status.slice(1)
          }`,
          emailBody
        );
      }
    }

    res.status(200).json({
      message: "Equipment request updated successfully",
      data: existingRequest,
    });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Server error while updating request" });
  }
};

const updateMaintenanceRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      equipmentName,
      problemDescription,
      image,
      priority,
      damageDate,
      expectedDate,
      status,
      assignedTo,
      reviewerName,
      remarks,
    } = req.body;

    const existingRequest = await MaintenanceRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Maintenance request not found" });
    }

    // Allow updates only if current status is pending
    if (!status && existingRequest.status !== "pending") {
      return res
        .status(403)
        .json({ message: "Only requests with pending status can be updated." });
    }

    // Track previous status for change detection
    const previousStatus = existingRequest.status;

    // Update fields
    if (equipmentName !== undefined)
      existingRequest.equipmentName = equipmentName;
    if (problemDescription !== undefined)
      existingRequest.problemDescription = problemDescription;
    if (image !== undefined)
      existingRequest.image = Array.isArray(image) ? image : [image];

    if (priority !== undefined) {
      if (!["low", "medium", "urgent"].includes(priority)) {
        return res.status(400).json({ message: "Invalid priority value" });
      }
      existingRequest.priority = priority;
    }

    // Luxon: Validate and convert damageDate
    if (damageDate !== undefined) {
      const parsed = Time.fromISO(damageDate);
      if (!Time.isValidDateTime(parsed)) {
        return res.status(400).json({ message: "Invalid damageDate format" });
      }
      existingRequest.damageDate = Time.toJSDate(parsed);
    }

    // Luxon: Validate and convert expectedDate
    if (expectedDate !== undefined) {
      const parsed = Time.fromISO(expectedDate);
      if (!Time.isValidDateTime(parsed)) {
        return res.status(400).json({ message: "Invalid expectedDate format" });
      }
      existingRequest.expectedDate = Time.toJSDate(parsed);
    }

    if (status !== undefined) {
      if (
        ![
          "pending",
          "in-progress",
          "completed",
          "cancelled",
          "approved",
          "rejected",
        ].includes(status)
      ) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      existingRequest.status = status;
    }

    if (assignedTo !== undefined) existingRequest.assignedTo = assignedTo;

    await existingRequest.save();

    // Send email if status changed to approved/rejected/completed/cancelled
    if (
      status &&
      status !== previousStatus &&
      ["approved", "rejected", "completed", "cancelled"].includes(status)
    ) {
      const user = await employeeSchema.findById(existingRequest.employeeId);
      if (user && user.email) {
        // Use the same template for all status changes
        const emailBody = applicationStatusChangeEmail({
          applicationType: "Maintenance Request",
          status: status.charAt(0).toUpperCase() + status.slice(1),
          employee: {
            fullName: user.firstName + " " + user.lastName,
            email: user.email,
            role: user.role,
          },
          commonFields: {
            equipmentName: existingRequest.equipmentName,
            priority: capitalizeFirstLetter(existingRequest.priority),
            expectedDate: existingRequest.expectedDate
              ? Time.fromJSDate(existingRequest.expectedDate).toISODate()
              : "",
          },
          extraFields: {
            description: existingRequest.problemDescription,
            damageDate: existingRequest.damageDate
              ? Time.fromJSDate(existingRequest.damageDate).toISODate()
              : "",
          },
          reviewerName: reviewerName || "",
          remarks: remarks || "",
        });
        await sendEmailUtil(
          user.email,
          `Your Maintenance Request has been ${
            status.charAt(0).toUpperCase() + status.slice(1)
          }`,
          emailBody
        );
      }
    }

    res.status(200).json({
      message: "Maintenance request updated successfully",
      data: existingRequest,
    });
  } catch (error) {
    console.error("Update Error:", error);
    res
      .status(500)
      .json({ message: "Server error while updating maintenance request" });
  }
};

const updateLearningRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      topicTitle,
      educationType,
      topicDescription,
      preferredLearningFormat,
      justification,
      priority,
      expectedCompletionDate,
      status,
      responseBy,
      responseRemarks,
      reviewerName,
      remarks,
    } = req.body;

    const existingRequest = await LearningRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Learning request not found" });
    }

    // Track previous status for change detection
    const previousStatus = existingRequest.status;

    if (
      status &&
      !["pending", "approved", "rejected", "in-progress"].includes(status)
    ) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    if (
      preferredLearningFormat &&
      !["video", "article", "course", "webinar", "any"].includes(
        preferredLearningFormat
      )
    ) {
      return res
        .status(400)
        .json({ message: "Invalid preferredLearningFormat value" });
    }

    if (priority && !["low", "medium", "urgent"].includes(priority)) {
      return res.status(400).json({ message: "Invalid priority value" });
    }

    // Apply updates safely
    if (topicTitle !== undefined) existingRequest.topicTitle = topicTitle;
    if (educationType !== undefined) {
      if (
        ![
          "Internal Training",
          "In-Person Conference",
          "Online Training",
        ].includes(educationType)
      ) {
        return res.status(400).json({
          message:
            "educationType must be one of: Internal Training, In-Person Conference, Online Training.",
        });
      }
      existingRequest.educationType = educationType;
    }
    if (topicDescription !== undefined)
      existingRequest.topicDescription = topicDescription;
    if (preferredLearningFormat !== undefined)
      existingRequest.preferredLearningFormat = preferredLearningFormat;
    if (justification !== undefined)
      existingRequest.justification = justification;
    if (priority !== undefined) existingRequest.priority = priority;

    if (expectedCompletionDate !== undefined) {
      const dt = Time.fromISO(expectedCompletionDate);
      if (!Time.isValidDateTime(dt)) {
        return res
          .status(400)
          .json({ message: "Invalid expectedCompletionDate format" });
      }
      existingRequest.expectedCompletionDate = Time.toJSDate(dt);
    }

    if (status !== undefined) existingRequest.status = status;

    if (responseBy !== undefined) {
      existingRequest.responseBy = responseBy;
      if (status) {
        const dt = Time.now();
        existingRequest.responseAt = Time.toJSDate(dt);
      }
    }

    if (responseRemarks !== undefined) {
      existingRequest.responseRemarks = responseRemarks;
    }

    await existingRequest.save();

    // Send email if status changed to approved/rejected
    if (
      status &&
      status !== previousStatus &&
      ["approved", "rejected"].includes(status)
    ) {
      const user = await employeeSchema.findById(existingRequest.employeeId);
      if (user && user.email) {
        const emailBody = applicationStatusChangeEmail({
          applicationType: "Education Request",
          status: status.charAt(0).toUpperCase() + status.slice(1),
          employee: {
            fullName: user.firstName + " " + user.lastName,
            email: user.email,
            role: user.role,
          },
          commonFields: {
            title: existingRequest.topicTitle,
            priority: capitalizeFirstLetter(existingRequest.priority),
            expectedDate: existingRequest.expectedCompletionDate
              ? Time.fromJSDate(
                  existingRequest.expectedCompletionDate
                ).toISODate()
              : "",
          },
          extraFields: {
            educationType: existingRequest.educationType,
            description: existingRequest.topicDescription,
            justification: existingRequest.justification,
            learningFormat: existingRequest.preferredLearningFormat,
          },
          reviewerName: reviewerName || "",
          remarks: remarks || "",
        });
        await sendEmailUtil(
          user.email,
          `Your Education Request has been ${
            status.charAt(0).toUpperCase() + status.slice(1)
          }`,
          emailBody
        );
      }
    }

    res.status(200).json({
      message: "Learning request updated successfully",
      data: existingRequest,
    });
  } catch (error) {
    console.error("Update Error:", error);
    res
      .status(500)
      .json({ message: "Server error while updating learning request" });
  }
};

const deleteEquipmentRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRequest = await EquipmentRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Equipment request not found" });
    }

    if (existingRequest.status !== "pending") {
      return res
        .status(403)
        .json({ message: "Only pending requests can be deleted" });
    }

    await EquipmentRequest.findByIdAndDelete(id);

    res.status(200).json({ message: "Equipment request deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res
      .status(500)
      .json({ message: "Server error while deleting equipment request" });
  }
};

const deleteMaintenanceRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRequest = await MaintenanceRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Maintenance request not found" });
    }

    if (existingRequest.status !== "pending") {
      return res
        .status(403)
        .json({ message: "Only pending requests can be deleted" });
    }

    await MaintenanceRequest.findByIdAndDelete(id);

    res
      .status(200)
      .json({ message: "Maintenance request deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res
      .status(500)
      .json({ message: "Server error while deleting maintenance request" });
  }
};

const deleteLearningRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const existingRequest = await LearningRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({ message: "Learning request not found" });
    }

    if (existingRequest.status !== "pending") {
      return res
        .status(403)
        .json({ message: "Only pending requests can be deleted" });
    }

    await LearningRequest.findByIdAndDelete(id);

    res.status(200).json({ message: "Learning request deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res
      .status(500)
      .json({ message: "Server error while deleting learning request" });
  }
};

const getEquipmentRequestsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const requests = await EquipmentRequest.find({ employeeId });

    res.status(200).json({
      message: "Equipment requests retrieved successfully",
      data: requests,
    });
  } catch (error) {
    console.error("Fetch Equipment Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching equipment requests" });
  }
};

const getMaintenanceRequestsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const requests = await MaintenanceRequest.find({ employeeId });

    res.status(200).json({
      message: "Maintenance requests retrieved successfully",
      data: requests,
    });
  } catch (error) {
    console.error("Fetch Maintenance Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching maintenance requests" });
  }
};

const getLearningRequestsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const requests = await LearningRequest.find({ employeeId });
    res.status(200).json({
      message: "Learning requests retrieved successfully",
      data: requests,
    });
  } catch (error) {
    console.error("Fetch Learning Error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching learning requests" });
  }
};

const getAllRequestsWithFilters = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      search,
      status,
      priority,
      page = 1,
      limit = 10,
      type = "all", // 'equipment', 'maintenance', 'educational', or 'all'
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const skip = (parsedPage - 1) * parsedLimit;

    const buildFilter = () => {
      const filter = {};

      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) {
          const dt = Time.fromISO(startDate);
          if (Time.isValidDateTime(dt))
            filter.createdAt.$gte = Time.toJSDate(dt);
        }
        if (endDate) {
          const dt = Time.fromISO(endDate);
          if (Time.isValidDateTime(dt))
            filter.createdAt.$lte = Time.toJSDate(dt);
        }
      }

      if (status) {
        const arr = status.split(",");
        filter.status = arr.length > 1 ? { $in: arr } : arr[0];
      }

      if (priority) {
        const arr = priority.split(",");
        filter.priority = arr.length > 1 ? { $in: arr } : arr[0];
      }

      return filter;
    };

    const baseFilter = buildFilter();

    const fetchData = async (Model, populateFields, matchFn) => {
      const total = await Model.countDocuments(baseFilter);

      let data = await Model.find(baseFilter)
        .populate("employeeId")
        .populate(populateFields)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean();

      if (search) {
        data = data.filter(matchFn);
      }

      return {
        data,
        total,
      };
    };

    const matchSearch = (item) => {
      if (!search) return true;
      const emp = item.employeeId || {};
      return (
        item.equipmentName?.toLowerCase().includes(search.toLowerCase()) ||
        item.courseName?.toLowerCase().includes(search.toLowerCase()) ||
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.email?.toLowerCase().includes(search.toLowerCase())
      );
    };

    const result = {
      equipmentRequests: [],
      maintenanceRequests: [],
      educationalRequests: [],
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalEquipment: 0,
        totalMaintenance: 0,
        totalEducational: 0,
        totalPagesEquipment: 0,
        totalPagesMaintenance: 0,
        totalPagesEducational: 0,
      },
    };

    if (type === "equipment" || type === "all") {
      const { data, total } = await fetchData(
        EquipmentRequest,
        "",
        matchSearch
      );
      result.equipmentRequests = data;
      result.pagination.totalEquipment = total;
      result.pagination.totalPagesEquipment = Math.ceil(total / parsedLimit);
    }

    if (type === "maintenance" || type === "all") {
      const { data, total } = await fetchData(
        MaintenanceRequest,
        "",
        matchSearch
      );
      result.maintenanceRequests = data;
      result.pagination.totalMaintenance = total;
      result.pagination.totalPagesMaintenance = Math.ceil(total / parsedLimit);
    }

    if (type === "educational" || type === "all") {
      const { data, total } = await fetchData(
        LearningRequest,
        "responseBy",
        matchSearch
      );
      result.educationalRequests = data;
      result.pagination.totalEducational = total;
      result.pagination.totalPagesEducational = Math.ceil(total / parsedLimit);
    }

    res.status(200).json({
      message: "Filtered requests retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Filter Error:", error);
    res.status(500).json({ message: "Server error while retrieving requests" });
  }
};

module.exports = {
  submitMaintenanceRequest,
  submitEquipmentRequest,
  updateEquipmentRequest,
  updateMaintenanceRequest,
  deleteEquipmentRequest,
  deleteMaintenanceRequest,
  getEquipmentRequestsByEmployee,
  getMaintenanceRequestsByEmployee,
  submitLearningRequest,
  updateLearningRequest,
  deleteLearningRequest,
  getLearningRequestsByEmployee,
  getAllRequestsWithFilters,
};
