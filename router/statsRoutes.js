const express = require('express');
const router = express.Router();
const {
  getEmployeeKpiStats,
  getDepartmentKpiStats,
  getDepartmentHeadKpiStats,
  getManagerKpiStats,
  getOrganizationKpiStats,
  getDepartmentStats,
  getEmployeeStats,
  getOrganizationStats,
  getOverviewStats,
  getDashboardSummary,
} = require('../controller/statsController');


router.get('/', async (req, res) => {
    try {
        // Simulate fetching stats from the database
        const stats = {
            totalProjects: 100,
            totalTasks: 500,
            totalEmployees: 50,
            completedTasks: 300,
            pendingTasks: 200,
            inProgressTasks: 150
        };

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
}
);

// Get Employee KPI Stats
router.get('/employee/kpi/:id', getEmployeeKpiStats);

// Get Department KPI Stats
router.get('/department/kpi/:departmentId', getDepartmentKpiStats);

// Get Department Head KPI Stats
router.get('/department-head/kpi/:headId', getDepartmentHeadKpiStats);

// Get Manager KPI Stats
router.get('/manager/kpi/:managerId', getManagerKpiStats);

// Get Organization KPI Stats
router.get('/organization/kpi', getOrganizationKpiStats);

// Unified Department Stats (filter by departmentId, headId, managerId, or all)
router.get('/department-stats', getDepartmentStats);

// Unified Employee Stats (filter by departmentId, etc.)
router.get('/employee-stats', getEmployeeStats);

// Unified Organization Stats (filter by departmentId, headId, managerId, or all)
router.get('/organization-stats', getOrganizationStats);

// Overview stats by role (employee, departmentHead, manager)
router.get('/overview', getOverviewStats); // <-- Add this line

// Dashboard summary stats
router.get('/dashboard-summary', getDashboardSummary);

// Export the router
module.exports = router;