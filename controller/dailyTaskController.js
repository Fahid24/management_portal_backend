const DailyTask = require("../model/dailyTaskSchema");
const TaskAssignment = require("../model/taskAssignmentSchema");
const Department = require("../model/departmentSchema");
const Employee = require("../model/employeeSchema");
const mongoose = require("mongoose");
const Time = require("../utils/time");
// CREATE
const VALID_STATUSES = ["To Do", "In Progress", "Completed", "In Review"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const VALID_UNITS = ["minutes", "hours", "days", "weeks"];

const createTask = async (req, res) => {
  try {
    const {
      employeeId,
      title,
      details,
      assignedBy,
      project,
      dueDate,
      priority = "medium",
      attachments = []
    } = req.body;

    // Validate required fields
    if (!employeeId || !title || !details || !assignedBy || !dueDate) {
      return res.status(400).json({
        message: "employeeId, title, details, assignedBy and dueDate are required."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        message: "Invalid employeeId ID."
      });
    }

    if (!mongoose.Types.ObjectId.isValid(assignedBy)) {
      return res.status(400).json({
        message: "Invalid assignedBy ID."
      });
    }

    if (project && !mongoose.Types.ObjectId.isValid(project)) {
      return res.status(400).json({
        message: "Invalid project ID."
      });
    }

    // Validate priority
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        message: "Invalid priority. Must be 'low', 'medium', or 'high'."
      });
    }

    // Validate attachments
    if (!Array.isArray(attachments) || !attachments.every(a => typeof a === "string")) {
      return res.status(400).json({
        message: "Attachments must be an array of strings (URLs or file paths)."
      });
    }

    // Validate dueDate
    const dt = Time.fromISO(dueDate);
    if (!Time.isValidDateTime(dt)) {
      return res.status(400).json({
        message: "Invalid dueDate. Must be a valid ISO datetime string."
      });
    }

    // Prepare full task with default values
    const taskData = {
      employeeId,
      title,
      project,
      details,
      assignedBy,
      priority,
      attachments,
      dueDate: Time.toJSDate(dt),
      status: "To Do",
      completion: 0,
      isCompleted: false,
      completionTime: {
        value: 0,
        unit: "hours"
      },
      assignedDate: Time.toJSDate(Time.now())
    };

    const task = await DailyTask.create(taskData);

    res.status(201).json({ message: "Task created successfully", task });
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// READ - All tasks (with optional filters like employeeId)
const getTasks = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const {
      employeeId,
      departmentHead,
      managerId,
      status,
      startDate,
      endDate,
      departmentId,
    } = req.query;

    const filters = { isDeleted: false };

    // Department filter: show tasks for all employees in the specified department
    if (departmentId) {
      const employeesInDepartment = await Employee.find({
        department: departmentId,
      }).select("_id");

      console.log(employeesInDepartment);

      const employeeIds = employeesInDepartment.map((e) => e._id.toString());
      filters.employeeId = { $in: employeeIds };
    }
    // Department Head: show tasks for all employees in their departments
    else if (departmentHead) {
      const deptHeadId = departmentHead;
      const departmentsWithHead = await Department.find({
        departmentHeads: deptHeadId,
        isDeleted: false,
      }).select("_id");

      const departmentIds = departmentsWithHead.map((d) => d._id);

      const employees = await Employee.find({
        department: { $in: departmentIds },
      }).select("_id");

      const employeeIds = employees.map((e) => e._id.toString());
      filters.employeeId = { $in: [...employeeIds, deptHeadId] };
    }

    // Manager: show tasks for all employees in their departments (via projects)
    else if (managerId) {
      const departmentsManaged = await Department.find({
        projectManagers: managerId,
        isDeleted: false,
      }).select("_id");

      const deptIds = departmentsManaged.map((d) => d._id);

      const employees = await Employee.find({
        department: { $in: deptIds },
        isDeleted: false,
      }).select("_id");

      filters.employeeId = {
        $in: [...employees.map((e) => e._id.toString()), managerId],
      };
    }

    if (employeeId) filters.employeeId = employeeId;
    if (status) filters.status = status;

    // Apply date filters using Luxon via Time util
    if (startDate && endDate) {
      const { start, end } = Time.getDateRangeFromISO(startDate, endDate);

      if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
        return res.status(400).json({ message: "Invalid date range provided" });
      }

      filters.createdAt = {
        $gte: Time.toJSDate(start),
        $lte: Time.toJSDate(end),
      };
    }

    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      DailyTask.find(filters)
        .populate("employeeId", "firstName lastName email photoUrl")
        .populate("assignedBy", "firstName lastName email photoUrl")
        .populate("project", "name description")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      DailyTask.countDocuments(filters),
    ]);

    res.status(200).json({
      tasks,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({
      message: "Error fetching tasks",
      error: error.message
    });
  }
};

// READ - Single task
const getTaskById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Task ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Task ID" });
    }
    const task = await DailyTask.findById(id)
      .populate("employeeId", "firstName lastName email photoUrl")
      .populate("assignedBy", "firstName lastName email photoUrl")
      .populate("project", "name description");

    if (!task || task.isDeleted) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: "Error fetching task", error: error.message });
  }
};

// UPDATE
const updateTask = async (req, res) => {
  try {
    const id = req.params.id;

    // Validate task ID
    if (!id) {
      return res.status(400).json({ message: "Task ID is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Task ID." });
    }

    const { title, details, priority, attachments, project, employeeId, dueDate } = req.body;

    // At least one updatable field must be present
    if (!details && !priority && !attachments && !dueDate) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    const updates = {};

    if (title) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title must be a non-empty string." });
      }
      updates.title = title;
    }

    if (details) {
      if (typeof details !== "string" || !details.trim()) {
        return res.status(400).json({ message: "Details must be a non-empty string." });
      }
      updates.details = details;
    }

    if (priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ message: "Invalid priority value." });
      }
      updates.priority = priority;
    }

    if (attachments) {
      if (!Array.isArray(attachments) || !attachments.every(a => typeof a === "string")) {
        return res.status(400).json({ message: "Attachments must be an array of strings." });
      }
      updates.attachments = attachments;
    }

    if (employeeId) {
      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        return res.status(400).json({ message: "Invalid employee ID." });
      }
      updates.employeeId = employeeId;
    }

    if (project) {
      if (!mongoose.Types.ObjectId.isValid(project)) {
        return res.status(400).json({ message: "Invalid project ID." });
      }
      updates.project = project;
    }

    if (dueDate) {
      const dt = Time.fromISO(dueDate);
      if (!Time.isValidDateTime(dt)) {
        return res.status(400).json({ message: "Invalid dueDate. Must be a valid ISO datetime string." });
      }
      updates.dueDate = Time.toJSDate(dt);
    }

    const task = await DailyTask.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!task || task.isDeleted) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.status(200).json({ message: "Task updated successfully.", task });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Error updating task", error: error.message });
  }
};

// DELETE (Soft Delete)
const deleteTask = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Task ID is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Task ID." });
    }
    // Soft delete the task by setting isDeleted to true and recording the deletion time
    const task = await DailyTask.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: Time.toJSDate(Time.now()) },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.status(200).json({ message: "Task soft-deleted", task });
  } catch (error) {
    res.status(500).json({ message: "Error deleting task", error: error.message });
  }
};

// DELETE (Hard Delete) - Optional, if you want to permanently delete tasks
const hardDeleteTask = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Task ID is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Task ID." });
    }
    const task = await DailyTask.findByIdAndDelete(id);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(200).json({ message: "Task permanently deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting task", error: error.message });
  }
};

// UPDATE Task Status
const updateTaskStatus = async (req, res) => {
  try {
    const { taskId, status, completion, completionTime, completedDetails } = req.body;

    if (!taskId || !status) {
      return res.status(400).json({ message: "taskId and status are required." });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: "Invalid taskId." });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    const existingTask = await DailyTask.findById(taskId);
      if (!existingTask) {
        return res.status(404).json({ message: "Task not found." });
      }

    if (status === "In Review" || status === "Completed") {
      if (
        completion === undefined ||
        typeof completion !== "number" ||
        completion < 0 ||
        completion > 100
      ) {
        return res.status(400).json({ message: "Completion (0-100) is required for 'In Review' status." });
      }

      if (
        !completionTime ||
        typeof completionTime.value !== "number" ||
        completionTime.value < 0 ||
        !VALID_UNITS.includes(completionTime.unit)
      ) {
        return res.status(400).json({ message: "Valid completionTime is required for 'In Review' status." });
      }

      // Validate completion time against actual time spent
      if (existingTask.startDate) {
        const now = Time.now();
        const startTime = Time.fromJSDate(existingTask.startDate);
        const actualTimeSpent = Time.diff(now, startTime);

        // Convert completion time to minutes for comparison
        let completionTimeInMinutes = completionTime.value;
        switch (completionTime.unit) {
          case "hours":
            completionTimeInMinutes *= 60;
            break;
          case "days":
            completionTimeInMinutes *= 60 * 24;
            break;
          case "weeks":
            completionTimeInMinutes *= 60 * 24 * 7;
            break;
          // "minutes" stays as is
        }

        // Get actual time spent in minutes
        const actualTimeInMinutes = actualTimeSpent.as("minutes");

        if (completionTimeInMinutes > actualTimeInMinutes) {
          return res.status(400).json({
            message: "Completion time cannot be greater than the actual time spent on the task."
          });
        }
      }
    }

    const update = { status };

    if (status === "In Progress" && !existingTask?.startDate) {
      update.startDate = Time.toJSDate(Time.now());
    }

    if (status === "In Review") {
      update.completion = completion;
      update.completionTime = completionTime;
      update.completedDate = Time.toJSDate(Time.now());
      if(completedDetails){
        update.completedDetails = completedDetails;
      }
    }

    if (status === "Completed") {
      update.completion = completion;
      update.completionTime = completionTime;
      update.isCompleted = true;
      if(completedDetails){
        update.completedDetails = completedDetails;
      }
    }

    const task = await DailyTask.findByIdAndUpdate(taskId, update, { new: true });

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    res.status(200).json({ message: "Task status updated.", task });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

// Get All todo task for an employee
const getToDoTasksForEmployee = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Valid employeeId is required." });
    }

    // 1. Paginate DailyTasks
    const [dailyTasks, dailyTaskTotal] = await Promise.all([
      DailyTask.find({ employeeId, status: "To Do", isDeleted: false })
        .populate("employeeId", "firstName lastName email photoUrl")
        .populate("assignedBy", "firstName lastName email photoUrl")
        .populate("project", "name description")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      DailyTask.countDocuments({ employeeId, status: "To Do", isDeleted: false })
    ]);

    // 2. Fetch and paginate TaskAssignments
    const assignments = await TaskAssignment.find({
      employee: employeeId,
      isDeleted: false
    }).populate({
      path: "tasks",
      match: { status: "To Do", isDeleted: false }
    })
      .populate("project", "name description")
      .sort({ assignedAt: -1 });

    const allProjectTasks = assignments.flatMap(a => a.tasks).filter(Boolean);
    const projectTaskTotal = allProjectTasks.length;

    // Manually paginate project tasks
    const paginatedProjectTasks = allProjectTasks.slice(skip, skip + limit);

    res.status(200).json({
      message: "To Do tasks fetched successfully.",
      pagination: {
        currentPage: page,
        limit,
        totalDailyTasks: dailyTaskTotal,
        totalProjectTasks: projectTaskTotal,
        totalPagesDaily: Math.ceil(dailyTaskTotal / limit),
        totalPagesProject: Math.ceil(projectTaskTotal / limit)
      },
      data: {
        dailyTasks,
        projectTasks: paginatedProjectTasks
      }
    });
  } catch (error) {
    console.error("Error fetching To Do tasks:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  hardDeleteTask,
  updateTaskStatus,
  getToDoTasksForEmployee,
};

