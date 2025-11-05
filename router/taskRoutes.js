const express = require('express');
const router = express.Router();
const {
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
} = require('../controller/taskController');

// Get all tasks by project ID
router.get('/project/:id', getAllTasksByProject);

// Get tasks for an employee
router.get('/employee/:id', getTasksForEmployee);

// Get tasks based on employee id or project id
router.get('/all', getTasksForAll);

// Get tasks for a department head
router.get('/department-head/:id', getTasksForDepartmentHead);

// Get tasks for a department
router.get('/department/:id', getTasksForDepartment);

// Get tasks for a project manager
router.get('/project-manager/:id', getTasksForProjectManager);

// Update task status
router.put('/status', updateTaskStatus);

// Assign an employee to a task
router.put('/assign', assignEmployeeToTask);

// Assign Bulk employees to tasks
router.put('/bulk-assign', bulkAssignEmployeesToTasks);

// Terminate an employee from a task
router.put('/terminate', terminateEmployeeFromTask);

// Bulk create tasks
router.post('/bulkTasks', bulkCreateTasks);

// Bulk update tasks
router.put('/bulkTasks', bulkUpdateTasks);

// Create a new task
router.post('/', createTask);

// Get all tasks
router.get('/', getAllTasks);

// Get a single task by ID
router.get('/:id', getSingleTask);

// Update a task by ID
router.put('/:id', updateTask);

// Hard delete a task by ID
router.delete('/hard/:id', hardDeleteTask);

// Soft delete a task by ID
router.delete('/:id', softDeleteTask);


module.exports = router;
