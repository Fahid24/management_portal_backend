const mongoose = require("mongoose");
const LeaveRequest = require("../model/leaveSchema");
const Employee = require("../model/employeeSchema");
const { sendNotificationToUsers } = require("../utils/sendNotificationToUsers");
const sendEmailUtil = require("../utils/emailService");
const {
  timeOffReq,
  timeofReqToUserTemplate,
} = require("../utils/emailTemplateTimeOffReq");
const Time = require("../utils/time");
const { production } = require("../baseUrl");
const Event = require("../model/eventSchema");
const Department = require("../model/departmentSchema");
const { companyName, companyEmail } = require("../constant/companyInfo");

/* Utility function to calculate leave duration excluding holidays and weekends */
async function calculateLeaveDuration(startDate, endDate) {
  try {
    const startDT = Time.fromJSDate(startDate);
    const endDT = Time.fromJSDate(endDate);

    // Get holidays and weekends from Event collection
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] },
        },
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } },
        },
      },
      {
        $match: {
          startDateParsed: { $lte: Time.toJSDate(endDT) },
          endDateParsed: { $gte: Time.toJSDate(startDT) },
        },
      },
    ]);

    // Create sets for holiday and weekend dates
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(
        event.startDateParsed < Time.toJSDate(startDT)
          ? Time.toJSDate(startDT)
          : event.startDateParsed
      );
      const eventEnd = Time.fromJSDate(
        event.endDateParsed > Time.toJSDate(endDT)
          ? Time.toJSDate(endDT)
          : event.endDateParsed
      );

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Calculate working days excluding holidays and weekends
    let workingDays = 0;
    let current = startDT;

    while (current <= endDT) {
      const dateStr = current.toISODate();
      // Only count if it's not a holiday or weekend
      if (!holidayDates.has(dateStr) && !weekendDates.has(dateStr)) {
        workingDays++;
      }
      current = current.plus({ days: 1 });
    }

    return {
      totalDays: Math.floor(endDT.diff(startDT, "days").days) + 1,
      workingDays: workingDays,
      holidaysWeekends:
        Math.floor(endDT.diff(startDT, "days").days) + 1 - workingDays,
    };
  } catch (error) {
    console.error("Error calculating leave duration:", error);
    return {
      totalDays: 0,
      workingDays: 0,
      holidaysWeekends: 0,
    };
  }
}

/* Utility function to validate if leave period contains only holidays/weekends */
async function validateLeavePeriod(startDate, endDate) {
  const duration = await calculateLeaveDuration(startDate, endDate);

  if (duration.workingDays === 0) {
    return {
      isValid: false,
      message:
        "Cannot request leave for a period that contains only holidays and weekends",
    };
  }

  return {
    isValid: true,
    message: "Leave period is valid",
  };
}

/* Dummy notification function (replace with real implementation) */

/* Employee requests leave */
async function requestLeave(req, res) {
  try {
    const {
      employeeId,
      startDate: startISO,
      endDate: endISO,
      leaveType,
      reason,
      departmentId,
    } = req.body;

    // Validate ISO date strings and convert to Luxon DateTimes
    const startDT = Time.fromISO(startISO).startOf("day");
    const endDT = Time.fromISO(endISO).endOf("day");

    if (!Time.isValidDateTime(startDT) || !Time.isValidDateTime(endDT)) {
      return res.status(400).json({ error: "Invalid start or end date" });
    }

    if (Time.isAfter(startDT, endDT)) {
      return res
        .status(400)
        .json({ error: "Start date cannot be after end date" });
    }

    // Validate leave period - check if it contains only holidays/weekends
    const validation = await validateLeavePeriod(
      Time.toJSDate(startDT),
      Time.toJSDate(endDT)
    );
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.message });
    }

    // Calculate leave duration
    const leaveDuration = await calculateLeaveDuration(
      Time.toJSDate(startDT),
      Time.toJSDate(endDT)
    );

    // Check employee and department
    const employee = await Employee.findById(employeeId).populate({
      path: "department",
      populate: { path: "departmentHeads" },
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const deptHead = employee?.department?.departmentHeads?.map(
      (head) => head._id
    );

    // Create leave request using JS Dates converted from Luxon
    const leaveRequest = new LeaveRequest({
      employeeId,
      departmentId,
      startDate: Time.toJSDate(startDT),
      endDate: Time.toJSDate(endDT),
      leaveType,
      reason,
      status: "pending_dept_head",
      deptHeadIds: deptHead || [],
      deptHeadAction: null,
      deptHeadComment: null,
      deptHeadActionAt: null,
      adminId: null,
      adminAction: null,
      adminComment: null,
      adminActionAt: null,
      paidLeave: leaveDuration.workingDays,
      unpaidLeave: 0,
    });

    await leaveRequest.save();

    // Add duration to response
    const responseData = {
      message: "Leave request submitted",
      leaveRequest: {
        ...leaveRequest.toObject(),
        duration: leaveDuration,
      },
    };

    // Notify department head if exists
    if (deptHead) {
      await sendNotificationToUsers({
        userIds: deptHead,
        type: "leave",
        title: "New Leave Request",
        message: `New leave request from employee ${employee.firstName} ${employee.lastName}`,
      });
    }

    res.status(201).json(responseData);

    // Get all admin users
    const adminUsers = await Employee.find({ role: "Admin" }).select("email");
    const adminEmails = adminUsers.map((user) => user.email);

    // Get department head emails
    const deptHeadUsers = await Employee.find({
      _id: { $in: deptHead || [] },
    }).select("email");

    const deptHeadEmails = deptHeadUsers.map((user) => user.email);

    // Combine all recipient emails (remove duplicates)
    const allRecipients = [...new Set([...adminEmails, ...deptHeadEmails])];

    // Prepare email content
    const emailBody = timeOffReq
      .replaceAll("$employeeName", `${employee.firstName} ${employee.lastName}`)
      .replaceAll("$departmentName", employee.department?.name || "N/A")
      .replaceAll("$leaveType", leaveType)
      .replaceAll("$startDate", new Date(Time.toJSDate(startDT)).toDateString())
      .replaceAll("$endDate", new Date(Time.toJSDate(endDT)).toDateString())
      .replaceAll("$reason", reason || "No reason provided");

    // Send email to all recipients
    if (allRecipients.length > 0) {
      await sendEmailUtil(
        allRecipients.join(","), // Send to all recipients
        `Leave Request from ${employee.firstName} ${employee.lastName}`,
        emailBody
      );
    }

    // Optional: Keep the original email for backup/notification
    // await sendEmailUtil(
    //   production ? "jewel@octopi-digital.com" : "abdul.rafi@octopi-digital.com",
    //   `Leave Request from ${employee.firstName} ${employee.lastName}`,
    //   emailBody
    // );
  } catch (error) {
    console.error("❌ Leave request error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* Department head approves/rejects */
// async function deptHeadAction(req, res) {
//   try {
//     const { id } = req.params;
//     const { action, comment, startDate: startISO, endDate: endISO } = req.body;

//     const leaveRequest = await LeaveRequest.findById(id).populate({
//       path: "employeeId",
//       select: "firstName lastName email department",
//       populate: { path: "department", select: "name" },
//     });

//     // if (!leaveRequest || leaveRequest.status !== "pending_dept_head") {
//     //   return res.status(400).json({ error: "Invalid leave request or status" });
//     // }

//     // ✅ Handle editable dates only if action is approved
//     if (action === "approved") {
//       let updatedStartDate = leaveRequest.startDate;
//       let updatedEndDate = leaveRequest.endDate;

//       if (startISO) {
//         const startDT = Time.fromISO(startISO).startOf("day");
//         if (!Time.isValidDateTime(startDT)) {
//           return res.status(400).json({ error: "Invalid start date" });
//         }
//         updatedStartDate = Time.toJSDate(startDT);
//       }

//       if (endISO) {
//         const endDT = Time.fromISO(endISO).endOf("day");
//         if (!Time.isValidDateTime(endDT)) {
//           return res.status(400).json({ error: "Invalid end date" });
//         }
//         updatedEndDate = Time.toJSDate(endDT);
//       }

//       if (startISO && endISO) {
//         const startDT = Time.fromISO(startISO).startOf("day");
//         const endDT = Time.fromISO(endISO).endOf("day");
//         if (Time.isAfter(startDT, endDT)) {
//           return res
//             .status(400)
//             .json({ error: "Start date cannot be after end date" });
//         }
//       }

//       // Validate updated leave period
//       const validation = await validateLeavePeriod(updatedStartDate, updatedEndDate);
//       if (!validation.isValid) {
//         return res.status(400).json({ error: validation.message });
//       }

//       // Update dates if they were modified
//       leaveRequest.startDate = updatedStartDate;
//       leaveRequest.endDate = updatedEndDate;
//     }

//     // ✅ Apply action and comment
//     leaveRequest.deptHeadAction = action;
//     leaveRequest.deptHeadComment = comment;
//     leaveRequest.deptHeadActionAt = Time.toJSDate(Time.now());

//     // ✅ Handle action-specific logic
//     if (action === "approved") {
//       leaveRequest.status = "pending_admin";

//       // Notify Admin
//       const admin = await Employee.findOne({ role: /admin/i });
//       if (admin) {
//         await sendNotificationToUsers({
//           userIds: [admin._id],
//           type: "leave",
//           title: "Leave Request Pending Approval",
//           message: `Leave request ${id} approved by department head, pending your approval.`,
//         });
//       }

//       // Notify Employee
//       await sendNotificationToUsers({
//         userIds: [leaveRequest.employeeId._id],
//         type: "leave",
//         title: "Leave Approved by Department Head",
//         message: `Your leave request was approved by department head and sent to admin.`,
//       });
//     } else if (action === "rejected") {
//       leaveRequest.status = "rejected";

//       await sendNotificationToUsers({
//         userIds: [leaveRequest.employeeId._id],
//         type: "leave",
//         title: "Leave Rejected by Department Head",
//         message: `Your leave request was rejected by department head.`,
//       });
//     }

//     await leaveRequest.save();

//     // Calculate and include duration in response
//     const leaveDuration = await calculateLeaveDuration(leaveRequest.startDate, leaveRequest.endDate);

//     res.status(200).json({
//       message: `Leave ${action} by department head`,
//       leaveRequest: {
//         ...leaveRequest.toObject(),
//         duration: leaveDuration
//       },
//     });
//   } catch (error) {
//     console.error("❌ deptHeadAction Error:", error);
//     res.status(500).json({ error: error.message });
//   }
// }

/* Department head approves/rejects */
async function deptHeadAction(req, res) {
  try {
    const { id } = req.params;
    const {
      action,
      comment,
      startDate: startISO,
      endDate: endISO,
      paidLeave,
    } = req.body;

    const leaveRequest = await LeaveRequest.findById(id).populate({
      path: "employeeId",
      select: "firstName lastName email department",
      populate: { path: "department", select: "name" },
    });

    // ✅ Handle editable dates only if action is approved
    if (action === "approved") {
      let updatedStartDate = leaveRequest.startDate;
      let updatedEndDate = leaveRequest.endDate;

      if (startISO) {
        const startDT = Time.fromISO(startISO).startOf("day");
        if (!Time.isValidDateTime(startDT)) {
          return res.status(400).json({ error: "Invalid start date" });
        }
        updatedStartDate = Time.toJSDate(startDT);
      }

      if (endISO) {
        const endDT = Time.fromISO(endISO).endOf("day");
        if (!Time.isValidDateTime(endDT)) {
          return res.status(400).json({ error: "Invalid end date" });
        }
        updatedEndDate = Time.toJSDate(endDT);
      }

      if (startISO && endISO) {
        const startDT = Time.fromISO(startISO).startOf("day");
        const endDT = Time.fromISO(endISO).endOf("day");
        if (Time.isAfter(startDT, endDT)) {
          return res
            .status(400)
            .json({ error: "Start date cannot be after end date" });
        }
      }

      // Validate updated leave period
      const validation = await validateLeavePeriod(
        updatedStartDate,
        updatedEndDate
      );
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }

      // Update dates if they were modified
      leaveRequest.startDate = updatedStartDate;
      leaveRequest.endDate = updatedEndDate;
    }

    // ✅ Apply action and comment
    leaveRequest.deptHeadAction = action;
    leaveRequest.deptHeadComment = comment;
    leaveRequest.deptHeadActionAt = Time.toJSDate(Time.now());

    // ✅ Handle paid/unpaid leave calculation for approved requests
    if (action === "approved") {
      // Calculate total leave duration
      const leaveDuration = await calculateLeaveDuration(
        leaveRequest.startDate,
        leaveRequest.endDate
      );
      const totalWorkingDays = leaveDuration.workingDays;

      // Set paid leave days (can be 0) and calculate unpaid leave
      const paidLeaveDays = paidLeave || 0;
      const unpaidLeaveDays = Math.max(0, totalWorkingDays - paidLeaveDays);

      // Validate that paid leave doesn't exceed total working days
      if (paidLeaveDays > totalWorkingDays) {
        return res.status(400).json({
          error: `Paid leave days (${paidLeaveDays}) cannot exceed total working days (${totalWorkingDays})`,
        });
      }

      // Update leave request with paid/unpaid breakdown
      leaveRequest.paidLeave = paidLeaveDays;
      leaveRequest.unpaidLeave = unpaidLeaveDays;
    }

    // ✅ Handle action-specific logic
    if (action === "approved") {
      leaveRequest.status = "pending_admin";

      // Notify Admin via notification
      const admin = await Employee.findOne({ role: /Admin/i });
      if (admin) {
        await sendNotificationToUsers({
          userIds: [admin._id],
          type: "leave",
          title: "Leave Request Pending Approval",
          message: `Leave request ${id} approved by department head, pending your approval.`,
        });
      }

      // NEW: Send email to all admins when department head approves
      const adminUsers = await Employee.find({ role: "Admin" }).select("email");
      const adminEmails = adminUsers.map((user) => user.email);

      if (adminEmails.length > 0) {
        const employeeName = `${leaveRequest.employeeId.firstName} ${leaveRequest.employeeId.lastName}`;
        const departmentName =
          leaveRequest.employeeId.department?.name || "N/A";

        const emailSubject = `Leave Request Approved by Department Head - ${employeeName}`;

        const emailBody = `
          <h2>Leave Request Approved by Department Head</h2>
          <p><strong>Employee:</strong> ${employeeName}</p>
          <p><strong>Department:</strong> ${departmentName}</p>
          <p><strong>Leave Type:</strong> ${leaveRequest.leaveType}</p>
          <p><strong>Period:</strong> ${new Date(
            leaveRequest.startDate
          ).toDateString()} to ${new Date(
          leaveRequest.endDate
        ).toDateString()}</p>
          <p><strong>Department Head Comment:</strong> ${
            comment || "No comment provided"
          }</p>
          <p><strong>Action Taken At:</strong> ${new Date(
            leaveRequest.deptHeadActionAt
          ).toLocaleString()}</p>
          <br>
          <p>Please log in to the system to review and take final action.</p>
        `;

        // Send email to all admin users
        await sendEmailUtil(adminEmails.join(","), emailSubject, emailBody);
      }

      // Notify Employee
      await sendNotificationToUsers({
        userIds: [leaveRequest.employeeId._id],
        type: "leave",
        title: "Leave Approved by Department Head",
        message: `Your leave request was approved by department head and sent to admin.`,
      });
    } else if (action === "rejected") {
      leaveRequest.status = "rejected";

      // Notify Employee via notification
      await sendNotificationToUsers({
        userIds: [leaveRequest.employeeId._id],
        type: "leave",
        title: "Leave Rejected by Department Head",
        message: `Your leave request was rejected by department head.`,
      });

      // NEW: Send detailed rejection email to employee (like in your example)
      try {
        const user = leaveRequest.employeeId;
        if (user.email) {
          let subject, body;

          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            companyName,
            startDate: Time.fromJSDate(leaveRequest.startDate).toFormat(
              "dd LLL yyyy"
            ),
            endDate: Time.fromJSDate(leaveRequest.endDate).toFormat(
              "dd LLL yyyy"
            ),
            statusText: "Rejected by Department Head",
            status: "Rejected",
            statusClass: "rejected",
            adminComment: comment || "No additional comments",
            contactEmail: companyEmail,
          };

          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          subject = "❌ Your Leave Request Has Been Rejected";
          // Assuming you have a template for this purpose
          body = applyReplacements(timeofReqToUserTemplate, baseMap);

          await sendEmailUtil(user.email, subject, body);
        }
      } catch (mailErr) {
        console.error("Failed to send rejection email to employee:", mailErr);
      }
    }

    await leaveRequest.save();

    // Calculate and include duration in response
    const leaveDuration = await calculateLeaveDuration(
      leaveRequest.startDate,
      leaveRequest.endDate
    );

    res.status(200).json({
      message: `Leave ${action} by department head`,
      leaveRequest: {
        ...leaveRequest.toObject(),
        duration: leaveDuration,
        paidLeave: leaveRequest.paidLeave,
        unpaidLeave: leaveRequest.unpaidLeave,
      },
    });
  } catch (error) {
    console.error("❌ deptHeadAction Error:", error);
    res.status(500).json({ error: error.message });
  }
}

async function adminAction(req, res) {
  try {
    const { id } = req.params;
    const {
      adminId,
      action,
      comment,
      startDate: startISO,
      endDate: endISO,
      paidLeave,
    } = req.body;

    const leaveRequest = await LeaveRequest.findById(id).populate({
      path: "employeeId",
      select: "firstName lastName email department",
      populate: { path: "department", select: "name" },
    });

    if (!leaveRequest) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    // ✅ Only modify dates if approving
    if (action === "approved") {
      let updatedStartDate = leaveRequest.startDate;
      let updatedEndDate = leaveRequest.endDate;

      if (startISO) {
        const startDT = Time.fromISO(startISO).startOf("day");
        if (!Time.isValidDateTime(startDT)) {
          return res.status(400).json({ error: "Invalid start date" });
        }
        updatedStartDate = Time.toJSDate(startDT);
      }

      if (endISO) {
        const endDT = Time.fromISO(endISO).endOf("day");
        if (!Time.isValidDateTime(endDT)) {
          return res.status(400).json({ error: "Invalid end date" });
        }
        updatedEndDate = Time.toJSDate(endDT);
      }

      if (startISO && endISO) {
        const startDT = Time.fromISO(startISO).startOf("day");
        const endDT = Time.fromISO(endISO).endOf("day");
        if (Time.isAfter(startDT, endDT)) {
          return res
            .status(400)
            .json({ error: "Start date cannot be after end date" });
        }
      }

      // Validate updated leave period
      const validation = await validateLeavePeriod(
        updatedStartDate,
        updatedEndDate
      );
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }

      // Update dates if they were modified
      leaveRequest.startDate = updatedStartDate;
      leaveRequest.endDate = updatedEndDate;

      // ✅ Handle paid/unpaid leave calculation for approved requests
      const leaveDuration = await calculateLeaveDuration(
        leaveRequest.startDate,
        leaveRequest.endDate
      );
      const totalWorkingDays = leaveDuration.workingDays;

      // Set paid leave days (can be 0 or use existing value) and calculate unpaid leave
      const paidLeaveDays =
        paidLeave !== undefined ? paidLeave : leaveRequest.paidLeave || 0;
      const unpaidLeaveDays = Math.max(0, totalWorkingDays - paidLeaveDays);

      // Validate that paid leave doesn't exceed total working days
      if (paidLeaveDays > totalWorkingDays) {
        return res.status(400).json({
          error: `Paid leave days (${paidLeaveDays}) cannot exceed total working days (${totalWorkingDays})`,
        });
      }

      // Update leave request with paid/unpaid breakdown
      leaveRequest.paidLeave = paidLeaveDays;
      leaveRequest.unpaidLeave = unpaidLeaveDays;
    }

    // ✅ Record admin action metadata
    leaveRequest.adminId = adminId;
    leaveRequest.adminAction = action;
    leaveRequest.adminComment = comment;
    leaveRequest.adminActionAt = Time.toJSDate(Time.now());

    // ✅ Action handling + Notifications + Emails
    let user = await Employee.findById(
      leaveRequest.employeeId._id,
      "email firstName lastName"
    );
    if (action === "approved") {
      leaveRequest.status = "approved";

      await sendNotificationToUsers({
        userIds: [leaveRequest.employeeId._id],
        type: "leave",
        title: "Leave Approved by Admin",
        message: `Your leave request was approved by admin.`,
      });

      try {
        if (user.email) {
          let subject, body;

          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            companyName: companyName,
            startDate: Time.fromJSDate(leaveRequest.startDate).toFormat(
              "dd LLL yyyy"
            ),
            endDate: Time.fromJSDate(leaveRequest.endDate).toFormat(
              "dd LLL yyyy"
            ),
            statusText: "Approved By Admin",
            status: "Approved",
            statusClass: "approved",
            adminComment: leaveRequest.adminComment || "No additional comments",
            contactEmail: companyEmail,
          };

          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          subject = "✅ Your Leave Request Has Been Approved";
          body = applyReplacements(timeofReqToUserTemplate, baseMap);

          sendEmailUtil(user.email, subject, body);
        }
      } catch (mailErr) {
        console.error("Failed to send time off request email:", mailErr);
      }
    } else if (action === "rejected") {
      leaveRequest.status = "rejected";

      await sendNotificationToUsers({
        userIds: [leaveRequest.employeeId._id],
        type: "leave",
        title: "Leave Rejected by Admin",
        message: `Your leave request was rejected by admin.`,
      });

      try {
        if (user.email) {
          let subject, body;

          const baseMap = {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            companyName,
            startDate: Time.fromJSDate(leaveRequest.startDate).toFormat(
              "dd LLL yyyy"
            ),
            endDate: Time.fromJSDate(leaveRequest.endDate).toFormat(
              "dd LLL yyyy"
            ),
            statusText: "Rejected by Admin",
            status: "Rejected",
            statusClass: "rejected",
            adminComment: leaveRequest.adminComment || "No additional comments",
            contactEmail: companyEmail,
          };

          const applyReplacements = (tmpl, map) =>
            Object.entries(map).reduce(
              (acc, [k, v]) => acc.replaceAll(`$${k}`, v ?? ""),
              tmpl
            );

          subject = "❌ Your Leave Request Has Been Rejected";
          body = applyReplacements(timeofReqToUserTemplate, baseMap);

          sendEmailUtil(user.email, subject, body);
        }
      } catch (mailErr) {
        console.error("Failed to send time off request email:", mailErr);
      }
    }

    await leaveRequest.save();

    // Calculate and include duration in response
    const leaveDuration = await calculateLeaveDuration(
      leaveRequest.startDate,
      leaveRequest.endDate
    );

    res.status(200).json({
      message: `Leave ${action} by admin`,
      leaveRequest: {
        ...leaveRequest.toObject(),
        duration: leaveDuration,
        paidLeave: leaveRequest.paidLeave,
        unpaidLeave: leaveRequest.unpaidLeave,
      },
    });
  } catch (error) {
    console.error("❌ adminAction Error:", error);
    res.status(500).json({ error: error.message });
  }
}

/* Get leave requests with optional filters */
async function getLeaves(req, res) {
  try {
    const { employeeIds, departmentIds, status, leaveType, year } = req.query;

    // Parse pagination params with defaults
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const filter = {};

    // Handle multiple employeeIds
    if (employeeIds) {
      let empIds = Array.isArray(employeeIds)
        ? employeeIds
        : employeeIds.split(",");
      empIds = empIds
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (empIds.length === 0)
        return res.status(400).json({ error: "Invalid employeeIds" });
      filter.employeeId = {
        $in: empIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    // Handle multiple departmentIds
    if (departmentIds) {
      let deptIds = Array.isArray(departmentIds)
        ? departmentIds
        : departmentIds.split(",");
      deptIds = deptIds
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (deptIds.length === 0)
        return res.status(400).json({ error: "Invalid departmentIds" });
      filter.departmentId = {
        $in: deptIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    if (status) {
      filter.status = status;
    }

    if (leaveType) {
      filter.leaveType = leaveType;
    }

    // Add year filter - default to current year if not provided
    const targetYear = year ? parseInt(year, 10) : Time.now().year;
    const startOfYear = Time.fromObject({
      year: targetYear,
      month: 1,
      day: 1,
    }).startOf("day");
    const endOfYear = Time.fromObject({
      year: targetYear,
      month: 12,
      day: 31,
    }).endOf("day");

    filter.$expr = {
      $and: [
        {
          $lte: [
            {
              $dateTrunc: { date: "$startDate", unit: "day", timezone: "UTC" },
            },
            Time.toJSDate(endOfYear),
          ],
        },
        {
          $gte: [
            { $dateTrunc: { date: "$endDate", unit: "day", timezone: "UTC" } },
            Time.toJSDate(startOfYear),
          ],
        },
      ],
    };

    const [totalDocs, leaves] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate(
          "employeeId",
          "firstName lastName email role designation photoUrl"
        )
        .populate(
          "adminId",
          "firstName lastName email role designation photoUrl"
        )
        .populate(
          "deptHeadIds",
          "firstName lastName email role designation photoUrl"
        )
        .populate({
          path: "departmentId",
          select: "name",
        })
        .sort({ startDate: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    // Calculate duration for each leave
    const leavesWithDuration = await Promise.all(
      leaves.map(async (leave) => {
        const duration = await calculateLeaveDuration(
          leave.startDate,
          leave.endDate
        );
        return {
          ...leave.toObject(),
          duration: duration,
        };
      })
    );

    // Optional: build pagination object
    const pagination = {
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalDocs / limit),
    };

    res.status(200).json({
      data: leavesWithDuration,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ error: error.message });
  }
}

async function getLeaveStats(req, res) {
  try {
    const { startDate, endDate, departmentIds, departmentHeadId } = req.query;

    // ✅ Parse input dates using Luxon - show all-time stats if no dates provided
    const filterStart = startDate
      ? Time.fromISO(startDate).startOf("day")
      : null;
    const filterEnd = endDate ? Time.fromISO(endDate).endOf("day") : null;

    if (
      (filterStart && !filterStart.isValid) ||
      (filterEnd && !filterEnd.isValid)
    ) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    if (filterStart && filterEnd && Time.isAfter(filterStart, filterEnd)) {
      return res
        .status(400)
        .json({ error: "Start date cannot be after end date" });
    }

    // ✅ Employee filtering by department or department head
    let employeeFilter = {};

    if (departmentHeadId) {
      // If department head ID is provided, find departments under this head
      if (!mongoose.Types.ObjectId.isValid(departmentHeadId)) {
        return res.status(400).json({ error: "Invalid departmentHeadId" });
      }

      const departments = await Department.find(
        { departmentHeads: departmentHeadId },
        { _id: 1 }
      );
      const deptIdArray = departments.map((d) => d._id);

      if (deptIdArray.length === 0) {
        return res.status(200).json({
          leaveStats: {
            total: { requests: 0, days: 0 },
            pending: { requests: 0, days: 0 },
            approved: { requests: 0, days: 0 },
            rejected: { requests: 0, days: 0 },
            casualLeave: {
              total: { requests: 0, days: 0 },
              pending: { requests: 0, days: 0 },
              approved: { requests: 0, days: 0 },
              rejected: { requests: 0, days: 0 },
            },
            medicalLeave: {
              total: { requests: 0, days: 0 },
              pending: { requests: 0, days: 0 },
              approved: { requests: 0, days: 0 },
              rejected: { requests: 0, days: 0 },
            },
            annualLeave: {
              total: { requests: 0, days: 0 },
              pending: { requests: 0, days: 0 },
              approved: { requests: 0, days: 0 },
              rejected: { requests: 0, days: 0 },
            },
          },
        });
      }

      employeeFilter.department = { $in: deptIdArray };
    } else if (departmentIds) {
      // Original department filtering logic
      const deptIdArray = departmentIds
        .split(",")
        .map((id) => new mongoose.Types.ObjectId(id.trim()));
      employeeFilter.department = { $in: deptIdArray };
    }

    const employees = await Employee.find(employeeFilter, { _id: 1 });
    const employeeIds = employees.map((e) => e._id);

    if ((departmentIds || departmentHeadId) && employeeIds.length === 0) {
      return res.status(200).json({
        leaveStats: {
          total: { requests: 0, days: 0 },
          pending: { requests: 0, days: 0 },
          approved: { requests: 0, days: 0 },
          rejected: { requests: 0, days: 0 },
          casualLeave: {
            total: { requests: 0, days: 0 },
            pending: { requests: 0, days: 0 },
            approved: { requests: 0, days: 0 },
            rejected: { requests: 0, days: 0 },
          },
          medicalLeave: {
            total: { requests: 0, days: 0 },
            pending: { requests: 0, days: 0 },
            approved: { requests: 0, days: 0 },
            rejected: { requests: 0, days: 0 },
          },
          annualLeave: {
            total: { requests: 0, days: 0 },
            pending: { requests: 0, days: 0 },
            approved: { requests: 0, days: 0 },
            rejected: { requests: 0, days: 0 },
          },
        },
      });
    }

    // ✅ Build leaveMatch filter
    const leaveMatch = {};
    if (employeeIds.length > 0) {
      leaveMatch.employeeId = { $in: employeeIds };
    }

    // ✅ Only add date filtering if dates are provided
    if (filterStart || filterEnd) {
      const startJS = filterStart ? filterStart.toJSDate() : null;
      const endJS = filterEnd ? filterEnd.toJSDate() : null;

      if (startJS && endJS) {
        leaveMatch.$expr = {
          $and: [
            {
              $lte: [
                {
                  $dateTrunc: {
                    date: "$startDate",
                    unit: "day",
                    timezone: "UTC",
                  },
                },
                endJS,
              ],
            },
            {
              $gte: [
                {
                  $dateTrunc: {
                    date: "$endDate",
                    unit: "day",
                    timezone: "UTC",
                  },
                },
                startJS,
              ],
            },
          ],
        };
      } else if (startJS) {
        leaveMatch.$expr = {
          $gte: [
            {
              $dateTrunc: {
                date: "$endDate",
                unit: "day",
                timezone: "UTC",
              },
            },
            startJS,
          ],
        };
      } else if (endJS) {
        leaveMatch.$expr = {
          $lte: [
            {
              $dateTrunc: {
                date: "$startDate",
                unit: "day",
                timezone: "UTC",
              },
            },
            endJS,
          ],
        };
      }
    }

    // ✅ Fetch holidays and weekends from Event collection
    let events = [];
    if (filterStart || filterEnd) {
      // If date range is specified, filter events within that range
      const startJS = filterStart
        ? filterStart.toJSDate()
        : new Date("1900-01-01");
      const endJS = filterEnd ? filterEnd.toJSDate() : new Date("2100-12-31");

      events = await Event.aggregate([
        {
          $match: {
            type: { $in: ["holiday", "weekend"] },
          },
        },
        {
          $addFields: {
            startDateParsed: { $dateFromString: { dateString: "$startDate" } },
            endDateParsed: { $dateFromString: { dateString: "$endDate" } },
          },
        },
        {
          $match: {
            startDateParsed: { $lte: endJS },
            endDateParsed: { $gte: startJS },
          },
        },
      ]);
    } else {
      // If no date range, get all holidays and weekends
      events = await Event.aggregate([
        {
          $match: {
            type: { $in: ["holiday", "weekend"] },
          },
        },
        {
          $addFields: {
            startDateParsed: { $dateFromString: { dateString: "$startDate" } },
            endDateParsed: { $dateFromString: { dateString: "$endDate" } },
          },
        },
      ]);
    }

    // ✅ Create sets for holiday and weekend dates
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed);

      // If date range is specified, clamp the event dates to the filter range
      if (filterStart && current < filterStart) current = filterStart;
      if (filterEnd && eventEnd > filterEnd) eventEnd = filterEnd;

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // ✅ Get all matching leaves
    const leavesData = await LeaveRequest.find(leaveMatch);

    // ✅ Initialize leave statistics with both requests count and days
    const leaveStats = {
      total: { requests: 0, days: 0 },
      pending: { requests: 0, days: 0 },
      approved: { requests: 0, days: 0 },
      rejected: { requests: 0, days: 0 },
      casualLeave: {
        total: { requests: 0, days: 0 },
        pending: { requests: 0, days: 0 },
        approved: { requests: 0, days: 0 },
        rejected: { requests: 0, days: 0 },
      },
      medicalLeave: {
        total: { requests: 0, days: 0 },
        pending: { requests: 0, days: 0 },
        approved: { requests: 0, days: 0 },
        rejected: { requests: 0, days: 0 },
      },
      annualLeave: {
        total: { requests: 0, days: 0 },
        pending: { requests: 0, days: 0 },
        approved: { requests: 0, days: 0 },
        rejected: { requests: 0, days: 0 },
      },
    };

    // ✅ Calculate leave days and count requests for each leave request
    leavesData.forEach((leave) => {
      const leaveStart = Time.fromJSDate(leave.startDate);
      const leaveEnd = Time.fromJSDate(leave.endDate);

      let clampedStart = leaveStart;
      let clampedEnd = leaveEnd;

      // Only clamp to filter range if dates are provided
      if (filterStart || filterEnd) {
        clampedStart = leaveStart < filterStart ? filterStart : leaveStart;
        clampedEnd = leaveEnd > filterEnd ? filterEnd : leaveEnd;

        // Skip if leave does not intersect filter range
        if (clampedEnd < filterStart || clampedStart > filterEnd) return;
      }

      // Calculate leave days excluding weekends and holidays
      let dayCount = 0;
      let current = clampedStart;

      while (current <= clampedEnd) {
        const dateStr = current.toISODate();
        // Only count if it's not a holiday or weekend
        if (!holidayDates.has(dateStr) && !weekendDates.has(dateStr)) {
          dayCount++;
        }
        current = current.plus({ days: 1 });
      }

      // Always count the request, even if dayCount is 0
      // Determine leave type key
      const typeKey = {
        Casual: "casualLeave",
        Medical: "medicalLeave",
        Annual: "annualLeave",
      }[leave.leaveType];

      // Determine status key
      let statusKey;
      if (leave.status === "approved") {
        statusKey = "approved";
      } else if (
        ["pending_dept_head", "pending_admin"].includes(leave.status)
      ) {
        statusKey = "pending";
      } else if (leave.status === "rejected") {
        statusKey = "rejected";
      } else {
        return; // Skip unknown statuses
      }

      // Add to total counts
      leaveStats.total.requests += 1;
      leaveStats.total.days += dayCount;
      leaveStats[statusKey].requests += 1;
      leaveStats[statusKey].days += dayCount;

      // Add to specific leave type if valid
      if (typeKey) {
        leaveStats[typeKey].total.requests += 1;
        leaveStats[typeKey].total.days += dayCount;
        leaveStats[typeKey][statusKey].requests += 1;
        leaveStats[typeKey][statusKey].days += dayCount;
      }
    });

    res.status(200).json({ leaveStats });
  } catch (error) {
    console.error("Error fetching leave stats:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get leave requests by userID with pagination
async function getLeavesByUserId(req, res) {
  try {
    const { userId } = req.params;
    const { status, leaveType, year } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid userId" });
    }
    // Parse pagination params with defaults
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { employeeId: userId };

    // Add status filter
    if (status) {
      filter.status = status;
    }

    // Add leave type filter
    if (leaveType) {
      filter.leaveType = leaveType;
    }

    // Add year filter - default to current year if not provided
    const targetYear = year ? parseInt(year, 10) : Time.now().year;
    const startOfYear = Time.fromObject({
      year: targetYear,
      month: 1,
      day: 1,
    }).startOf("day");
    const endOfYear = Time.fromObject({
      year: targetYear,
      month: 12,
      day: 31,
    }).endOf("day");

    filter.$expr = {
      $and: [
        {
          $lte: [
            {
              $dateTrunc: { date: "$startDate", unit: "day", timezone: "UTC" },
            },
            Time.toJSDate(endOfYear),
          ],
        },
        {
          $gte: [
            { $dateTrunc: { date: "$endDate", unit: "day", timezone: "UTC" } },
            Time.toJSDate(startOfYear),
          ],
        },
      ],
    };

    const [totalDocs, leaves] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate({
          path: "employeeId",
          select:
            "firstName lastName email role department designation photoUrl",
          populate: { path: "department", select: "name" },
        })
        .populate({ path: "departmentId", select: "name" })
        .populate(
          "adminId",
          "firstName lastName email role designation photoUrl"
        )
        .populate(
          "deptHeadIds",
          "firstName lastName email role designation photoUrl"
        )
        .sort({ createdAt: -1 }) // Sort by startDate and then createdAt
        .skip(skip)
        .limit(limit),
    ]);

    // Calculate duration for each leave
    const leavesWithDuration = await Promise.all(
      leaves.map(async (leave) => {
        const duration = await calculateLeaveDuration(
          leave.startDate,
          leave.endDate
        );
        return {
          ...leave.toObject(),
          duration: duration,
        };
      })
    );

    const leaveStats = {
      totalLeave: 0,
      casualLeave: {
        approved: 0,
        pending: 0,
        rejected: 0,
        total: 0,
      },
      medicalLeave: {
        approved: 0,
        pending: 0,
        rejected: 0,
        total: 0,
      },
      annualLeave: {
        approved: 0,
        pending: 0,
        rejected: 0,
        total: 0,
      },
    };

    // Fetch holidays and weekends from Event collection using the same targetYear variables
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] },
        },
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } },
        },
      },
      {
        $match: {
          startDateParsed: { $lte: Time.toJSDate(endOfYear) },
          endDateParsed: { $gte: Time.toJSDate(startOfYear) },
        },
      },
    ]);

    // Create sets for holiday and weekend dates
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(
        event.startDateParsed < Time.toJSDate(startOfYear)
          ? Time.toJSDate(startOfYear)
          : event.startDateParsed
      );
      const eventEnd = Time.fromJSDate(
        event.endDateParsed > Time.toJSDate(endOfYear)
          ? Time.toJSDate(endOfYear)
          : event.endDateParsed
      );

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Fetch ALL leaves for statistics with same filters as main query
    const statsFilter = { employeeId: userId };

    // Apply same filters as main query for consistency
    if (status) {
      statsFilter.status = status;
    }

    if (leaveType) {
      statsFilter.leaveType = leaveType;
    }

    const leavesData = await LeaveRequest.find(statsFilter);

    leavesData.forEach((leave) => {
      const leaveStart = Time.fromJSDate(leave.startDate);
      const leaveEnd = Time.fromJSDate(leave.endDate);

      // Clamp leave period within current year
      const clampedStart = leaveStart < startOfYear ? startOfYear : leaveStart;
      const clampedEnd = leaveEnd > endOfYear ? endOfYear : leaveEnd;

      // Skip if leave does not intersect current year
      if (clampedEnd < startOfYear || clampedStart > endOfYear) return;

      // Calculate leave days excluding weekends and holidays
      let dayCount = 0;
      let current = clampedStart;

      while (current <= clampedEnd) {
        const dateStr = current.toISODate();
        // Only count if it's not a holiday or weekend
        if (!holidayDates.has(dateStr) && !weekendDates.has(dateStr)) {
          dayCount++;
        }
        current = current.plus({ days: 1 });
      }

      // Add to global leave count
      leaveStats.totalLeave += dayCount;

      const typeKey = {
        Casual: "casualLeave",
        Medical: "medicalLeave",
        Annual: "annualLeave",
      }[leave.leaveType];

      if (!typeKey) return; // Skip if type is not valid

      leaveStats[typeKey].total += dayCount;

      if (leave.status === "approved") {
        leaveStats[typeKey].approved += dayCount;
      } else if (
        ["pending_dept_head", "pending_admin"].includes(leave.status)
      ) {
        leaveStats[typeKey].pending += dayCount;
      } else if (leave.status === "rejected") {
        leaveStats[typeKey].rejected += dayCount;
      }
    });

    const pagination = {
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalDocs / limit),
    };

    res.status(200).json({ data: leavesWithDuration, leaveStats, pagination });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get leave statistics for admin/department head with role-based access control
async function getLeaveStatsForAdmin(req, res) {
  try {
    const { employeeId, year, userId, departmentId, role } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Get the logged in user to check their role
    const loginUser = await Employee.findById(userId).populate("department");
    if (!loginUser) {
      return res.status(404).json({ error: "Login user not found" });
    }

    // Parse pagination params with defaults
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // Build filter object based on user role
    const filter = {};
    let allowedEmployeeIds = [];

    // Role-based access control
    if (loginUser.role === "Admin") {
      // Admin can see all employees
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
        filter.employeeId = employeeId;
      }

      // Admin can filter by department
      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        const employeesInDept = await Employee.find(
          { department: departmentId },
          { _id: 1 }
        );
        const deptEmployeeIds = employeesInDept.map((e) => e._id);

        if (employeeId) {
          // If both employeeId and departmentId are provided, check if employee is in that department
          if (!deptEmployeeIds.some((id) => id.toString() === employeeId)) {
            return res.status(400).json({
              error: "Employee not found in the specified department",
            });
          }
        } else {
          // Filter to only employees in the specified department
          filter.employeeId = { $in: deptEmployeeIds };
        }
      }

      // Admin can filter by role
      if (role) {
        let roleFilteredEmployees;
        if (filter.employeeId) {
          // If already filtered by department or specific employee, apply role filter to that subset
          const currentEmployeeIds = Array.isArray(filter.employeeId.$in)
            ? filter.employeeId.$in
            : [filter.employeeId];
          roleFilteredEmployees = await Employee.find(
            {
              _id: { $in: currentEmployeeIds },
              role: new RegExp(role, "i"),
            },
            { _id: 1 }
          );
        } else {
          // Filter all employees by role
          roleFilteredEmployees = await Employee.find(
            { role: new RegExp(role, "i") },
            { _id: 1 }
          );
        }

        const roleEmployeeIds = roleFilteredEmployees.map((e) => e._id);

        if (roleEmployeeIds.length === 0) {
          return res.status(200).json({
            leaveStats: [],
            year: year ? parseInt(year, 10) : Time.now().year,
            pagination: {
              totalDocs: 0,
              page,
              limit,
              totalPages: 0,
              hasPrevPage: false,
              hasNextPage: false,
            },
          });
        }

        filter.employeeId = { $in: roleEmployeeIds };
      }
    } else if (loginUser.role === "DepartmentHead") {
      // Department head can only see employees in their department(s)
      const departments = await Department.find(
        { departmentHeads: userId },
        { _id: 1 }
      );
      const departmentIds = departments.map((d) => d._id);

      if (departmentIds.length === 0) {
        return res.status(200).json({
          leaveStats: [],
          year: year ? parseInt(year, 10) : Time.now().year,
          pagination: {
            totalDocs: 0,
            page,
            limit,
            totalPages: 0,
            hasPrevPage: false,
            hasNextPage: false,
          },
        });
      }

      // Check if department head can access the requested department
      if (departmentId && mongoose.Types.ObjectId.isValid(departmentId)) {
        if (!departmentIds.some((id) => id.toString() === departmentId)) {
          return res.status(403).json({
            error: "Access denied: You can only view your own departments",
          });
        }
        // Filter to only the specified department (which is under this dept head)
        const employeesInSpecificDept = await Employee.find(
          { department: departmentId },
          { _id: 1 }
        );
        allowedEmployeeIds = employeesInSpecificDept.map((e) =>
          e._id.toString()
        );
      } else {
        // Get employees in all departments under this department head
        const employeesInDepts = await Employee.find(
          { department: { $in: departmentIds } },
          { _id: 1 }
        );
        allowedEmployeeIds = employeesInDepts.map((e) => e._id.toString());
      }

      // Department head can filter by role within their allowed employees
      if (role) {
        const roleFilteredEmployees = await Employee.find(
          {
            _id: {
              $in: allowedEmployeeIds.map(
                (id) => new mongoose.Types.ObjectId(id)
              ),
            },
            role: new RegExp(role, "i"),
          },
          { _id: 1 }
        );

        allowedEmployeeIds = roleFilteredEmployees.map((e) => e._id.toString());

        if (allowedEmployeeIds.length === 0) {
          return res.status(200).json({
            leaveStats: [],
            year: year ? parseInt(year, 10) : Time.now().year,
            pagination: {
              totalDocs: 0,
              page,
              limit,
              totalPages: 0,
              hasPrevPage: false,
              hasNextPage: false,
            },
          });
        }
      }

      // If specific employeeId is requested, check if it's in allowed list
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
        const employeeIdStr = employeeId.toString();
        if (allowedEmployeeIds.includes(employeeIdStr)) {
          filter.employeeId = new mongoose.Types.ObjectId(employeeId);
          // Update allowedEmployeeIds to only include this specific employee
          allowedEmployeeIds = [employeeIdStr];
        } else {
          return res
            .status(403)
            .json({ error: "Access denied: Employee not in your department" });
        }
      } else {
        // Filter to only employees in their departments
        filter.employeeId = {
          $in: allowedEmployeeIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    } else {
      return res
        .status(403)
        .json({ error: "Access denied: Insufficient permissions" });
    }

    // Set year range - default to current year if not provided
    const targetYear = year ? parseInt(year, 10) : Time.now().year;
    const startOfYear = Time.fromObject({
      year: targetYear,
      month: 1,
      day: 1,
    }).startOf("day");
    const endOfYear = Time.fromObject({
      year: targetYear,
      month: 12,
      day: 31,
    }).endOf("day");

    // Get all leaves for the filtered employees (no pagination here, we need all data for stats)
    const leavesData = await LeaveRequest.find(filter);

    // Fetch holidays and weekends from Event collection
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] },
        },
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } },
        },
      },
      {
        $match: {
          startDateParsed: { $lte: Time.toJSDate(endOfYear) },
          endDateParsed: { $gte: Time.toJSDate(startOfYear) },
        },
      },
    ]);

    // Create sets for holiday and weekend dates
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(
        event.startDateParsed < Time.toJSDate(startOfYear)
          ? Time.toJSDate(startOfYear)
          : event.startDateParsed
      );
      const eventEnd = Time.fromJSDate(
        event.endDateParsed > Time.toJSDate(endOfYear)
          ? Time.toJSDate(endOfYear)
          : event.endDateParsed
      );

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Calculate leave statistics for filtered employees
    const employeeStats = {};

    // First, get all employees that should be included based on the filter
    let allEmployeesToInclude = [];

    if (loginUser.role === "Admin") {
      // Admin can see all employees
      if (employeeId && mongoose.Types.ObjectId.isValid(employeeId)) {
        allEmployeesToInclude = [employeeId];
      } else if (
        departmentId &&
        mongoose.Types.ObjectId.isValid(departmentId)
      ) {
        // Get employees in the specified department only
        let departmentFilter = { department: departmentId };
        if (role) {
          departmentFilter.role = new RegExp(role, "i");
        }
        const employeesInDept = await Employee.find(departmentFilter, {
          _id: 1,
        });
        allEmployeesToInclude = employeesInDept.map((emp) =>
          emp._id.toString()
        );
      } else if (role) {
        // Filter all employees by role only
        const roleFilteredEmployees = await Employee.find(
          { role: new RegExp(role, "i") },
          { _id: 1 }
        );
        allEmployeesToInclude = roleFilteredEmployees.map((emp) =>
          emp._id.toString()
        );
      } else {
        // Get all employees
        const allEmployees = await Employee.find({}, { _id: 1 });
        allEmployeesToInclude = allEmployees.map((emp) => emp._id.toString());
      }
    } else if (loginUser.role === "DepartmentHead") {
      // Use the already calculated allowedEmployeeIds (which already considers department and role filtering)
      allEmployeesToInclude = allowedEmployeeIds;
    }

    // Initialize stats for all employees that should be included
    allEmployeesToInclude.forEach((empId) => {
      employeeStats[empId] = {
        employeeId: empId,
        totalLeave: 0,
        casualLeave: { approved: 0, pending: 0, rejected: 0, total: 0 },
        medicalLeave: { approved: 0, pending: 0, rejected: 0, total: 0 },
        annualLeave: { approved: 0, pending: 0, rejected: 0, total: 0 },
      };
    });

    // Get all leaves for the filtered employees within the year range
    const allLeavesFilter = { ...filter };

    leavesData.forEach((leave) => {
      const empId = leave.employeeId.toString();

      // Only process if this employee should be included (safety check)
      if (!employeeStats[empId]) {
        return; // Skip if employee not in our allowed list
      }

      const leaveStart = Time.fromJSDate(leave.startDate);
      const leaveEnd = Time.fromJSDate(leave.endDate);

      // Clamp leave period within target year
      const clampedStart = leaveStart < startOfYear ? startOfYear : leaveStart;
      const clampedEnd = leaveEnd > endOfYear ? endOfYear : leaveEnd;

      // Skip if leave does not intersect target year
      if (clampedEnd < startOfYear || clampedStart > endOfYear) return;

      // Calculate leave days excluding weekends and holidays
      let dayCount = 0;
      let current = clampedStart;

      while (current <= clampedEnd) {
        const dateStr = current.toISODate();
        // Only count if it's not a holiday or weekend
        if (!holidayDates.has(dateStr) && !weekendDates.has(dateStr)) {
          dayCount++;
        }
        current = current.plus({ days: 1 });
      }

      // Add to employee's leave count
      employeeStats[empId].totalLeave += dayCount;

      const typeKey = {
        Casual: "casualLeave",
        Medical: "medicalLeave",
        Annual: "annualLeave",
      }[leave.leaveType];

      if (!typeKey) return; // Skip if type is not valid

      employeeStats[empId][typeKey].total += dayCount;

      if (leave.status === "approved") {
        employeeStats[empId][typeKey].approved += dayCount;
      } else if (
        ["pending_dept_head", "pending_admin"].includes(leave.status)
      ) {
        employeeStats[empId][typeKey].pending += dayCount;
      } else if (leave.status === "rejected") {
        employeeStats[empId][typeKey].rejected += dayCount;
      } else {
        console.warn(
          `Unknown leave status "${leave.status}" for leave ID ${leave._id}`
        );
      }
    });

    // Convert employeeStats object to array
    const statsArray = Object.values(employeeStats);

    // Apply pagination to employee stats
    const totalEmployeeStats = statsArray.length;
    const paginatedStats = statsArray.slice(skip, skip + limit);

    // Get employee details for the paginated stats only
    const employeeIds = paginatedStats.map((stat) => stat.employeeId);

    let employeeFilter = { _id: { $in: employeeIds } };

    // Additional filtering for department heads
    if (loginUser.role === "DepartmentHead") {
      employeeFilter._id = {
        $in: employeeIds.filter((id) => allowedEmployeeIds.includes(id)),
      };
    }

    const employees = await Employee.find(employeeFilter)
      .populate("department", "name")
      .lean();

    const employeeMap = Object.fromEntries(
      employees.map((emp) => [emp._id.toString(), emp])
    );

    // Merge employee details with paginated stats
    const enrichedStats = paginatedStats.map((stat) => {
      const employee = employeeMap[stat.employeeId];
      return {
        ...stat,
        employeeDetails: employee
          ? {
              firstName: employee.firstName,
              lastName: employee.lastName,
              email: employee.email,
              role: employee.role,
              photoUrl: employee.photoUrl || null,
              department: employee.department || null,
            }
          : null,
      };
    });

    const pagination = {
      totalDocs: totalEmployeeStats,
      page,
      limit,
      totalPages: Math.ceil(totalEmployeeStats / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalEmployeeStats / limit),
    };

    res.status(200).json({
      leaveStats: enrichedStats,
      year: targetYear,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching admin leave stats:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get all leave requests for employees in the department(s) led by the department head
async function getLeavesForDepartmentHead(req, res) {
  try {
    const { deptHeadId, departmentIds, employeeIds, leaveType, status, year } =
      req.query; // department head's user ID
    if (!deptHeadId) {
      return res.status(400).json({ error: "deptHeadId is required" });
    }

    // Find departments led by this department head
    let deptFilter = { departmentHeads: deptHeadId };

    // If specific departmentIds are provided, filter departments further
    if (departmentIds) {
      let deptIds = Array.isArray(departmentIds)
        ? departmentIds
        : departmentIds.split(",");
      deptIds = deptIds
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (deptIds.length > 0) {
        deptFilter._id = {
          $in: deptIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    const departments = await Department.find(deptFilter, { _id: 1 });
    const departmentIdsList = departments.map((d) => d._id);
    if (departmentIdsList.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // Find employees in these departments
    let empFilter = { department: { $in: departmentIdsList } };

    // If specific employeeIds are provided, filter employees further
    if (employeeIds) {
      let empIds = Array.isArray(employeeIds)
        ? employeeIds
        : employeeIds.split(",");
      empIds = empIds
        .map((id) => id.trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (empIds.length > 0) {
        empFilter._id = {
          $in: empIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    const employees = await Employee.find(empFilter, { _id: 1 });
    const employeeIdsList = employees.map((e) => e._id);

    // Pagination params
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const skip = (page - 1) * limit;

    // Build leave filter
    const leaveFilter = { employeeId: { $in: employeeIdsList } };

    if (leaveType) {
      leaveFilter.leaveType = leaveType;
    }

    if (status) {
      leaveFilter.status = status;
    }

    // Add year filter - default to current year if not provided
    const targetYear = year ? parseInt(year, 10) : Time.now().year;
    const startOfYear = Time.fromObject({
      year: targetYear,
      month: 1,
      day: 1,
    }).startOf("day");
    const endOfYear = Time.fromObject({
      year: targetYear,
      month: 12,
      day: 31,
    }).endOf("day");

    leaveFilter.$expr = {
      $and: [
        {
          $lte: [
            {
              $dateTrunc: { date: "$startDate", unit: "day", timezone: "UTC" },
            },
            Time.toJSDate(endOfYear),
          ],
        },
        {
          $gte: [
            { $dateTrunc: { date: "$endDate", unit: "day", timezone: "UTC" } },
            Time.toJSDate(startOfYear),
          ],
        },
      ],
    };

    // Find leave requests for these employees with pagination
    const [totalDocs, leaves] = await Promise.all([
      LeaveRequest.countDocuments(leaveFilter),
      LeaveRequest.find(leaveFilter)
        .populate(
          "employeeId",
          "firstName lastName email role designation photoUrl"
        )
        .populate(
          "adminId",
          "firstName lastName email role designation photoUrl"
        )
        .populate(
          "deptHeadIds",
          "firstName lastName email role designation photoUrl"
        )
        .populate("departmentId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    // Calculate duration for each leave
    const leavesWithDuration = await Promise.all(
      leaves.map(async (leave) => {
        const duration = await calculateLeaveDuration(
          leave.startDate,
          leave.endDate
        );
        return {
          ...leave.toObject(),
          duration: duration,
        };
      })
    );

    const pagination = {
      totalDocs,
      page,
      limit,
      totalPages: Math.ceil(totalDocs / limit),
      hasPrevPage: page > 1,
      hasNextPage: page < Math.ceil(totalDocs / limit),
    };

    res.status(200).json({ data: leavesWithDuration, pagination });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single leave request by ID
async function getSingleLeave(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid leave request ID" });
    }

    const leave = await LeaveRequest.findById(id)
      .populate({
        path: "employeeId",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate("adminId", "firstName lastName email role designation photoUrl")
      .populate(
        "deptHeadIds",
        "firstName lastName email role designation photoUrl"
      )
      .populate("departmentId", "name");

    if (!leave) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    // Calculate duration for the leave
    const duration = await calculateLeaveDuration(
      leave.startDate,
      leave.endDate
    );

    res.status(200).json({
      success: true,
      data: {
        ...leave.toObject(),
        duration: duration,
      },
    });
  } catch (error) {
    console.error("❌ Get Single Leave Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Update leave request
async function updateLeave(req, res) {
  try {
    const { id } = req.params;
    const {
      startDate: startISO,
      endDate: endISO,
      leaveType,
      reason,
      paidLeave,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid leave request ID" });
    }

    const leave = await LeaveRequest.findById(id);
    if (!leave) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    let updatedStartDate = leave.startDate;
    let updatedEndDate = leave.endDate;
    let dateUpdated = false;

    // Validate dates if provided
    if (startISO) {
      const startDT = Time.fromISO(startISO).startOf("day");
      if (!Time.isValidDateTime(startDT)) {
        return res.status(400).json({ error: "Invalid start date" });
      }
      updatedStartDate = Time.toJSDate(startDT);
      leave.startDate = updatedStartDate;
      dateUpdated = true;
    }

    if (endISO) {
      const endDT = Time.fromISO(endISO).endOf("day");
      if (!Time.isValidDateTime(endDT)) {
        return res.status(400).json({ error: "Invalid end date" });
      }
      updatedEndDate = Time.toJSDate(endDT);
      leave.endDate = updatedEndDate;
      dateUpdated = true;
    }

    // Validate date range if both dates are being updated
    if (startISO && endISO) {
      const startDT = Time.fromISO(startISO).startOf("day");
      const endDT = Time.fromISO(endISO).endOf("day");
      if (Time.isAfter(startDT, endDT)) {
        return res
          .status(400)
          .json({ error: "Start date cannot be after end date" });
      }
    }

    // Validate leave period if dates were updated
    if (startISO || endISO) {
      const validation = await validateLeavePeriod(
        updatedStartDate,
        updatedEndDate
      );
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
    }

    // ✅ Handle paid/unpaid leave calculation if dates were updated or paidLeave is provided
    if (dateUpdated || paidLeave !== undefined) {
      const leaveDuration = await calculateLeaveDuration(
        leave.startDate,
        leave.endDate
      );
      const totalWorkingDays = leaveDuration.workingDays;

      // Set paid leave days (can be 0 or use existing value) and calculate unpaid leave
      const paidLeaveDays =
        paidLeave !== undefined ? paidLeave : leave.paidLeave || 0;
      const unpaidLeaveDays = Math.max(0, totalWorkingDays - paidLeaveDays);

      // Validate that paid leave doesn't exceed total working days
      if (paidLeaveDays > totalWorkingDays) {
        return res.status(400).json({
          error: `Paid leave days (${paidLeaveDays}) cannot exceed total working days (${totalWorkingDays})`,
        });
      }

      // Update leave request with paid/unpaid breakdown
      leave.paidLeave = paidLeaveDays;
      leave.unpaidLeave = unpaidLeaveDays;
    }

    // Update other fields if provided
    if (leaveType) {
      const validTypes = ["Casual", "Medical", "Annual"];
      if (!validTypes.includes(leaveType)) {
        return res.status(400).json({ error: "Invalid leave type" });
      }
      leave.leaveType = leaveType;
    }

    if (reason) {
      leave.reason = reason;
    }

    await leave.save();

    // Calculate duration for the updated leave
    const duration = await calculateLeaveDuration(
      leave.startDate,
      leave.endDate
    );

    // Send notification to employee about the update
    await sendNotificationToUsers({
      userIds: [leave.employeeId],
      type: "leave",
      title: "Leave Request Updated",
      message: `Your leave request has been updated. Status: ${leave.status}`,
    });

    res.status(200).json({
      success: true,
      message: "Leave request updated successfully",
      data: {
        ...leave.toObject(),
        duration: duration,
        paidLeave: leave.paidLeave,
        unpaidLeave: leave.unpaidLeave,
      },
    });
  } catch (error) {
    console.error("❌ Update Leave Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Delete leave request
async function deleteLeave(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid leave request ID" });
    }

    const leave = await LeaveRequest.findByIdAndDelete(id);
    if (!leave) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    // Send notification to employee about deletion
    await sendNotificationToUsers({
      userIds: [leave.employeeId],
      type: "leave",
      title: "Leave Request Deleted",
      message: "Your leave request has been deleted.",
    });

    res.status(200).json({
      success: true,
      message: "Leave request deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete Leave Error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Remove old approveLeave and rejectLeave functions and their exports
// Only export the new multi-stage functions
module.exports = {
  requestLeave,
  deptHeadAction,
  adminAction,
  getLeaves,
  getLeaveStats,
  getLeavesByUserId,
  getLeaveStatsForAdmin,
  getLeavesForDepartmentHead,
  getSingleLeave,
  updateLeave,
  deleteLeave,
};
