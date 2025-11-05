const express = require('express');
const router = express.Router();
const {
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
} = require('../controller/projectController');

// Get all projects
router.get('/', getAllProjects);

// Create a new project
router.post('/', createProject);

// Add Project KPI
router.put('/add-kpi', addProjectKpi);

// Update a project by ID
router.put('/:id', updateProject);

// Hard delete a project by ID
router.delete('/hard/:id', hardDeleteProject);

// Delete a project by ID
router.delete('/:id', softDeleteProject);

// Get all projects by employee ID
router.get('/employee/:id', getAllProjectsByEmployee);

// Get all projects by department ID
router.get('/department/:id', getAllProjectsByDepartment);

// Get all projects by Department Head ID
router.get('/department-head/:id', getAllProjectsByDepartmentHead);

// Get all projects by Project Manager ID
router.get('/project-manager/:id', getAllProjectsByProjectManager);

// Get All Projects Tasks Overview
router.get('/tasks/:id', getProjectTasksOverview);

// Get All Projects Assignments
router.get('/assignment/:id', getProjectAssignments);

// Get Department Task Assignments Matrix
router.get('/assignment-matrix/:id', getDepartmentTaskAssignmentsMatrix);

// Get a project by ID
router.get('/:id', getProjectById);

module.exports = router;
