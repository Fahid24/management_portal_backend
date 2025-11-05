const express = require("express");
const router = express.Router();
const {
    createTask,
    getTasks,
    getTaskById,
    updateTask,
    deleteTask,
    hardDeleteTask,
    updateTaskStatus,
    getToDoTasksForEmployee,
} = require("../controller/dailyTaskController");

// Create Task
router.post("/", createTask);

// Get All Tasks (optional filter: ?employeeId=xxx)
router.get("/", getTasks);

// Get All todo Tasks (optional filter: ?employeeId=xxx)
router.get("/todo/:id", getToDoTasksForEmployee);

// Update Task Status
router.put("/status", updateTaskStatus);

// Update Task
router.put("/:id", updateTask);

// Delete Task (hard delete)
router.delete("/hard/:id", hardDeleteTask);

// Delete Task (soft delete)
router.delete("/:id", deleteTask);

// Get Single Task
router.get("/:id", getTaskById);

module.exports = router;