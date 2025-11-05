const mongoose = require('mongoose');
const Task = require('../model/taskSchema');
const TaskAssignment = require('../model/taskAssignmentSchema');


/* ───────────────────── Get  /api/assignments/ ───────────────────── */
async function getAllAssignments(req, res) {
    try {
        // Query params: page, limit, employeeId
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;
        const { employeeId } = req.query;

        const filter = { isDeleted: { $ne: true } };
        if (employeeId) filter.employee = employeeId;

        // Count total
        const total = await TaskAssignment.countDocuments(filter);

        // Find with pagination
        const assignments = await TaskAssignment.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('employee', 'firstName lastName email role department')
            .populate('assignedBy', 'firstName lastName email role department')
            .populate('project', 'name description')
            .populate('tasks', 'details status completion isCompleted createdAt updatedAt');

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            assignments
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error", detail: error.message });
    }
}

/* ───────────────────── Get  /api/assignments/:id ───────────────────── */
async function getSingleAssignment(req, res) {
    try {
        const assignmentId = req.params.id;

        if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
            return res.status(400).json({ error: "Invalid assignment ID." });
        }

        const assignment = await TaskAssignment.findOne({ _id: assignmentId, isDeleted: { $ne: true } })
            .populate('employee', 'firstName lastName email role department')
            .populate('assignedBy', 'firstName lastName email role department')
            .populate('project', 'name description')
            .populate('tasks', 'details status completion isCompleted createdAt updatedAt');

        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found." });
        }

        return res.status(200).json({ assignment });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error", detail: error.message });
    }
}

/* ───────────────────── Put  /api/assignments/progress ───────────────────── */
async function updateTaskProgress(req, res) {
    try {
        const { assignmentId, employeeId, progressUpdates } = req.body;

        // Input validation
        if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
            return res.status(400).json({ error: "Invalid assignmentId." });
        }
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ error: "Invalid employeeId." });
        }
        if (!Array.isArray(progressUpdates) || progressUpdates.length === 0) {
            return res.status(400).json({ error: "progressUpdates must be a non-empty array." });
        }

        // Find the assignment
        const assignment = await TaskAssignment.findOne({
            _id: assignmentId,
            employee: employeeId,
            isDeleted: { $ne: true }
        });
        if (!assignment) {
            return res.status(403).json({ error: "Assignment not found or not assigned to this employee." });
        }

        // Validate all taskIds are part of the assignment
        const assignmentTaskIds = assignment.tasks.map(id => id.toString());
        for (const update of progressUpdates) {
            if (!mongoose.Types.ObjectId.isValid(update.taskId)) {
                return res.status(400).json({ error: `Invalid taskId: ${update.taskId}` });
            }
            if (!assignmentTaskIds.includes(update.taskId)) {
                return res.status(403).json({ error: `Task ${update.taskId} is not part of this assignment.` });
            }
            if (
                typeof update.completion !== "number" ||
                update.completion < 0 ||
                update.completion > 100
            ) {
                return res.status(400).json({ error: `Invalid completion for task ${update.taskId}.` });
            }
        }

        // Update all tasks
        const updatedTasks = [];
        for (const update of progressUpdates) {
            const task = await Task.findById(update.taskId);
            if (!task || task.isDeleted) continue;

            const wasCompleted = task.completion === 100 && task.isCompleted;

            // Set new completion
            task.completion = update.completion;

            if (!wasCompleted && update.completion === 100) {
                // Mark as completed and set completeAt only if just reached 100%
                task.isCompleted = true;
                task.completeAt = new Date();
            } else if (wasCompleted && update.completion < 100) {
                // Mark as not completed and clear completeAt
                task.isCompleted = false;
                task.completeAt = null;
            } // else: don't touch completeAt

            await task.save();
            updatedTasks.push(task);
        }

        // Check if all tasks in the assignment are now completed
        const allTasks = await Task.find({ _id: { $in: assignment.tasks }, isDeleted: { $ne: true } });
        const allCompleted = allTasks.every(t => t.isCompleted);

        if (allCompleted) {
            assignment.status = "Completed";
            assignment.isCompleted = true;
            assignment.completedAt = new Date();
            await assignment.save();
        } else if (assignment.status === "Completed") {
            // If not all completed but status was completed, revert status
            assignment.status = "InProgress";
            assignment.isCompleted = false;
            assignment.completedAt = null;
            await assignment.save();
        }

        return res.status(200).json({
            message: "Task progress updated successfully.",
            updatedTasks,
            assignmentStatus: assignment.status
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error", detail: error.message });
    }
}

/* ───────────────────── Put  /api/assignments/review ───────────────────── */
const VALID_STATUSES = ["NotStarted", "InProgress", "InReview", "Completed", "OnHold", "Reviewed"];
async function reviewTaskAssignment(req, res) {
    try {
        const { assignmentId, reviewedBy, taskUpdates, assignmentStatus } = req.body;
        // taskUpdates: [{ taskId, completion }, ...]

        // Basic validations
        if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
            return res.status(400).json({ error: "Invalid assignmentId." });
        }
        if (!mongoose.Types.ObjectId.isValid(reviewedBy)) {
            return res.status(400).json({ error: "Invalid Id." });
        }
        if (!Array.isArray(taskUpdates) || taskUpdates.length === 0) {
            return res.status(400).json({ error: "taskUpdates must be a non-empty array." });
        }
        if (assignmentStatus && !VALID_STATUSES.includes(assignmentStatus)) {
            return res.status(400).json({ error: `Invalid assignmentStatus. Valid values: ${VALID_STATUSES.join(", ")}` });
        }

        // Find assignment
        const assignment = await TaskAssignment.findById(assignmentId);
        if (!assignment || assignment.isDeleted) {
            return res.status(404).json({ error: "Task assignment not found." });
        }

        // Verify all taskIds belong to this assignment
        const assignmentTaskIds = assignment.tasks.map(tid => tid.toString());
        for (const update of taskUpdates) {
            if (!assignmentTaskIds.includes(update.taskId)) {
                return res.status(400).json({ error: `Task ${update.taskId} does not belong to this assignment.` });
            }
            if (typeof update.completion !== "number" || update.completion < 0 || update.completion > 100) {
                return res.status(400).json({ error: `Invalid completion for task ${update.taskId}. Must be 0-100.` });
            }
        }

        // Update each task completion
        const updatedTasks = [];
        for (const { taskId, completion } of taskUpdates) {
            const task = await Task.findById(taskId);
            if (!task || task.isDeleted) continue;

            const wasCompleted = task.completion === 100 && task.isCompleted;

            task.completion = completion;

            if (!wasCompleted && completion === 100) {
                // Mark as completed and set completeAt only if just reached 100%
                task.isCompleted = true;
                task.completeAt = new Date();
            } else if (wasCompleted && completion < 100) {
                // Mark as not completed and clear completeAt
                task.isCompleted = false;
                task.completeAt = null;
            }
            // else: don't touch completeAt
            await task.save();
            updatedTasks.push(task);
        }

        // After tasks updated, re-check all tasks in assignment to determine assignment status
        const allTasks = await Task.find({ _id: { $in: assignment.tasks }, isDeleted: { $ne: true } });
        const allCompleted = allTasks.length > 0 && allTasks.every(t => t.isCompleted);
        const anyInProgress = allTasks.some(t => t.completion > 0 && !t.isCompleted);

        // Auto update assignment completion and status if admin didn't override status
        assignment.isCompleted = allCompleted;
        assignment.completedAt = allCompleted ? (assignment.completedAt || new Date()) : null;

        if (!assignmentStatus) {
            if (allCompleted) {
                assignment.status = "Completed";
            } else if (anyInProgress) {
                assignment.status = "InProgress";
            } else {
                assignment.status = "NotStarted";
            }
        } else {
            // Admin overrides assignment status explicitly
            if (assignmentStatus === "Reviewed" && !allCompleted) {
                return res.status(400).json({ error: "Cannot mark as Reviewed unless all tasks are completed." });
            }
            assignment.status = assignmentStatus;
        }

        // Set who reviewed and when
        assignment.reviewedBy = reviewedBy;
        assignment.reviewedAt = new Date();

        await assignment.save();

        return res.status(200).json({
            message: "Tasks and assignment updated successfully.",
            updatedTasks,
            assignment
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error", detail: error.message });
    }
}

/* ───────────────────── Get  /api/assignments/employee/:id ───────────────────── */
async function getEmployeeAssignments(req, res) {
    try {
        const employeeId = req.params.id;
        const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
        const limit = parseInt(req.query.limit) > 0 ? parseInt(req.query.limit) : 10;

        const filter = { employee: employeeId, isDeleted: { $ne: true } };

        // Total count
        const total = await TaskAssignment.countDocuments(filter);

        // Paginated assignments
        const assignments = await TaskAssignment.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('employee', 'firstName lastName email role department')
            .populate('assignedBy', 'firstName lastName email role department')
            .populate('project', 'name description')
            .populate('tasks', 'details status completion isCompleted createdAt updatedAt');

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            assignments
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error", detail: error.message });
    }
}


module.exports = {
    getAllAssignments,
    getSingleAssignment,
    updateTaskProgress,
    reviewTaskAssignment,
    getEmployeeAssignments,
}