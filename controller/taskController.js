const mongoose = require("mongoose");
const Task = require("../model/taskSchema");
const Project = require("../model/projectSchema");
const Employee = require("../model/employeeSchema");
const Leave = require("../model/leaveSchema");
const Department = require("../model/departmentSchema");
const Kpi = require("../model/kpiSchema");
const TaskAssignment = require("../model/taskAssignmentSchema");
const Time = require("../utils/time");

/* ──────────────────────────────── helpers ──────────────────────────────── */
function buildPaginationMeta({ totalDocs, page, limit }) {
    return {
        totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        page,
        limit,
    };
}

/* ──────────────────────────────── Helper to validate date ──────────────────────────────── */
function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}

/* ──────────────────────────────── Helper to build dynamic search query ──────────────────────────────── */
async function buildTaskQuery({ search, department, project, status, startDateFrom, startDateTo }) {
    let taskQuery = {};

    // By status
    if (status) {
        const allowedStatuses = ["NotStarted", "InProgress", "Completed", "Blocked", "Cancelled"];
        if (!allowedStatuses.includes(status)) {
            throw new Error("Invalid status filter value.");
        }
        taskQuery.status = status;
    }

    // By startDate range
    if (startDateFrom || startDateTo) {
        taskQuery.startDate = {};
        if (startDateFrom) taskQuery.startDate.$gte = new Date(startDateFrom);
        if (startDateTo) taskQuery.startDate.$lte = new Date(startDateTo);
    }

    // --- Complex Search (on employee/project/department names) ---
    let employeeIds = [];
    if (search) {
        const empRegex = new RegExp(search, "i");

        // Find employees based on search term
        const employees = await Employee.find({
            $or: [
                { firstName: empRegex },
                { lastName: empRegex },
                { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: empRegex } } }
            ]
        }).select("_id");
        if (employees.length) employeeIds = employees.map(emp => emp._id);

        // Now we need to adjust the query to check if the department is part of the project
        taskQuery.$or = [];
        if (employeeIds.length) taskQuery.$or.push({ assignees: { $in: employeeIds } });
        if (taskQuery.$or.length === 0) delete taskQuery.$or; // If no search match, remove $or clause
    }

    // --- Department Filter ---
    if (department) {
        // Find projects where the department exists in the departments array
        const projects = await Project.find({
            "departments.department": department,
            isDeleted: { $ne: true }
        }).select("_id");

        if (!projects.length) {
            throw new Error("No projects found for the given department.");
        }

        // Filter tasks that belong to those projects
        taskQuery.project = { $in: projects.map(p => p._id) };
    }

    // By project ID
    if (project) taskQuery.project = project;

    // Exclude soft-deleted tasks
    taskQuery.isDeleted = { $ne: true };

    return taskQuery;
}


/* ───────────────────── Post  /api/task ───────────────────── */
async function createTask(req, res) {
    try {
        const { details, kpi, department, project, createdBy } = req.body;

        // Basic validation
        if (!details || !details.trim()) {
            return res.status(400).json({ error: "Task details are required." });
        }
        if (!kpi) {
            return res.status(400).json({ error: "KPI ID is required." });
        }
        if (!department) {
            return res.status(400).json({ error: "Department ID is required." });
        }
        if (!project) {
            return res.status(400).json({ error: "Project ID is required." });
        }
        if (!createdBy) {
            return res.status(400).json({ error: "createdBy (Employee ID) is required." });
        }

        // Validate department belongs to project
        const projectDoc = await Project.findOne({ _id: project, isDeleted: { $ne: true } });
        if (!projectDoc) {
            return res.status(404).json({ error: "Project not found." });
        }
        const projectDepartmentIds = projectDoc.departments.map(dep =>
            (typeof dep === 'object' && dep.department) ? dep.department.toString() : dep.toString()
        );
        if (!projectDepartmentIds.includes(department)) {
            return res.status(400).json({ error: `Department (${department}) does not belong to project (${project}).` });
        }

        // Validate kpi belongs to department
        const deptDoc = await Department.findOne({ _id: department, isDeleted: { $ne: true } });
        if (!deptDoc) {
            return res.status(404).json({ error: "Department not found." });
        }
        const departmentKpiIds = (deptDoc.kpiCriteria || []).map(kpiObj =>
            (typeof kpiObj === 'object' && kpiObj.kpi) ? kpiObj.kpi.toString() : kpiObj.toString()
        );
        if (!departmentKpiIds.includes(kpi)) {
            return res.status(400).json({ error: `KPI (${kpi}) does not belong to department (${department}).` });
        }

        // All validation passed, create the task
        const task = new Task({
            details: details.trim(),
            kpi,
            department,
            project,
            createdBy
        });

        await task.save();

        return res.status(201).json({
            message: "Task created successfully",
            task
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error", detail: err.message });
    }
}

/* ───────────────────── GET  /api/task ───────────────────── */
async function getAllTasks(req, res) {
    try {
        // Pagination
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;

        // Build query with utility function (handles all search/filter logic)
        let taskQuery;
        try {
            taskQuery = await buildTaskQuery({ ...req.query });
        } catch (e) {
            return res.status(400).json({ success: false, message: e.message });
        }

        // Query tasks
        const total = await Task.countDocuments(taskQuery);
        const tasks = await Task.find(taskQuery)
            .sort({ createdAt: -1 }) // Most recent first
            .skip(skip)
            .limit(limit)
            .populate([
                { path: "project", select: "name description" },
                { path: "department", select: "name description" },
                { path: "kpi" },
                { path: "createdBy", select: "firstName lastName email photoUrl" },
            ])
            .lean();

        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully.",
            tasks,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET  /api/task/:id ───────────────────── */
async function getSingleTask(req, res) {
    try {
        const { id } = req.params;

        // 1. Validate task ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid or missing task ID." });
        }

        // 2. Find task (exclude soft-deleted)
        const task = await Task.findOne({ _id: id, isDeleted: { $ne: true } })
            .populate([
                { path: "project", select: "name description" },
                { path: "department", select: "name description" },
                { path: "kpi" },
                { path: "createdBy", select: "firstName lastName email photoUrl" },
            ])

        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Task fetched successfully.",
            task
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── PUT  /api/task/:id ───────────────────── */
async function updateTask(req, res) {
    try {
        const { id } = req.params;
        const { details, isCompleted, completion } = req.body;

        // Reject any attempts to update project, department, or kpi
        if (req.body.project || req.body.department || req.body.kpi) {
            return res.status(400).json({ error: "Cannot update project, department, or kpi fields after task creation." });
        }

        // Find the existing task
        const task = await Task.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!task) {
            return res.status(404).json({ error: "Task not found." });
        }

        // Update allowed fields
        if (details !== undefined) task.details = details.trim();
        if (typeof isCompleted === "boolean") {
            task.isCompleted = isCompleted;
            if (isCompleted && !task.completeAt) {
                task.completeAt = new Date();
            }
        }

        if (completion !== undefined) {
            if (typeof completion !== "number" || completion < 0 || completion > 100) {
                return res.status(400).json({ error: "Completion must be a number between 0 and 100." });
            }
            task.completion = completion;
            if (completion === 100) {
                task.isCompleted = true;
                task.completeAt = new Date();
            }
        }

        await task.save();

        return res.status(200).json({
            message: "Task updated successfully",
            task
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error", detail: err.message });
    }
}

/* ───────────────────── DELETE  /api/task/:id ───────────────────── */
async function softDeleteTask(req, res) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid or missing task ID." });
        }

        const task = await Task.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found or already deleted." });
        }

        task.isDeleted = true;
        task.deletedAt = Time.toJSDate(Time.now());
        await task.save();

        return res.status(200).json({
            success: true,
            message: "Task soft deleted successfully.",
            task
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── DELETE  /api/task/hard/:id ───────────────────── */
async function hardDeleteTask(req, res) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid or missing task ID." });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found." });
        }

        await Task.deleteOne({ _id: id });

        return res.status(200).json({
            success: true,
            message: "Task hard deleted successfully."
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/task/employee/:id ───────────────────── */
async function getTasksForEmployee(req, res) {
  try {
    const employeeId = req.params.id;
    const { projectId, page = 1, limit = 10 } = req.query;

    // Step 1: Find all task IDs assigned to the employee
    const assignmentFilter = {
      employee: employeeId,
      isDeleted: false,
    };
    const assignments = await TaskAssignment.find(assignmentFilter)
      .populate("assignedBy", "firstName lastName email photoUrl")
      .populate("employee", "firstName lastName email photoUrl")
      .select("tasks assignedBy")
      .lean();

    // Flatten all task IDs
    const taskIds = assignments.flatMap(a => a.tasks);

    if (taskIds.length === 0) {
      return res.status(200).json({ tasks: [], totalTasks: 0, page: 1, totalPages: 1 });
    }

    // Step 2: Query tasks by IDs
    const taskQuery = {
      _id: { $in: taskIds },
      isDeleted: false,
    };

    if (projectId) {
      taskQuery.project = projectId;
    }

    const totalTasks = await Task.countDocuments(taskQuery);

    const tasks = await Task.find(taskQuery)
      .populate("kpi")
      .populate("department", "name description")
      .populate("project", "name description")
      .populate("createdBy", "firstName lastName email photoUrl")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Map for quick assignment lookup: taskId -> assignedBy
    const taskIdToAssignedBy = {};
    assignments.forEach(assignment => {
      assignment.tasks.forEach(taskId => {
        taskIdToAssignedBy[String(taskId)] = assignment.assignedBy;
      });
    });

    // Add assignedBy's full name and email to each task
    const tasksWithAssigner = tasks.map(task => {
      const assignedBy = taskIdToAssignedBy[String(task._id)];
      return {
        ...task,
        assignedBy: assignedBy
          ? {
              firstName: assignedBy.firstName,
              lastName: assignedBy.lastName,
              email: assignedBy.email || ""
            }
          : null
      };
    });

    return res.status(200).json({
      tasks: tasksWithAssigner,
      totalTasks,
      page: parseInt(page),
      totalPages: Math.ceil(totalTasks / limit),
    });
  } catch (err) {
    console.error("Error fetching tasks for employee:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

/* ───────────────────── GET /api/task/all ───────────────────── */
async function getTasksForAll(req, res) {
  try {
    let { employeeId, projectId, departmentHeadId, managerId, page = 1, limit = 100000000 } = req.query;

      // Support multiple employeeId/projectId (comma-separated or array)
      let employeeIds = [];
      let projectIds = [];

      // If departmentHeadId is provided, filter projects by departmentHead
      if (departmentHeadId) {
          const projectsWithHead = await Project.find({
              "departments.departmentHeads": departmentHeadId,
              isDeleted: { $ne: true }
          }).select("_id");
          if (!projectsWithHead.length) {
              return res.status(200).json({ tasks: [], totalTasks: 0, page: 1, totalPages: 1 });
          }
          projectIds = projectsWithHead.map(p => p._id.toString());
      } else if (managerId) {
          // If managerId is provided, filter projects by manager
          const projectsWithManager = await Project.find({
              managers: managerId,
              isDeleted: { $ne: true }
          }).select("_id");
          if (!projectsWithManager.length) {
              return res.status(200).json({ tasks: [], totalTasks: 0, page: 1, totalPages: 1 });
          }
          projectIds = projectsWithManager.map(p => p._id.toString());
      }

    if (employeeId) {
      if (Array.isArray(employeeId)) {
        employeeIds = employeeId;
      } else if (typeof employeeId === "string") {
        employeeIds = employeeId.split(",").map(id => id.trim()).filter(Boolean);
      }
    }
    if (projectId) {
      if (Array.isArray(projectId)) {
        projectIds = projectId;
      } else if (typeof projectId === "string") {
        projectIds = projectId.split(",").map(id => id.trim()).filter(Boolean);
      }
    }


    // Step 1: Find all task assignments (optionally filtered by employees/projects)
    const assignmentFilter = { isDeleted: false };
    if (employeeIds.length) {
      assignmentFilter.employee = { $in: employeeIds };
    }
    if (projectIds.length) {
      assignmentFilter.project = { $in: projectIds };
    }

    const assignments = await TaskAssignment.find(assignmentFilter)
      .populate("assignedBy", "firstName lastName email photoUrl")
      .populate("employee", "firstName lastName email photoUrl")
      .select("tasks assignedBy employee")
      .lean();

    // Flatten all task IDs
    const taskIds = assignments.flatMap(a => a.tasks);

    if (taskIds.length === 0) {
      return res.status(200).json({ tasks: [], totalTasks: 0, page: 1, totalPages: 1 });
    }

    // Step 2: Query tasks by IDs (optionally filter by projectIds)
    const taskQuery = {
      _id: { $in: taskIds },
      isDeleted: false,
    };
    if (projectIds.length) {
      taskQuery.project = { $in: projectIds };
    }

    const totalTasks = await Task.countDocuments(taskQuery);

    const tasks = await Task.find(taskQuery)
      .populate("kpi")
      .populate("department", "name description")
      .populate("project", "name description")
      .populate("createdBy", "firstName lastName email photoUrl")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Build a map: taskId -> array of { employee, assignedBy }
    const taskIdToEmployees = {};
    assignments.forEach(assignment => {
      (assignment.tasks || []).forEach(taskId => {
        const tid = String(taskId);
        if (!taskIdToEmployees[tid]) taskIdToEmployees[tid] = [];
        taskIdToEmployees[tid].push({
          employee: assignment.employee,
          assignedBy: assignment.assignedBy
        });
      });
    });

    // For each task, add assignedEmployees: [{ employee, assignedBy }]
    const tasksWithEmployees = tasks.map(task => {
      const assigned = taskIdToEmployees[String(task._id)] || [];
      return {
        ...task,
        assignedEmployees: assigned.map(a => ({
          employee: a.employee,
          assignedBy: a.assignedBy
        }))
      };
    });

    return res.status(200).json({
      tasks: tasksWithEmployees,
      totalTasks,
      page: parseInt(page),
      totalPages: Math.ceil(totalTasks / limit),
    });
  } catch (err) {
    console.error("Error fetching tasks for employee:", err);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
};

/* ───────────────────── GET /api/task/department-head/:id ───────────────────── */
async function getTasksForDepartmentHead(req, res) {
    try {
        const headId = req.params.id;
        if (!headId || !mongoose.Types.ObjectId.isValid(headId)) {
            return res.status(400).json({ success: false, message: "Invalid department head ID." });
        }

        // Get departments where this employee is departmentHead in any project
        const projectsWithDept = await Project.find({
            "departments.departmentHeads": headId,
            isDeleted: { $ne: true }
        }).select("_id").lean();

        if (!projectsWithDept.length) {
            return res.status(200).json({
                success: true,
                message: "No tasks found for this department.",
                tasks: [],
                pagination: { totalDocs: 0, page, limit }
            });
        }

        const projectIds = projectsWithDept.map(p => p._id);

        // Pagination
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;

        // Build query
        const taskQuery = await buildTaskQuery({ ...req.query });
        taskQuery.project = { $in: projectIds };
        taskQuery.parentTask = null;

        const total = await Task.countDocuments(taskQuery);
        const tasks = await Task.find(taskQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate([
                { path: "project", select: "name description" },
                { path: "department", select: "name description" },
                { path: "kpi" },
                { path: "createdBy", select: "firstName lastName email" },
            ])
            .lean();

        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully.",
            tasks,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit })
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/task/department/:id ───────────────────── */
async function getTasksForDepartment(req, res) {
    try {
        const departmentId = req.params.id;
        if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({ success: false, message: "Invalid department ID." });
        }

        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;

        // 1. Find projects that include this departmentId in their departments array
        const projectsWithDept = await Project.find({
            "departments.department": departmentId,
            isDeleted: { $ne: true }
        }).select("_id").lean();

        if (!projectsWithDept.length) {
            return res.status(200).json({
                success: true,
                message: "No tasks found for this department.",
                tasks: [],
                pagination: { totalDocs: 0, page, limit }
            });
        }

        const projectIds = projectsWithDept.map(p => p._id);

        // 2. Build task query
        const taskQuery = await buildTaskQuery({ ...req.query });
        taskQuery.project = { $in: projectIds };
        taskQuery.parentTask = null;

        // 3. Count total tasks matching the query
        const total = await Task.countDocuments(taskQuery);

        // 4. Fetch tasks with pagination and populate
        const tasks = await Task.find(taskQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate([
                { path: "project", select: "name description" },
                { path: "department", select: "name description" },
                { path: "kpi" },
                { path: "createdBy", select: "firstName lastName email" },
            ])
            .lean();

        // 5. Return response with tasks and pagination info
        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully.",
            tasks,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/task/project-manager/:id ───────────────────── */
async function getTasksForProjectManager(req, res) {
    try {
        const managerId = req.params.id;
        if (!managerId || !mongoose.Types.ObjectId.isValid(managerId)) {
            return res.status(400).json({ success: false, message: "Invalid manager ID." });
        }

        // Pagination
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
        const skip = (page - 1) * limit;

        // Find all projects for this manager
        const projects = await Project.find({ manager: managerId, isDeleted: { $ne: true } }).select("_id");
        if (!projects.length) {
            return res.status(200).json({ success: true, message: "No tasks found.", total: 0, page, limit, tasks: [] });
        }
        const projectIds = projects.map(p => p._id);

        // Build filter/search query
        const taskQuery = await buildTaskQuery({ ...req.query });
        taskQuery.project = { $in: projectIds };

        // Get tasks
        const total = await Task.countDocuments(taskQuery);
        const tasks = await Task.find(taskQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate([
                { path: "project", select: "name description" },
                { path: "department", select: "name description" },
                { path: "kpi" },
                { path: "createdBy", select: "firstName lastName email" },
            ])
            .lean();

        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully.",
            tasks,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit })
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET  /api/task/project/:id ───────────────────── */
async function getAllTasksByProject(req, res) {
    try {
        const projectId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        // Find parent tasks (tasks with no parentTask) for this project
        const parentTasks = await Task.find({
            project: projectId,
            parentTask: null,
            isDeleted: { $ne: true }
        }).populate([
            { path: "project", select: "name description" },
            { path: "department", select: "name description" },
            { path: "kpi" },
            { path: "createdBy", select: "firstName lastName email" },
        ])
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Tasks fetched successfully",
            tasks: parentTasks
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── Put  /api/task/status ───────────────────── */
const VALID_STATUSES = ["To Do", "In Progress", "Completed", "In Review"];
const VALID_UNITS = ["minutes", "hours", "days", "weeks"];

const updateTaskStatus = async (req, res) => {
  try {
    const { taskId, status, completion, completionTime } = req.body;

    if (!taskId || !status) {
      return res.status(400).json({ message: "taskId and status are required." });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status value." });
    }

    // Validate when status is "In Review"
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
    }

    const update = {
      status,
    };

    if (status === "In Review") {
      update.completion = completion;
      update.completionTime = completionTime;
      update.completedAt = Time.toJSDate(Time.now());
    }

    // Update completion timestamp if task is completed
    if (status === "Completed") {
      update.completion = completion;
      update.completionTime = completionTime;
      update.isCompleted = true;
    }

    // Update the task
    const task = await Task.findByIdAndUpdate(taskId, update, { new: true });

    if (!task) {
      return res.status(404).json({ message: "Task not found." });
    }

    // If status is Completed, check if all tasks in the project are completed
    if (status === "Completed" && task.project) {
      const totalTasks = await Task.countDocuments({ project: task.project, isDeleted: { $ne: true } });
      const completedTasks = await Task.countDocuments({ project: task.project, isDeleted: { $ne: true }, isCompleted: true });

      if (totalTasks > 0 && totalTasks === completedTasks) {
        // All tasks completed, update project status
        await Project.findByIdAndUpdate(task.project, { status: "Completed", endDate: new Date() });
      }
    }

    res.status(200).json({ message: "Task status updated.", task });
  } catch (err) {
    console.error("Error updating task status:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

/* ───────────────────── Put  /api/task/assign ───────────────────── */
async function assignEmployeeToTask(req, res) {
    try {
        const { taskIds, employeeId, assignedBy } = req.body;

        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ success: false, message: "taskIds must be a non-empty array." });
        }
        if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID." });
        }

        const employee = await Employee.findOne({ _id: employeeId, isDeleted: { $ne: true } });
        if (!employee) {
            return res.status(404).json({ success: false, message: "Employee not found." });
        }
        if (!employee.department) {
            return res.status(400).json({ success: false, message: "Employee does not belong to any department." });
        }

        const tasks = await Task.find({ _id: { $in: taskIds }, isDeleted: { $ne: true } });
        if (tasks.length !== taskIds.length) {
            return res.status(404).json({ success: false, message: "One or more tasks not found." });
        }
        for (const task of tasks) {
            if (task.department.toString() !== employee.department.toString()) {
                return res.status(400).json({
                    success: false,
                    message: `Task (${task._id}) does not belong to employee's department (${employee.department}).`
                });
            }
        }

        const existingAssignments = await TaskAssignment.find({ employee: employeeId, isDeleted: { $ne: true } });
        const alreadyAssignedTaskIds = new Set();
        existingAssignments.forEach(assign => {
            (assign.tasks || []).forEach(tid => alreadyAssignedTaskIds.add(tid.toString()));
        });

        const toAssign = taskIds.filter(
            tid => !alreadyAssignedTaskIds.has(tid.toString())
        );
        const skipped = taskIds.filter(
            tid => alreadyAssignedTaskIds.has(tid.toString())
        );

        let assignment = null;
        if (toAssign.length > 0) {
            assignment = new TaskAssignment({
                tasks: toAssign,
                employee: employeeId,
                assignedBy,
                assignedAt: Time.toJSDate(Time.now())
            });
            await assignment.save();

            // --- Project employee inclusion logic ---
            // Get project from first task (they should all be same if your data model is correct)
            const projectId = tasks[0].project;
            const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } });
            if (project) {
                const alreadyInProject = (project.employees || []).some(
                    emp =>
                        (typeof emp === "object" && emp.employee
                            ? emp.employee.toString()
                            : emp.toString()) === employeeId.toString()
                );
                if (!alreadyInProject) {
                    project.employees.push({
                        employee: employeeId,
                        assignedBy,
                        assignedAt: Time.toJSDate(Time.now())
                    });
                    await project.save();
                }
            }
        }

        return res.status(201).json({
            success: true,
            message: toAssign.length > 0 ? "Employee assigned to new task(s)." : "Employee already assigned to all provided tasks.",
            assigned: toAssign,
            skipped,
            assignment
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
}

/* ───────────────────── Post  /api/task/bulk-assign ───────────────────── */
async function bulkAssignEmployeesToTasks(req, res) {
  try {
    const { projectId, assignedBy, assignmentsData } = req.body;

    if (!Array.isArray(assignmentsData) || assignmentsData.length === 0) {
      return res.status(400).json({ success: false, message: "Input must be a non-empty array." });
    }

    if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }
    
    if (!assignedBy) {
      return res.status(400).json({ success: false, message: "assignedBy is required." });
    }

    const results = [];

    for (const assignInput of assignmentsData) {
      const { taskIds, employeeId } = assignInput;

      // Basic input validation
      if (!Array.isArray(taskIds) || !employeeId) {
        results.push({ employeeId, assigned: [], skipped: [], error: "Missing or invalid fields." });
        continue;
      }

      // Find employee
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        results.push({ employeeId, assigned: [], skipped: [], error: "Employee not found." });
        continue;
      }

      // Find tasks
      const tasks = await Task.find({ _id: { $in: taskIds }, isDeleted: { $ne: true } });
      if (tasks.length !== taskIds.length) {
        results.push({ employeeId, assigned: [], skipped: [], error: "One or more tasks not found." });
        continue;
      }

      // Validate all tasks belong to the same department as the employee
    //   const invalidDeptTask = tasks.find(task => task.department.toString() !== employee.department.toString());
    //   if (invalidDeptTask) {
    //     results.push({ employeeId, assigned: [], skipped: [], error: `Task (${invalidDeptTask._id}) does not belong to employee's department.` });
    //     continue;
    //   }

      // Validate all tasks belong to the specified project
      const invalidProjectTask = tasks.find(task => task.project.toString() !== projectId.toString());
      if (invalidProjectTask) {
        results.push({ employeeId, assigned: [], skipped: [], error: `Task (${invalidProjectTask._id}) does not belong to the specified project.` });
        continue;
      }

      // Find or create assignment for this employee & project
      let assignment = await TaskAssignment.findOne({ employee: employeeId, project: projectId, isDeleted: { $ne: true } });

      if (assignment) {
        // Update: Set tasks exactly to taskIds
        const previousTaskIds = assignment.tasks.map(tid => tid.toString());
        const newTaskIds = taskIds.map(tid => tid.toString());

        assignment.tasks = newTaskIds;
        assignment.assignedBy = assignedBy; // Use top-level assignedBy
        await assignment.save();

        // Determine what changed (optional)
        const assigned = newTaskIds.filter(id => !previousTaskIds.includes(id));
        const removed = previousTaskIds.filter(id => !newTaskIds.includes(id));
        results.push({
          employeeId,
          assigned,
          removed,
          error: null,
          assignment
        });
      } else if (taskIds.length > 0) {
        // Create new assignment
        assignment = new TaskAssignment({
          project: projectId,
          tasks: taskIds,
          employee: employeeId,
          department: tasks[0]?.department,
          assignedBy,
          assignedAt: Time.toJSDate(Time.now())
        });
        await assignment.save();
        results.push({
          employeeId,
          assigned: taskIds,
          removed: [],
          error: null,
          assignment
        });
      } else {
        // Nothing to assign, and no existing assignment
        results.push({
          employeeId,
          assigned: [],
          removed: [],
          error: null,
          assignment: null
        });
      }

      // Project logic: add employee to project's employees list if not already there
      const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } });
      if (project) {
        const alreadyInProject = (project.employees || []).some(
          emp =>
            (typeof emp === "object" && emp.employee
              ? emp.employee.toString()
              : emp.toString()) === employeeId.toString()
        );
        if (!alreadyInProject) {
          project.employees.push({
            employee: employeeId,
            assignedBy,
            assignedAt: Time.toJSDate(Time.now())
          });
          await project.save();
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "Bulk assignment complete.",
      results
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
}

/* ───────────────────── Put  /api/task/terminate ───────────────────── */
async function terminateEmployeeFromTask(req, res) {
    try {
        let { taskIds, employeeId } = req.body;

        // Validate IDs
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ success: false, message: "taskIds must be a non-empty array." });
        }
        if (!employeeId || !mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID." });
        }
        taskIds = taskIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (taskIds.length === 0) {
            return res.status(400).json({ success: false, message: "No valid task IDs provided." });
        }

        // Find all relevant assignments
        const assignments = await TaskAssignment.find({ employee: employeeId, tasks: { $in: taskIds }, isDeleted: { $ne: true } });
        if (assignments.length === 0) {
            return res.status(400).json({ success: false, message: "Employee is not assigned to any of these tasks." });
        }

        // Track affected projects for possible employee removal
        const affectedProjectIds = new Set();

        // Remove taskIds from assignments, delete empty ones
        for (const assignment of assignments) {
            const originalLength = assignment.tasks.length;
            assignment.tasks = assignment.tasks.filter(tid => !taskIds.includes(tid.toString()));
            if (assignment.tasks.length === 0) {
                assignment.isDeleted = true;
                assignment.deletedAt = new Date();
                await assignment.save();
            } else if (assignment.tasks.length < originalLength) {
                await assignment.save();
            }
            // Collect project IDs from affected tasks
            const tasksInAssignment = await Task.find({ _id: { $in: assignment.tasks }, isDeleted: { $ne: true } });
            tasksInAssignment.forEach(task => {
                if (task.project) affectedProjectIds.add(task.project.toString());
            });
        }

        // For each affected project, remove employee if no more assignments exist in that project
        for (const projectId of affectedProjectIds) {
            // Are there any remaining assignments for this employee in this project?
            const remainingAssignments = await TaskAssignment.find({ employee: employeeId, isDeleted: { $ne: true } }).populate("tasks");
            const hasOtherProjectTasks = remainingAssignments.some(assign =>
                assign.tasks.some(t => t.project && t.project.toString() === projectId)
            );
            if (!hasOtherProjectTasks) {
                // Remove employee from project.employees
                const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } });
                if (project) {
                    project.employees = project.employees.filter(emp =>
                        (typeof emp === "object" && emp.employee
                            ? emp.employee.toString()
                            : emp.toString()) !== employeeId.toString()
                    );
                    await project.save();
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Employee terminated from provided tasks successfully."
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server Error", error: error.message });
    }
}

/* ───────────────────── Post  /api/task/bulkTasks ───────────────────── */
async function bulkCreateTasks(req, res) {
    try {
        const { projectId, createdBy } = req.body;
        const taskData = req.body.data;

        if (!Array.isArray(taskData)) {
            return res.status(400).json({ error: "Data must be an array." });
        }
        if (!projectId) {
            return res.status(400).json({ error: "projectId is required." });
        }
        if (!createdBy) {
            return res.status(400).json({ error: "createdBy (employeeId) is required." });
        }

        // Fetch the project with departments
        const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } });
        if (!project) {
            return res.status(404).json({ error: "Project not found." });
        }
        
        const projectDepartmentIds = project.isProjectBasedKpi ? project.projectKpi.map(kpi => kpi.department.toString()) : project.departments.map(dep =>
            (typeof dep === 'object' && dep.department) ? dep.department.toString() : dep.toString()
        );

        let tasksToInsert = [];

        for (const deptBlock of taskData) {
            const { departmentId, criteria } = deptBlock;
            if (!departmentId) continue;

            // Validate departmentId belongs to project
            if (!projectDepartmentIds.includes(departmentId)) {
                return res.status(400).json({ error: `Department (${departmentId}) does not belong to project.` });
            }

            // Fetch the department with its kpiCriteria
            const department = project.isProjectBasedKpi ? project.projectKpi.find(kpi => kpi.department.toString() === departmentId) : await Department.findOne({ _id: departmentId, isDeleted: { $ne: true } });
            if (!department) {
                return res.status(404).json({ error: `Department (${departmentId}) not found.` });
            }

            const departmentKpiIds = (department.kpiCriteria || []).map(kpiObj =>
                (typeof kpiObj === 'object' && kpiObj.kpi) ? kpiObj.kpi.toString() : kpiObj.toString()
            );

            for (const kpiGroup of criteria) {
                const { kpi, details } = kpiGroup;
                if (!kpi || !Array.isArray(details)) continue;

                // Validate kpi belongs to department
                if (!departmentKpiIds.includes(kpi)) {
                    return res.status(400).json({ error: `KPI (${kpi}) does not belong to department (${departmentId}).` });
                }

                for (const detail of details) {
                    if (!detail || typeof detail !== "string" || !detail.trim()) continue;
                    tasksToInsert.push({
                        details: detail.trim(),
                        kpi,
                        department: departmentId,
                        project: projectId,
                        createdBy
                    });
                }
            }
        }

        if (tasksToInsert.length === 0) {
            return res.status(400).json({ error: "No valid tasks found to create." });
        }

        const createdTasks = await Task.insertMany(tasksToInsert);

        return res.status(201).json({
            success: true,
            message: "Tasks created successfully",
            count: createdTasks.length,
            tasks: createdTasks
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error", detail: err.message });
    }
};

/* ───────────────────── Put  /api/task/bulkTasks ───────────────────── */
async function bulkUpdateTasks(req, res) {
    try {
        const { projectId, oldTasks, newTasks, deleteTasks, createdBy } = req.body;
        const updatedTasks = [];
        const createdTasks = [];
        const deletedTasks = [];

        if (!projectId) {
            return res.status(400).json({ error: "projectId is required." });
        }

        // 1. Validate project
        const project = await Project.findOne({ _id: projectId, isDeleted: { $ne: true } });
        if (!project) {
            return res.status(404).json({ error: "Project not found." });
        }

        // 2. Update old tasks
        if (Array.isArray(oldTasks) && oldTasks.length) {
            for (const t of oldTasks) {
                if (!t._id) continue;
                const updated = await Task.findOneAndUpdate(
                    { _id: t._id, project: projectId, isDeleted: false },
                    {
                        details: t.details,
                        kpi: t.kpi,
                        department: t.department
                        // Add more fields if needed
                    },
                    { new: true }
                );
                if (updated) updatedTasks.push(updated);
            }
        }

        // 3. Create new tasks
        if (Array.isArray(newTasks) && newTasks.length) {
            let newTaskDocs = [];
            for (const nt of newTasks) {
                if (!nt.details || !nt.kpiId || !nt.department) continue;
                newTaskDocs.push({
                    details: nt.details.trim(),
                    kpi: nt.kpiId,
                    department: nt.department,
                    project: projectId,
                    createdBy
                });
            }
            if (newTaskDocs.length) {
                const created = await Task.insertMany(newTaskDocs);
                createdTasks.push(...created);
            }
        }

        // 4. SOFT DELETE tasks & remove from assignments
        if (Array.isArray(deleteTasks) && deleteTasks.length) {
            // Soft delete all
            await Task.updateMany(
                { _id: { $in: deleteTasks }, project: projectId, isDeleted: false },
                { isDeleted: true, deletedAt: new Date() }
            );

            // Remove tasks from all assignments
            await TaskAssignment.updateMany(
                { tasks: { $in: deleteTasks } },
                { $pull: { tasks: { $in: deleteTasks } } }
            );

            deletedTasks.push(...deleteTasks);
        }

        return res.status(200).json({
            success: true,
            message: "Bulk update completed.",
            updatedCount: updatedTasks.length,
            createdCount: createdTasks.length,
            deletedCount: deletedTasks.length,
            updatedTasks,
            createdTasks,
            deletedTasks
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server error", detail: err.message });
    }
}


module.exports = {
    createTask,
    getAllTasks,
    getSingleTask,
    updateTask,
    softDeleteTask,
    hardDeleteTask,
    getTasksForEmployee,
    getTasksForAll,
    getTasksForDepartmentHead,
    getTasksForDepartment,
    getTasksForProjectManager,
    getAllTasksByProject,
    updateTaskStatus,
    assignEmployeeToTask,
    terminateEmployeeFromTask,
    bulkCreateTasks,
    bulkUpdateTasks,
    bulkAssignEmployeesToTasks,
};
