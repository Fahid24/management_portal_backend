const mongoose = require("mongoose");
const Project = require("../model/projectSchema");
const Department = require("../model/departmentSchema");
const Employee = require("../model/employeeSchema");
const Task = require("../model/taskSchema");
const TaskAssignment = require("../model/taskAssignmentSchema");
const Kpi = require("../model/kpiSchema");
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

/* ──────────────────────────────── Validate Date Function ──────────────────────────────── */
function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}

/* ──────────────────────── Calculate Project Status Distribution ──────────────────────── */
const STATUSES = ["Completed", "InProgress", "NotStarted", "Blocked", "Cancelled"];

async function calculateProjectStatusDistribution(projectId) {
    if (!projectId) throw new Error("Project ID is required");

    // 1. Fetch all top-level tasks (parentTask == null)
    const topTasks = await Task.find({
        project: projectId,
        parentTask: null,
        isDeleted: { $ne: true }
    }).lean();

    if (topTasks.length === 0) {
        // No tasks = 0% for all statuses
        return STATUSES.reduce((acc, status) => {
            acc[status] = 0;
            return acc;
        }, {});
    }

    // Recursive function to flatten tasks and calculate their weight in project %
    async function flattenTasks(task, weight) {
        const subtasks = await Task.find({
            parentTask: task._id,
            isDeleted: { $ne: true }
        }).lean();

        if (subtasks.length === 0) {
            // Leaf task: return an array with task status and weight
            return [{ status: task.status || "NotStarted", weight }];
        }

        // Has subtasks: divide weight equally among them
        const subtaskWeight = weight / subtasks.length;
        let results = [];
        for (const subtask of subtasks) {
            const subResults = await flattenTasks(subtask, subtaskWeight);
            results = results.concat(subResults);
        }
        return results;
    }

    // 2. Flatten all tasks into array of { status, weight }
    let allTasksWeighted = [];
    const taskWeight = 100 / topTasks.length;

    for (const task of topTasks) {
        const flattened = await flattenTasks(task, taskWeight);
        allTasksWeighted = allTasksWeighted.concat(flattened);
    }

    // 3. Sum weights by status
    const statusDistribution = STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
    }, {});

    for (const { status, weight } of allTasksWeighted) {
        if (statusDistribution.hasOwnProperty(status)) {
            statusDistribution[status] += weight;
        } else {
            // If status unknown, count as NotStarted (or ignore)
            statusDistribution["NotStarted"] += weight;
        }
    }

    // 4. Round values and ensure total sums to 100%
    // Optional: normalize to exactly 100 due to rounding errors
    const total = Object.values(statusDistribution).reduce((a, b) => a + b, 0);
    if (total !== 100 && total > 0) {
        for (const key in statusDistribution) {
            statusDistribution[key] = +(statusDistribution[key] / total * 100).toFixed(2);
        }
    } else {
        // Round normally
        for (const key in statusDistribution) {
            statusDistribution[key] = Math.round(statusDistribution[key]);
        }
    }

    return statusDistribution;
}

/* ───────────────────── Post  /api/project ───────────────────── */
async function createProject(req, res) {
    try {
        const {
            name,
            description,
            managers,
            departments,
            startDate,
            dueDate,
            remarks,
        } = req.body;

        if (!name || typeof name !== "string") {
            return res.status(400).json({ success: false, message: "Project name is required." });
        }
        if (!Array.isArray(departments) || departments.length === 0) {
            return res.status(400).json({ success: false, message: "At least one department is required." });
        }
        // if (!Array.isArray(managers) || managers.length === 0) {
        //     return res.status(400).json({ success: false, message: "At least one manager is required." });
        // }

        // === VALIDATE AND CONVERT DATES ===
        let newStartDate = null;
        let newDueDate = null;

        if (startDate) {
            const dt = Time.fromISO(startDate);
            if (!dt.isValid) return res.status(400).json({ success: false, message: "Invalid startDate." });
            newStartDate = Time.toJSDate(dt);
        }

        if (dueDate) {
            const dt = Time.fromISO(dueDate);
            if (!dt.isValid) return res.status(400).json({ success: false, message: "Invalid dueDate." });
            newDueDate = Time.toJSDate(dt);
        }

        if (newStartDate && newDueDate && newStartDate > newDueDate) {
            return res.status(400).json({ success: false, message: "startDate cannot be later than dueDate." });
        }

        // === VALIDATE DEPARTMENTS ===
        const deptDocs = await Department.find({ _id: { $in: departments } });
        if (deptDocs.length !== departments.length) {
            return res.status(400).json({ success: false, message: "One or more departments not found." });
        }

        const departmentBlocks = [];
        const departmentManagers = [];

        for (const dept of deptDocs) {
            if (!dept.departmentHeads.length) {
                return res.status(400).json({ success: false, message: `Department ${dept.name} must have a department head.` });
            }
            if (!dept.kpiCriteria || !Array.isArray(dept.kpiCriteria) || dept.kpiCriteria.length === 0) {
                return res.status(400).json({ success: false, message: `Department ${dept.name} must have at least one KPI criteria.` });
            }
            departmentBlocks.push({
                department: dept._id,
                departmentHeads: dept.departmentHeads,
                kpiCriteria: dept.kpiCriteria,
            });
            departmentManagers.push(...(dept.projectManagers || []).map(id => id.toString()));
        }

        if (managers?.length > 0) {
          for (const managerId of managers) {
            if (!mongoose.Types.ObjectId.isValid(managerId)) {
              return res.status(400).json({
                success: false,
                message: `Invalid manager ID: ${managerId}`,
              });
            }
            if (!departmentManagers.includes(managerId.toString())) {
              return res.status(400).json({
                success: false,
                message: `Manager with ID ${managerId} is not a project manager for any of the selected departments.`,
              });
            }
            const manager = await Employee.findById(managerId);
            if (!manager) {
              return res.status(400).json({
                success: false,
                message: `Manager with ID ${managerId} not found.`,
              });
            }
          }
        }

        if (remarks && remarks.length > 0) {
            for (const rem of remarks) {
                if (!rem.remarkedBy || !rem.remark) {
                    return res.status(400).json({ success: false, message: "Each remark must have 'remarkedBy' and 'remark'." });
                }
                const empExists = await Employee.exists({ _id: rem.remarkedBy });
                if (!empExists) {
                    return res.status(400).json({ success: false, message: `Remarked by employee (${rem.remarkedBy}) not found.` });
                }
            }
        }

        const projectObj = {
            name,
            description,
            status: "InProgress",
            startDate: newStartDate,
            dueDate: newDueDate,
            managers,
            departments: departmentBlocks,
            employees: [],
            remarks: remarks || [],
            isDeleted: false,
            deletedAt: null,
        };

        const project = await Project.create(projectObj);

        return res.status(201).json({
            success: true,
            message: "Project created successfully.",
            project,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET  /api/project ───────────────────── */
function normalizeDateRange(from, to) {
    const range = {};
    if (from) {
        const fromDT = Time.fromISO(from).startOf("day");
        if (Time.isValidDateTime(fromDT)) {
            range.$gte = Time.toJSDate(fromDT);
        }
    }
    if (to) {
        const toDT = Time.fromISO(to).endOf("day");
        if (Time.isValidDateTime(toDT)) {
            range.$lte = Time.toJSDate(toDT);
        }
    }
    return range;
}




async function getAllProjects(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const {
            search,
            status,
            employeeId,
            startDateFrom,
            startDateTo,
            dueDateFrom,
            dueDateTo,
            endDateFrom,
            endDateTo,
            departmentHead
        } = req.query;

        let projectQuery = { isDeleted: false };

        // --- Status Filter ---
        if (status) {
            const statuses = status.split(",");
            projectQuery.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
        }

        // --- Date Filters (PST to UTC via Luxon) ---
        if (startDateFrom || startDateTo) {
            projectQuery.startDate = normalizeDateRange(startDateFrom, startDateTo);
        }
        if (dueDateFrom || dueDateTo) {
            projectQuery.dueDate = normalizeDateRange(dueDateFrom, dueDateTo);
        }
        if (endDateFrom || endDateTo) {
            projectQuery.endDate = normalizeDateRange(endDateFrom, endDateTo);
        }

        // --- Search by name or manager ---
        if (search) {
            const managerIds = await Employee.find({
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                    { firstName: { $regex: search, $options: "i" } },
                    { lastName: { $regex: search, $options: "i" } },
                ],
            }).distinct("_id");

            projectQuery.$or = [
                { name: { $regex: search, $options: "i" } },
                ...(managerIds.length ? [{ managers: { $in: managerIds } }] : []),
            ];
        }

        // --- Filter by assigned employee ---
        if (employeeId) {
            projectQuery["employees.employee"] = employeeId;
        }

        // --- Filter by department head ---
        if (departmentHead) {
            projectQuery["departments.departmentHeads"] = departmentHead;
        }

        // --- Count total
        const total = await Project.countDocuments(projectQuery);

        // --- Fetch projects
        let projects = await Project.find(projectQuery)
            .populate("managers", "firstName lastName photoUrl email role")
            .populate("departments.department", "name description")
            .populate("departments.departmentHeads", "firstName lastName photoUrl email role")
            .populate("employees.employee", "firstName lastName photoUrl email role")
            .populate("employees.assignedBy", "firstName lastName photoUrl email role")
            .populate("remarks.remarkedBy", "firstName lastName photoUrl email role")
            .populate("projectKpi.department", "name description")
            .populate("projectKpi.kpiCriteria.kpi", "criteria")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // --- Add project progress
        const projectsWithProgress = await Promise.all(
            projects.map(async (project) => {
                const progress = await calculateProjectStatusDistribution(project._id);
                return { ...project, progress };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Projects fetched successfully",
            projects: projectsWithProgress,
            pagination: buildPaginationMeta({
                totalDocs: total,
                page,
                limit,
            }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Server Error",
            error: err.message,
        });
    }
}

/* ───────────────────── GET  /api/project/:id ───────────────────── */
async function getProjectById(req, res) {
    try {
        const projectId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        const project = await Project.findById(projectId)
            .populate({
                path: "managers",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.department",
                select: "name description"
            })
            .populate({
                path: "departments.departmentHeads",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.kpiCriteria.kpi",
                select: "criteria"
            })
            .populate({
                path: "employees.employee",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.assignedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "remarks.remarkedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "projectKpi.department",
                select: "name description"
            })
            .populate({
                path: "projectKpi.kpiCriteria.kpi",
                select: "criteria"
            });

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        // Calculate project progress status distribution
        const progress = await calculateProjectStatusDistribution(projectId);

        return res.status(200).json({
            success: true,
            message: "Project fetched successfully",
            project,
            progress
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
};


/* ───────────────────── PUT  /api/project/:id ───────────────────── */
async function updateProject(req, res) {
    try {
        const projectId = req.params.id;
        const {
            name,
            description,
            status,
            startDate,
            dueDate,
            endDate,
            managers,
            departments,
            remarks,
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        if (departments) {
            if (!Array.isArray(departments) || departments.length === 0) {
                return res.status(400).json({ success: false, message: "Departments must be a non-empty array." });
            }

            const deptDocs = await Department.find({ _id: { $in: departments } });
            if (deptDocs.length !== departments.length) {
                return res.status(400).json({ success: false, message: "One or more departments not found." });
            }

            const departmentBlocks = [];

            for (const dept of deptDocs) {
                if (!dept.departmentHeads.length) {
                    return res.status(400).json({ success: false, message: `Department ${dept.name} must have a department head.` });
                }
                if (!dept.kpiCriteria || !Array.isArray(dept.kpiCriteria) || dept.kpiCriteria.length === 0) {
                    return res.status(400).json({ success: false, message: `Department ${dept.name} must have at least one KPI criteria.` });
                }

                departmentBlocks.push({
                    department: dept._id,
                    departmentHeads: dept.departmentHeads,
                    kpiCriteria: dept.kpiCriteria,
                });
            }

            project.departments = departmentBlocks;
        }

        if (managers?.length > 0) {
            if (!Array.isArray(managers) || managers.length === 0) {
                return res.status(400).json({ success: false, message: "Managers must be a non-empty array." });
            }

            const departmentIds = departments ? departments : project.departments.map(d => d.department.toString());
            const departmentDocs = await Department.find({ _id: { $in: departmentIds } });
            const departmentManagers = departmentDocs.flatMap(dept => dept.projectManagers || []).map(id => id.toString());

            const managerDocs = await Employee.find({ _id: { $in: managers } });
            if (managerDocs.length !== managers.length) {
                return res.status(400).json({ success: false, message: "One or more managers not found." });
            }

            for (const manager of managerDocs) {
                if (!departmentManagers.includes(manager._id.toString())) {
                    return res.status(400).json({ success: false, message: `Manager with ID ${manager._id} is not a project manager for any of the selected departments.` });
                }
            }

            project.managers = managers;
        }

        if (remarks) {
            if (!Array.isArray(remarks)) {
                return res.status(400).json({ success: false, message: "Remarks must be an array." });
            }

            for (const rem of remarks) {
                if (!rem.remarkedBy || !rem.remark) {
                    return res.status(400).json({ success: false, message: "Each remark must have 'remarkedBy' and 'remark'." });
                }

                const empExists = await Employee.exists({ _id: rem.remarkedBy });
                if (!empExists) {
                    return res.status(400).json({ success: false, message: `Remarked by employee (${rem.remarkedBy}) not found.` });
                }
            }

            project.remarks.push(...remarks);
        }

        let newStartDate, newDueDate, newEndDate;

        if (startDate) {
            const dt = Time.fromISO(startDate);
            if (!dt.isValid) {
                return res.status(400).json({ success: false, message: "Invalid startDate." });
            }
            newStartDate = Time.toJSDate(dt);
        }

        if (dueDate) {
            const dt = Time.fromISO(dueDate);
            if (!dt.isValid) {
                return res.status(400).json({ success: false, message: "Invalid dueDate." });
            }
            newDueDate = Time.toJSDate(dt);
        }

        if (newStartDate && newDueDate && newStartDate > newDueDate) {
            return res.status(400).json({ success: false, message: "startDate cannot be later than dueDate." });
        }

        if (typeof endDate !== "undefined" || endDate !== null) {
            if (endDate) {
                const dt = Time.fromISO(endDate);
                if (!dt.isValid) {
                    return res.status(400).json({ success: false, message: "Invalid endDate." });
                }
                newEndDate = Time.toJSDate(dt);
                if (newStartDate && newEndDate < newStartDate) {
                    return res.status(400).json({ success: false, message: "endDate cannot be earlier than startDate." });
                }
            } else {
                newEndDate = null;
            }
        }

        if (name) project.name = name;
        if (description) project.description = description;
        if (status) {
            const allowedStatuses = ["NotStarted", "InProgress", "Completed", "Reviewed", "OnHold", "Cancelled"];
            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({ success: false, message: "Invalid status value." });
            }
            project.status = status;
        }
        if (newStartDate) project.startDate = newStartDate;
        if (newDueDate) project.dueDate = newDueDate;
        if (typeof newEndDate !== "undefined" || newEndDate !== null) project.endDate = newEndDate;

        await project.save();

        return res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── DELETE  /api/project/:id ───────────────────── */
async function softDeleteProject(req, res) {
    try {
        const projectId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        const project = await Project.findById(projectId);
        if (!project || project.isDeleted) {
            return res.status(404).json({ success: false, message: "Project not found or already deleted." });
        }

        const now = Time.toJSDate(Time.now());

        project.isDeleted = true;
        project.deletedAt = now;
        await project.save();

        // Optionally, soft delete all related tasks
        await Task.updateMany({ project: projectId }, { isDeleted: true, deletedAt: now });

        return res.status(200).json({ success: true, message: "Project deleted successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
};

/* ───────────────────── DELETE  /api/project/hard/:id ───────────────────── */
async function hardDeleteProject(req, res) {
    try {
        const projectId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        const project = await Project.findByIdAndDelete(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        // Delete all related tasks
        await Task.deleteMany({ project: projectId });

        return res.status(200).json({ success: true, message: "Project hard deleted successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
};

/* ───────────────────── GET /api/project/employee/:id ───────────────────── */
async function getAllProjectsByEmployee(req, res) {
    try {
        const employeeId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ success: false, message: "Invalid employee ID." });
        }

        const query = {
            isDeleted: { $ne: true },
            "employees.employee": employeeId,
        };

        const total = await Project.countDocuments(query);

        let projects = await Project.find(query)
            .populate({
                path: "managers",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.department",
                select: "name description"
            })
            .populate({
                path: "departments.departmentHeads",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.employee",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.assignedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "remarks.remarkedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "projectKpi.department",
                select: "name description"
            })
            .populate({
                path: "projectKpi.kpiCriteria.kpi",
                select: "criteria"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(); // lean for faster access & modification

        // Add progress to each project concurrently
        const projectsWithProgress = await Promise.all(
            projects.map(async (project) => {
                const progress = await calculateProjectStatusDistribution(project._id);
                return { ...project, progress };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Projects fetched successfully.",
            projects: projectsWithProgress,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/project/department/:id ───────────────────── */
async function getAllProjectsByDepartment(req, res) {
    try {
        const departmentId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({ success: false, message: "Invalid department ID." });
        }

        const query = {
            isDeleted: { $ne: true },
            "departments.department": departmentId
        };

        const total = await Project.countDocuments(query);

        let projects = await Project.find(query)
            .populate({
                path: "managers",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.department",
                select: "name description"
            })
            .populate({
                path: "departments.departmentHeads",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.employee",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.assignedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "remarks.remarkedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "projectKpi.department",
                select: "name description"
            })
            .populate({
                path: "projectKpi.kpiCriteria.kpi",
                select: "criteria"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Add progress to each project concurrently
        const projectsWithProgress = await Promise.all(
            projects.map(async (project) => {
                const progress = await calculateProjectStatusDistribution(project._id);
                return { ...project, progress };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Projects fetched successfully.",
            projects: projectsWithProgress,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/project/department-head/:id ───────────────────── */
async function getAllProjectsByDepartmentHead(req, res) {
    try {
        const departmentHeadId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(departmentHeadId)) {
            return res.status(400).json({ success: false, message: "Invalid department head ID." });
        }

        const query = {
            isDeleted: { $ne: true },
            "departments.departmentHeads": departmentHeadId
        };

        const total = await Project.countDocuments(query);

        let projects = await Project.find(query)
            .populate({
                path: "managers",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.department",
                select: "name description"
            })
            .populate({
                path: "departments.departmentHeads",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.employee",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.assignedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "remarks.remarkedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "projectKpi.department",
                select: "name description"
            })
            .populate({
                path: "projectKpi.kpiCriteria.kpi",
                select: "criteria"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Add progress data to each project
        const projectsWithProgress = await Promise.all(
            projects.map(async (project) => {
                const progress = await calculateProjectStatusDistribution(project._id);
                return { ...project, progress };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Projects fetched successfully.",
            projects: projectsWithProgress,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/project/project-manager/:id ───────────────────── */
async function getAllProjectsByProjectManager(req, res) {
    try {
        const managerId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(managerId)) {
            return res.status(400).json({ success: false, message: "Invalid project manager ID." });
        }

        const query = {
            isDeleted: { $ne: true },
            managers: managerId
        };

        const total = await Project.countDocuments(query);

        let projects = await Project.find(query)
            .populate({
                path: "managers",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "departments.department",
                select: "name description"
            })
            .populate({
                path: "departments.departmentHeads",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.employee",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "employees.assignedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "remarks.remarkedBy",
                select: "firstName lastName photoUrl email role"
            })
            .populate({
                path: "projectKpi.department",
                select: "name description"
            })
            .populate({
                path: "projectKpi.kpiCriteria.kpi",
                select: "criteria"
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Add progress to each project concurrently
        const projectsWithProgress = await Promise.all(
            projects.map(async (project) => {
                const progress = await calculateProjectStatusDistribution(project._id);
                return { ...project, progress };
            })
        );

        return res.status(200).json({
            success: true,
            message: "Projects fetched successfully.",
            projects: projectsWithProgress,
            pagination: buildPaginationMeta({ totalDocs: total, page, limit }),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

/* ───────────────────── GET /api/project/tasks/:id ───────────────────── */
async function getProjectTasksOverview(req, res) {
    try {
        const projectId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid projectId." });
        }

        // Find all tasks for this project, not deleted
        const tasks = await Task.find({
            project: projectId,
            isDeleted: { $ne: true }
        }, {
            _id: 1,
            department: 1,
            details: 1
        });

        // Group tasks by departmentId
        const grouped = {};
        tasks.forEach(task => {
            const depId = task.department.toString();
            if (!grouped[depId]) grouped[depId] = [];
            grouped[depId].push({
                taskId: task._id,
                description: task.details
            });
        });

        // Get unique department IDs
        const depIds = Object.keys(grouped);

        // Fetch department names in one query
        const departments = await Department.find({ _id: { $in: depIds } }, { _id: 1, name: 1 });
        const depNameMap = {};
        departments.forEach(dep => {
            depNameMap[dep._id.toString()] = dep.name;
        });

        // Convert to required array format with department name
        const overview = depIds.map(depId => ({
            departmentId: depId,
            departmentName: depNameMap[depId] || "Unknown",
            tasks: grouped[depId]
        }));

        return res.status(200).json({
            success: true,
            data: overview
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error", detail: error.message });
    }
}

/* ───────────────────── GET /api/project/assignment/:id ───────────────────── */
async function getProjectAssignments(req, res) {
    try {
        const projectId = req.params.id;

        // Step 1: Find all active assignments for this project
        const assignments = await TaskAssignment.find({
            project: projectId,
            isDeleted: { $ne: true }
        })
            .populate({
                path: 'tasks',
                match: { isDeleted: { $ne: true } }, // Only get non-deleted tasks
                populate: { path: 'department', select: 'name' } // Get department name
            })
            .populate({
                path: 'employee',
                select: 'firstName lastName photoUrl email department',
            });

        // Step 2: Flatten and group data
        // Format: [{ departmentId, departmentName, employeeId, employeeName, tasks: [{_id, details}] }]
        const grouped = {};

        for (const assign of assignments) {
            const employeeId = assign.employee?._id?.toString();
            const employeeName = assign.employee ? `${assign.employee.firstName} ${assign.employee.lastName}` : '';
            for (const task of assign.tasks) {
                if (!task || !task.department) continue; // Skip if department is missing
                const departmentId = task.department._id.toString();
                const departmentName = task.department.name;

                // Grouping key: department+employee
                const groupKey = `${departmentId}|${employeeId}`;
                if (!grouped[groupKey]) {
                    grouped[groupKey] = {
                        departmentId,
                        departmentName,
                        employeeId,
                        employeeName,
                        tasks: []
                    };
                }
                grouped[groupKey].tasks.push({ _id: task._id, details: task.details });
            }
        }

        // Step 3: Prepare response array
        const result = Object.values(grouped).map(item => ({
            departmentId: item.departmentId,
            departmentName: item.departmentName,
            employeeId: item.employeeId,
            employeeName: item.employeeName,
            tasks: item.tasks
        }));

        return res.status(200).json({ assignments: result });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    }
}

/* ───────────────────── GET /api/project/assignment-matrix/:id ───────────────────── */
async function getDepartmentTaskAssignmentsMatrix(req, res) {
    try {
        const projectId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid projectId." });
        }

        // 1. Get all tasks (with department info)
        const tasks = await Task.find({
            project: projectId,
            isDeleted: { $ne: true }
        }).populate('department', 'name');


        // 2. Get all assignments for this project
        const assignments = await TaskAssignment.find({
            project: projectId,
            isDeleted: { $ne: true }
        })
            .populate('tasks', 'department') // only need task IDs and departments here
            .populate({
                path: 'employee',
                select: 'firstName lastName photoUrl email department'
            });


        // 3. Build map: departmentId -> [{_id, details}]
        const departmentTaskMap = {};
        const departmentNameMap = {};
        for (const task of tasks) {
            if (!task.department) continue;
            const depId = task.department._id.toString();
            if (!departmentTaskMap[depId]) departmentTaskMap[depId] = [];
            departmentTaskMap[depId].push({
                _id: task._id.toString(),
                details: task.details
            });
            departmentNameMap[depId] = task.department.name;
        }

        // 4. Build map: departmentId -> Set of employees in that department (from assignments)
        const departmentEmployeeMap = {};
        const employeeInfoMap = {}; // employeeId -> { employeeId, employeeName }
        for (const assign of assignments) {
            const emp = assign.employee;
            if (!emp) continue;
            const empId = emp._id.toString();
            const empDeptId = assign.department?.toString();
            if (!empDeptId) continue;
            employeeInfoMap[empId] = { employeeId: empId, employeeName: `${emp.firstName} ${emp.lastName}` };
            if (!departmentEmployeeMap[empDeptId]) departmentEmployeeMap[empDeptId] = new Set();
            departmentEmployeeMap[empDeptId].add(empId);
        }

        // 5. For each department, build assignments array
        const departments = [];
        const allDepartmentIds = Array.from(new Set([
            ...Object.keys(departmentTaskMap),
            ...Object.keys(departmentEmployeeMap)
        ]));

        for (const depId of allDepartmentIds) {
            const depName = departmentNameMap[depId] || "Unknown";
            const tasksArr = departmentTaskMap[depId] || [];

            // Find all employees in this department (from assignments), may be empty
            const employeeIds = departmentEmployeeMap[depId]
                ? Array.from(departmentEmployeeMap[depId])
                : [];

            const assignmentsArr = [];
            for (const empId of employeeIds) {
                // Find this employee's assignment(s) in this department
                const empAssignments = assignments.filter(a =>
                    a.employee &&
                    a.employee._id.toString() === empId
                );
                // Build set of task IDs assigned to this employee in this department
                const assignedTaskIds = new Set();
                for (const empAssign of empAssignments) {
                    for (const t of empAssign.tasks) {
                        // t may not be populated
                        if (t && t.department?.toString() === depId) {
                            assignedTaskIds.add(t._id.toString());
                        }
                    }
                }
                // Build tasks array with assigned:true/false
                const tasksWithFlag = tasksArr.map(t => ({
                    _id: t._id,
                    details: t.details,
                    assigned: assignedTaskIds.has(t._id)
                }));
                assignmentsArr.push({
                    employeeId: empId,
                    employeeName: employeeInfoMap[empId]?.employeeName || "",
                    tasks: tasksWithFlag
                });
            }

            departments.push({
                departmentId: depId,
                departmentName: depName,
                assignments: assignmentsArr,
                tasks: tasksArr
            });
        }

        return res.status(200).json({
            success: true,
            departments
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, message: "Server error", detail: error.message });
    }
}

/* ───────────────────── PUT /api/project/add-kpi ───────────────────── */
async function addProjectKpi(req, res) {
    try {
        const { projectId, departmentKpi } = req.body;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            return res.status(400).json({ success: false, message: "Invalid project ID." });
        }

        if (!Array.isArray(departmentKpi) || departmentKpi.length === 0) {
            return res.status(400).json({ success: false, message: "Departments must be a non-empty array." });
        }

        const project = await Project.findById(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found." });
        }

        if(project.departments.length !== departmentKpi.length) {
            return res.status(400).json({ success: false, message: "Each department must have a corresponding KPI." });
        }

        // Validate each department and its KPIs
        const departmentBlocks = [];

        for (const dept of departmentKpi) {
            if (!dept.department || !dept.kpiCriteria || !Array.isArray(dept.kpiCriteria) || dept.kpiCriteria.length === 0) {
                return res.status(400).json({ success: false, message: "Each department must have a valid department ID and at least one KPI criteria." });
            }
            const department = await Department.findById(dept.department);
            if (!department) {
                return res.status(400).json({ success: false, message: `Department with ID ${dept.department} not found.` });
            }
            const kpiCriteria = [];
            let totalValue = 0;
            for (const kpi of dept.kpiCriteria) {
                if (!kpi.criteria || typeof kpi.criteria !== "string" || typeof kpi.value !== "number" || kpi.value < 0 || kpi.value > 100) {
                    return res.status(400).json({
                        success: false,
                        message: `Each kpiCriteria must have a string 'criteria' and a number 'value' between 0 and 100.`,
                    });
                }
                totalValue += kpi.value;

                // Find existing KPI by criteria text or create a new one
                let kpiDoc = await Kpi.findOne({ criteria: kpi.criteria.trim() });
                if (!kpiDoc) {
                    kpiDoc = new Kpi({ criteria: kpi.criteria.trim() });
                    await kpiDoc.save();
                }

                kpiCriteria.push({ kpi: kpiDoc._id, value: kpi.value });
            }
            if (totalValue !== 100) {
                return res.status(400).json({
                    success: false, message: "Total value of all kpiCriteria must be exactly 100.",
                    totalValue
                });
            }
            departmentBlocks.push({
                department: dept.department,
                kpiCriteria
            });
        }

        // Update project with new KPIs
        project.projectKpi = departmentBlocks;
        project.isProjectBasedKpi = true;
        await project.save();

        const updatedProject = await Project.findById(projectId)
          .populate({
            path: "managers",
            select: "firstName lastName photoUrl email role",
          })
          .populate({
            path: "departments.department",
            select: "name description",
          })
          .populate({
            path: "departments.departmentHeads",
            select: "firstName lastName photoUrl email role",
          })
          .populate({
            path: "departments.kpiCriteria.kpi",
            select: "criteria",
          })
          .populate({
            path: "employees.employee",
            select: "firstName lastName photoUrl email role",
          })
          .populate({
            path: "employees.assignedBy",
            select: "firstName lastName photoUrl email role",
          })
          .populate({
            path: "remarks.remarkedBy",
            select: "firstName lastName photoUrl email role",
          })
          .populate({
            path: "projectKpi.department",
            select: "name description",
          })
          .populate({
            path: "projectKpi.kpiCriteria.kpi",
            select: "criteria",
          });
        return res.status(200).json({
          success: true,
          message: "KPI criteria added successfully.",
          project: updatedProject,
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Server Error", error: err.message });
    }
}

module.exports = {
    createProject,
    getAllProjects,
    getProjectById,
    updateProject,
    softDeleteProject,
    hardDeleteProject,
    getAllProjectsByEmployee,
    getAllProjectsByDepartment,
    getAllProjectsByDepartmentHead,
    getAllProjectsByProjectManager,
    getProjectTasksOverview,
    getProjectAssignments,
    getDepartmentTaskAssignmentsMatrix,
    addProjectKpi,
};
