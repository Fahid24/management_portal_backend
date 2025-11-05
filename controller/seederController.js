const Task = require("../model/taskSchema");
const Department = require("../model/departmentSchema");
const Attendance = require("../model/attendenceSchema");
const Project = require("../model/projectSchema");
const Leave = require("../model/leaveSchema");
const TaskAssignment = require("../model/taskAssignmentSchema");
const Employee = require("../model/employeeSchema");
const Event = require("../model/eventSchema");
const ClientInfo = require("../model/clientFormModel");
const DailyTask = require("../model/dailyTaskSchema");
const { DateTime } = require("luxon");
const Time = require("../utils/time");

const convertToDhaka = (date) => {
  if (!date) return null;
  const dt = DateTime.fromJSDate(date, { zone: "America/Los_Angeles" });
  return dt.setZone("Asia/Dhaka").toJSDate();
};

const fixDateFieldToDhaka = (originalDate) => {
  if (!originalDate) return null;

  // Interpret original `date` as if it were in PST
  const pstLocal = DateTime.fromJSDate(originalDate, {
    zone: "America/Los_Angeles",
  });

  // Get start of day in Asia/Dhaka with the same calendar date
  const dhakaStartOfDay = DateTime.fromObject(
    {
      year: pstLocal.year,
      month: pstLocal.month,
      day: pstLocal.day,
    },
    { zone: "Asia/Dhaka" }
  ).startOf("day");

  return dhakaStartOfDay.toJSDate(); // stored as UTC in Mongo
};

// Utility function to calculate leave duration excluding holidays and weekends
const calculateLeaveDuration = async (startDate, endDate) => {
  try {
    const startDT = Time.fromJSDate(startDate);
    const endDT = Time.fromJSDate(endDate);

    // Get holidays and weekends from Event collection
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] }
        }
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: Time.toJSDate(endDT) },
          endDateParsed: { $gte: Time.toJSDate(startDT) }
        }
      }
    ]);

    // Create sets for holiday and weekend dates
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(event.startDateParsed < Time.toJSDate(startDT) ? Time.toJSDate(startDT) : event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed > Time.toJSDate(endDT) ? Time.toJSDate(endDT) : event.endDateParsed);

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
      totalDays: Math.floor(endDT.diff(startDT, 'days').days) + 1,
      workingDays: workingDays,
      holidaysWeekends: (Math.floor(endDT.diff(startDT, 'days').days) + 1) - workingDays
    };
  } catch (error) {
    console.error('Error calculating leave duration:', error);
    return {
      totalDays: 0,
      workingDays: 0,
      holidaysWeekends: 0
    };
  }
};

const handleSeederAction = async (req, res) => {
  try {
    const { secret, action } = req.body;

    if (!secret || secret !== "ADMIN_SECRET") {
      return res.status(403).json({ message: "Unauthorized: Invalid secret" });
    }

    if (!action) {
      return res.status(400).json({ message: "Missing 'action' parameter." });
    }

    switch (action) {
      case "run-task-seeder": {
        const result = await Task.updateMany(
          { $or: [{ status: { $exists: false } }, { status: null }] },
          { $set: { status: "To Do" } }
        );
        return res.status(200).json({
          message: `✅ Task Seeder: ${result.modifiedCount} task(s) updated.`,
        });
      }

      case "run-project-seeder": {
        const result = await Project.updateMany(
          {
            $or: [
              { isProjectBasedKpi: { $exists: false } },
              { projectKpi: { $exists: false } },
            ],
          },
          {
            $set: {
              isProjectBasedKpi: false,
              projectKpi: [],
            },
          }
        );

        return res.status(200).json({
          message: `✅ Project Seeder: ${result.modifiedCount} project(s) updated.`,
        });
      }

      // drop-client-email-index
      case "drop-client-email-index": {
        const indexes = await ClientInfo.collection.listIndexes().toArray();

        // Find the unique email index
        const emailIndex = indexes.find(
          (index) => index.key && index.key.email === 1 && index.unique
        );

        if (emailIndex) {
          await ClientInfo.collection.dropIndex(emailIndex.name);
          return res.status(200).json({
            message: `✅ Dropped unique index on 'email': ${emailIndex.name}`,
          });
        } else {
          return res.status(200).json({
            message: "ℹ No unique index found on 'email' field.",
          });
        }
      }

      case "drop-department-name-index": {
        const indexes = await Department.collection.getIndexes({ full: true });

        const nameIndex = indexes.find(
          (index) => index.key && index.key.name === 1 && index.unique
        );

        if (nameIndex) {
          await Department.collection.dropIndex(nameIndex.name);
          return res.status(200).json({
            message: `✅ Dropped unique index on 'name' field: ${nameIndex.name}`,
          });
        } else {
          return res.status(200).json({
            message: "ℹ️ No unique index found on 'name' field.",
          });
        }
      }

      case "insert-attendance-seed": {
        const { attendanceData } = req.body;
        if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
          return res
            .status(400)
            .json({
              message:
                "attendanceData is required and must be a non-empty array.",
            });
        }

        // Remove duplicates (by employeeId+date), then bulk insert
        for (const item of attendanceData) {
          await Attendance.deleteOne({
            employeeId: item.employeeId,
            date: new Date(item.date),
          });
        }

        const inserted = await Attendance.insertMany(
          attendanceData.map((item) => ({
            ...item,
            date: new Date(item.date),
            checkIn: item.checkIn ? new Date(item.checkIn) : null,
            checkOut: item.checkOut ? new Date(item.checkOut) : null,
          }))
        );

        return res.status(200).json({
          message: `✅ Inserted ${inserted.length} attendance records.`,
        });
      }

      case "migrate-department-heads": {
        let deptCount = 0;
        let projCount = 0;
        let leaveCount = 0;
        let assignmentCount = 0;

        // --- Update Departments ---
        const departments = await Department.find({
          departmentHead: { $exists: true, $ne: null },
        });

        for (const dept of departments) {
          const headId = dept.departmentHead;

          if (!Array.isArray(dept.departmentHeads)) {
            await Department.updateOne(
              { _id: dept._id },
              { $set: { departmentHeads: [headId] } }
            );
          } else {
            const headsArray = dept.departmentHeads.map((id) => id.toString());
            if (!headsArray.includes(headId.toString())) {
              await Department.updateOne(
                { _id: dept._id },
                { $addToSet: { departmentHeads: headId } }
              );
            }
          }
          deptCount++;
        }

        // --- Update Project.departments[].departmentHeads ---
        const projects = await Project.find({});

        for (const project of projects) {
          let hasUpdate = false;

          // Modify departments array directly on the Mongoose document
          const updatedDepartments = project.departments.map((deptBlock) => {
            if (!deptBlock?.departmentHead) return deptBlock;

            const headId = deptBlock.departmentHead.toString();
            const headsArray = Array.isArray(deptBlock.departmentHeads)
              ? deptBlock.departmentHeads.map((id) => id.toString())
              : [];

            if (!headsArray.includes(headId)) {
              hasUpdate = true;
              return {
                ...deptBlock.toObject?.(), // flatten nested Mongoose doc if needed
                departmentHeads: [...headsArray, deptBlock.departmentHead],
              };
            }

            return deptBlock;
          });

          if (hasUpdate) {
            project.departments = updatedDepartments;
            project.markModified("departments"); // explicitly tell Mongoose to save nested changes
            await project.save();
            projCount++;
          }
        }

        // --- Update Leave.deptHeadIds ---
        const leaves = await Leave.find({
          deptHeadId: { $exists: true, $ne: null },
        });

        for (const leave of leaves) {
          const headId = leave.deptHeadId;

          const currentArray = Array.isArray(leave.deptHeadIds)
            ? leave.deptHeadIds.map((id) => id.toString())
            : [];

          if (!currentArray.includes(headId.toString())) {
            leave.deptHeadIds = [...currentArray, headId];
            leave.markModified("deptHeadIds");
          }

          // Optional: remove deptHeadId (if you want to clean up old field)
          // delete leave.deptHeadId;

          await leave.save();
          leaveCount++;
        }

        // --- Update TaskAssignment.department from first task ---
        const assignments = await TaskAssignment.find({
          department: { $exists: false },
        });

        for (const assignment of assignments) {
          if (!Array.isArray(assignment.tasks) || assignment.tasks.length === 0)
            continue;

          const firstTaskId = assignment.tasks[0];
          const task = await Task.findById(firstTaskId).select("department");

          if (task?.department) {
            assignment.department = task.department;
            assignment.markModified("department");
            await assignment.save();
            assignmentCount++;
          }
        }

        return res.status(200).json({
          message: `✅ Migrated ${deptCount} department(s), ${projCount} project(s), ${leaveCount} leave(s), and ${assignmentCount} task assignment(s).`,
        });
      }

      case "migrate-isUpdated-flag": {
        const getNestedValue = (obj, path) => {
          return path.split(".").reduce((acc, key) => acc?.[key], obj);
        };

        const requiredFields = [
          "firstName",
          "lastName",
          "email",
          "password",
          "gender",
          "ssnLast4",
          "address.address",
          "address.city",
          "filingStatus",
          "maritalStatus",
          "phone",
          "dateOfBirth",
          "emergencyContact.name",
          "emergencyContact.phonePrimary",
          "emergencyContact.relationship",
          "emergencyContact.address",
          "emergencyContact.email",
        ];

        const isProfileComplete = (emp) => {
          return requiredFields.every((field) => !!getNestedValue(emp, field));
        };

        const employees = await Employee.find({});
        let updatedCount = 0;

        for (const emp of employees) {
          const isUpdated = isProfileComplete(emp);
          emp.isUpdated = isUpdated;
          await emp.save();
          updatedCount++;
        }

        return res.status(200).json({
          message: `✅ Migrated isUpdated flag for ${updatedCount} employee(s).`,
        });
      }

      case "migrate-attendance-timezone": {
        const records = await Attendance.find({});
        let updatedCount = 0;

        for (const record of records) {
          const updatePayload = {};

          if (record.date) {
            updatePayload.date = convertToDhaka(record.date);
          }

          if (record.checkIn) {
            updatePayload.checkIn = convertToDhaka(record.checkIn);
          }

          if (record.checkOut) {
            updatePayload.checkOut = convertToDhaka(record.checkOut);
          }

          if (Object.keys(updatePayload).length > 0) {
            await Attendance.updateOne(
              { _id: record._id },
              { $set: updatePayload }
            );
            updatedCount++;
          }
        }

        return res.status(200).json({
          message: `✅ Timezone migrated to Asia/Dhaka for ${updatedCount} attendance record(s).`,
        });
      }

      case "fix-attendance-date-only": {
        const records = await Attendance.find({});
        let updatedCount = 0;

        for (const record of records) {
          if (!record.date) continue;

          const correctedDate = new Date("2025-07-20T18:00:00.000Z");

          await Attendance.updateOne(
            { _id: record._id },
            { $set: { date: correctedDate } }
          );

          updatedCount++;
        }

        return res.status(200).json({
          message: `✅ Date field fixed for ${updatedCount} attendance record(s).`,
        });
      }

      case "migrate-leave-paid-unpaid": {
        const leaves = await Leave.find({});
        let updatedCount = 0;
        let errorCount = 0;

        for (const leave of leaves) {
          try {
            if (!leave.startDate || !leave.endDate) {
              console.log(`Skipping leave ${leave._id}: Missing start or end date`);
              continue;
            }

            // Calculate leave duration
            const duration = await calculateLeaveDuration(leave.startDate, leave.endDate);
            const workingDays = duration.workingDays;

            // Set all working days as paid leave, unpaid leave as 0
            const updatePayload = {
              paidLeave: workingDays,
              unpaidLeave: 0
            };

            await Leave.updateOne({ _id: leave._id }, { $set: updatePayload });
            updatedCount++;

            if (updatedCount % 50 === 0) {
              console.log(`Processed ${updatedCount} leave records...`);
            }
          } catch (error) {
            console.error(`Error processing leave ${leave._id}:`, error);
            errorCount++;
          }
        }

        return res.status(200).json({
          message: `✅ Migrated paid/unpaid leave for ${updatedCount} leave record(s). ${errorCount} errors encountered.`,
          details: {
            updated: updatedCount,
            errors: errorCount,
            total: leaves.length
          }
        });
      }

      case "update-existing-attendance-shift": {

        const attendanceRecords = await Attendance.updateMany({ employeeShift: { $exists: false } }, { $set: { employeeShift: "Day" } });

        return res.status(200).json({
          message: `✅ Updated shift for ${attendanceRecords.modifiedCount} attendance record(s).`,
        });
      }

      case "complete-in-review-daily-tasks": {
        const { employeeId } = req.body;

        if (!employeeId) {
          return res.status(400).json({
            message: "employeeId is required for this seeder action."
          });
        }

        // Get the employee details to check role
        const employee = await Employee.findById(employeeId).populate('department');
        if (!employee) {
          return res.status(404).json({
            message: "Employee not found."
          });
        }

        let taskFilters = { status: "In Review", isDeleted: false };
        let authorizedEmployeeIds = [];

        // Role-based filtering logic
        switch (employee.role) {
          case "Admin":
            // Admin can see all tasks - no additional filtering needed
            break;

          case "DepartmentHead":
            // Department Head can only see tasks of employees in their departments
            const departmentsWithHead = await Department.find({
              departmentHeads: employeeId,
              isDeleted: false,
            }).select("_id");

            if (departmentsWithHead.length === 0) {
              return res.status(200).json({
                message: "No departments found for this Department Head.",
                updatedCount: 0
              });
            }

            const departmentIds = departmentsWithHead.map((d) => d._id);
            const employeesInDepartments = await Employee.find({
              department: { $in: departmentIds },
              status: { $ne: "Pending" }
            }).select("_id");

            authorizedEmployeeIds = employeesInDepartments.map((e) => e._id);
            taskFilters.employeeId = { $in: authorizedEmployeeIds };
            break;

          case "Manager":
          case "Employee":
            // Managers and Employees cannot perform this action
            return res.status(403).json({
              message: "Insufficient permissions. Only Admin and Department Head can complete tasks."
            });

          default:
            return res.status(400).json({
              message: "Invalid employee role."
            });
        }

        // Find all tasks that match the criteria
        const tasksToUpdate = await DailyTask.find(taskFilters)
          .populate("employeeId", "firstName lastName")
          .populate("assignedBy", "firstName lastName");

        if (tasksToUpdate.length === 0) {
          return res.status(200).json({
            message: "No tasks in 'In Review' status found for the authorized scope.",
            updatedCount: 0
          });
        }

        let updatedCount = 0;
        let errorCount = 0;
        const updatedTasks = [];

        // Update each task from "In Review" to "Completed"
        for (const task of tasksToUpdate) {
          try {
            // Prepare update payload
            const updatePayload = {
              status: "Completed",
              isCompleted: true,
              // Keep existing completion and completionTime from when it was set to "In Review"
              // Just update the completion timestamp
              completedDate: Time.toJSDate(Time.now())
            };

            // Update the task
            const updatedTask = await DailyTask.findByIdAndUpdate(
              task._id,
              { $set: updatePayload },
              { new: true }
            );

            if (updatedTask) {
              updatedCount++;
              updatedTasks.push({
                taskId: updatedTask._id,
                title: updatedTask.title,
                employeeName: task.employeeId ? `${task.employeeId.firstName} ${task.employeeId.lastName}` : "Unknown",
                assignedByName: task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : "Unknown",
                completionPercentage: updatedTask.completion || 0
              });
            }

            // Log progress for large batches
            if (updatedCount % 10 === 0) {
              console.log(`Completed ${updatedCount} tasks...`);
            }

          } catch (error) {
            console.error(`Error updating task ${task._id}:`, error);
            errorCount++;
          }
        }

        // Prepare detailed response
        const response = {
          message: `✅ Successfully completed ${updatedCount} daily task(s) from 'In Review' to 'Completed' status.`,
          details: {
            updatedCount,
            errorCount,
            totalFound: tasksToUpdate.length,
            executedBy: {
              employeeId: employee._id,
              name: `${employee.firstName} ${employee.lastName}`,
              role: employee.role,
              department: employee.department?.name || "No Department"
            },
            scope: employee.role === "Admin" ? "All tasks" : `Department(s): ${authorizedEmployeeIds.length} employees`,
            updatedTasks: updatedTasks.slice(0, 20) // Show first 20 for brevity
          }
        };

        if (updatedTasks.length > 20) {
          response.details.note = `Showing first 20 tasks. Total ${updatedTasks.length} tasks updated.`;
        }

        return res.status(200).json(response);
      }

      default:
        return res.status(400).json({
          message: `Invalid action: '${action}'`,
        });
    }
  } catch (err) {
    console.error("Seeder error:", err);
    res.status(500).json({ message: "Seeder failed", error: err.message });
  }
};

module.exports = {
  handleSeederAction,
};
