const mongoose = require("mongoose");
const Employee = require('../model/employeeSchema');
const TaskAssignment = require('../model/taskAssignmentSchema');
const Attendance = require('../model/attendenceSchema');
const Leave = require('../model/leaveSchema');
const Kpi = require('../model/kpiSchema');
const Department = require('../model/departmentSchema');
const DailyTask = require("../model/dailyTaskSchema");
const Task = require('../model/taskSchema');
const Project = require('../model/projectSchema');
const Time = require('../utils/time');
const AdminConfig = require('../model/AdminConfigSchema');

// Controller to fetch Employee's KPIs and stats
const getEmployeeKpiStats = async (req, res) => {
  const id = req.params.id;
  const { from, to } = req.query;

  try {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid Employee ID" });
    }

    const employee = await Employee.findById(id).lean();
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    let dateFilter = {};
    let period = "lifetime";
    let totalDaysInRange = null;

    if (from && to) {
      const { start, end } = Time.getDateRangeFromISO(from, to);
      if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      dateFilter = { $gte: Time.toJSDate(start), $lte: Time.toJSDate(end) };
      period = { from, to };
      totalDaysInRange = end.diff(start, "days").days + 1;
    }

    const [taskAssignments, dailyTasks, attendance, leaveRecords, adminConfig] = await Promise.all([
      TaskAssignment.find({
        employee: id,
        ...(dateFilter.$gte ? { assignedAt: dateFilter } : {}),
        isDeleted: false
      })
        .populate({
          path: "tasks",
          match: { isDeleted: false },
          populate: { path: "kpi" }
        })
        .populate({ path: "project", select: "name", match: { isDeleted: false } }),
      DailyTask.find({
        employeeId: id,
        ...(dateFilter.$gte ? { assignedDate: dateFilter } : {}),
        isDeleted: false
      }),
      Attendance.find({
        employeeId: id,
        ...(dateFilter.$gte ? { date: dateFilter } : {})
      }),
      Leave.find({
        employeeId: id,
        ...(dateFilter.$gte
          ? { startDate: { $lte: dateFilter.$lte }, endDate: { $gte: dateFilter.$gte } }
          : {})
      }),
      AdminConfig.findOne({}),
    ]);

    let totalProjectTasks = 0, completedProjectTasks = 0, totalProjectCompletion = 0, totalProjectCompletionTime = 0, projectTaskKpis = {};
    let onTimeProjectTasks = 0, overdueProjectTasks = 0, totalProjectTaskDelay = 0, delayedProjectTasks = 0;
    const projectContribution = {};

    taskAssignments.forEach(ta => {
      const projectId = ta.project?._id?.toString() || ta.project?.toString();
      if (projectId && !projectContribution[projectId]) {
        projectContribution[projectId] = {
          projectId,
          projectName: ta.project?.name || "",
          assigned: 0,
          completed: 0,
          totalCompletion: 0
        };
      }

      ta.tasks.forEach(task => {
        totalProjectTasks++;
        if (projectId) {
          projectContribution[projectId].assigned++;
          projectContribution[projectId].totalCompletion += task.completion || 0;
          if (task.isCompleted) projectContribution[projectId].completed++;
        }
        if (task.isCompleted) completedProjectTasks++;
        totalProjectCompletion += task.completion || 0;

        if (task.kpi) {
          const kpiId = task.kpi._id.toString();
          if (!projectTaskKpis[kpiId]) projectTaskKpis[kpiId] = { criteria: task.kpi.criteria, total: 0, count: 0 };
          projectTaskKpis[kpiId].total += task.completion || 0;
          projectTaskKpis[kpiId].count++;
        }

        if (task.completionTime && task.completionTime.value) {
          let hours = task.completionTime.value;
          if (task.completionTime.unit === "minutes") hours /= 60;
          else if (task.completionTime.unit === "days") hours *= 24;
          else if (task.completionTime.unit === "weeks") hours *= 24 * 7;
          totalProjectCompletionTime += hours;
        }

        if (task.isCompleted && task.completeAt && task.dueDate) {
          const completeAt = Time.fromJSDate(task.completeAt);
          const dueDate = Time.fromJSDate(task.dueDate);
          if (completeAt <= dueDate) onTimeProjectTasks++;
          else {
            overdueProjectTasks++;
            totalProjectTaskDelay += completeAt.diff(dueDate, "days").days;
            delayedProjectTasks++;
          }
        } else if (!task.isCompleted && task.dueDate && Time.isAfter(Time.now(), Time.fromJSDate(task.dueDate))) {
          overdueProjectTasks++;
        }
      });
    });

    const avgProjectTaskDelay = delayedProjectTasks ? totalProjectTaskDelay / delayedProjectTasks : 0;

    const projectContributionArr = Object.values(projectContribution).map(p => ({
      projectId: p.projectId,
      projectName: p.projectName,
      assigned: p.assigned,
      completed: p.completed,
      completionRate: p.assigned ? Number((p.completed / p.assigned * 100).toFixed(2)) : 0,
      avgCompletion: p.assigned ? Number((p.totalCompletion / p.assigned).toFixed(2)) : 0
    }));

    const overallContribution = {
      assigned: totalProjectTasks,
      completed: completedProjectTasks,
      completionRate: totalProjectTasks ? Number((completedProjectTasks / totalProjectTasks * 100).toFixed(2)) : 0,
      avgCompletion: totalProjectTasks ? Number((totalProjectCompletion / totalProjectTasks).toFixed(2)) : 0
    };

    const totalDailyTasks = dailyTasks.length;
    const completedDailyTasks = dailyTasks.filter(t => t.isCompleted).length;
    const totalDailyCompletion = dailyTasks.reduce((sum, t) => sum + (t.completion || 0), 0);
    const totalDailyCompletionTime = dailyTasks.reduce((sum, t) => {
      let hours = t.completionTime?.value || 0;
      if (t.completionTime?.unit === "minutes") hours /= 60;
      else if (t.completionTime?.unit === "days") hours *= 24;
      else if (t.completionTime?.unit === "weeks") hours *= 24 * 7;
      return sum + hours;
    }, 0);

    const dailyTaskPriority = { low: 0, medium: 0, high: 0 };
    dailyTasks.forEach(t => {
      if (t.priority) dailyTaskPriority[t.priority]++;
    });

    const presentDays = attendance.filter(a => a.status === "present").length;
    const lateDays = attendance.filter(a => a.status === "late").length;
    const onLeaveDays = attendance.filter(a => a.status === "on leave").length;
    const absentDays = attendance.filter(a => a.status === "absent").length;
    const totalAttendanceDays = attendance.length;
    const attendanceBase = totalDaysInRange || totalAttendanceDays || 1;
    const attendanceRate = (presentDays / attendanceBase) * 100;

    let totalWorkHours = 0;
    attendance.forEach(a => {
      if (a.checkIn && a.checkOut) {
        const checkIn = Time.fromJSDate(a.checkIn);
        const checkOut = Time.fromJSDate(a.checkOut);
        totalWorkHours += checkOut.diff(checkIn, "hours").hours;
      }
    });
    const avgWorkHours = attendanceBase ? totalWorkHours / attendanceBase : 0;

    const totalLeaves = leaveRecords.length;
    const approvedLeaves = leaveRecords.filter(l => l.status === "approved").length;
    const pendingLeaves = leaveRecords.filter(l => l.status === "pending").length;
    const rejectedLeaves = leaveRecords.filter(l => l.status === "rejected").length;
    const approvedLeaveDays = leaveRecords.filter(l => l.status === "approved").reduce((sum, l) => {
      const start = Time.fromJSDate(l.startDate).startOf("day");
      const end = Time.fromJSDate(l.endDate).endOf("day");
      return sum + end.diff(start, "days").days + 1;
    }, 0);

    const finalKpi = (totalProjectTasks ? (totalProjectCompletion / totalProjectTasks) * (adminConfig.kpiWeights.projectTask / 100) : 0) +
      (totalDailyTasks ? (totalDailyCompletion / totalDailyTasks) * (adminConfig.kpiWeights.dailyTask / 100) : 0) +
      (attendanceRate * (adminConfig.kpiWeights.attendance / 100)) +
      (avgWorkHours * (adminConfig.kpiWeights.workHours / 100)) +
      ((approvedLeaves / (totalLeaves || 1)) * 100 * (adminConfig.kpiWeights.leaveTaken / 100));

    const kpiBreakdown = Object.values(projectTaskKpis).map(kpi => ({
      criteria: kpi.criteria,
      avgCompletion: kpi.count ? kpi.total / kpi.count : 0,
      taskCount: kpi.count,
    }));

    res.json({
      employee: {
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        role: employee.role,
      },
      period,
      projectTasks: {
        assigned: totalProjectTasks,
        completed: completedProjectTasks,
        completionRate: Number(((completedProjectTasks / totalProjectTasks) * 100).toFixed(2)) || 0,
        avgCompletion: Number((totalProjectCompletion / totalProjectTasks).toFixed(2)) || 0,
        avgCompletionTimeHours: Number((totalProjectCompletionTime / totalProjectTasks).toFixed(2)) || 0,
        kpiBreakdown,
        onTimeCompleted: onTimeProjectTasks,
        overdue: overdueProjectTasks,
        avgDelayDays: Number(avgProjectTaskDelay.toFixed(2)),
        projectContribution: projectContributionArr,
        overallContribution
      },
      dailyTasks: {
        assigned: totalDailyTasks,
        completed: completedDailyTasks,
        completionRate: Number((completedDailyTasks / totalDailyTasks * 100).toFixed(2)) || 0,
        avgCompletion: Number((totalDailyCompletion / totalDailyTasks).toFixed(2)) || 0,
        avgCompletionTimeHours: Number((totalDailyCompletionTime / totalDailyTasks).toFixed(2)) || 0,
        priorityBreakdown: dailyTaskPriority,
      },
      attendance: {
        present: presentDays,
        late: lateDays,
        onLeave: onLeaveDays,
        absent: absentDays,
        total: totalAttendanceDays,
        attendanceRate: Number(attendanceRate.toFixed(2)),
        avgWorkHours: Number(avgWorkHours.toFixed(2)),
      },
      leaves: {
        total: totalLeaves,
        approved: approvedLeaves,
        pending: pendingLeaves,
        rejected: rejectedLeaves,
        approvedLeaveDays,
      },
      finalKpi: Number(finalKpi.toFixed(2)),
    });
  } catch (error) {
    console.error("Error fetching employee KPIs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const getDepartmentKpiStats = async (req, res) => {
  const { departmentId } = req.params;
  const { from, to } = req.query;

  try {
    // Date range logic (support lifetime if not provided)
    let dateFilter = {};
    let period = "lifetime";
    let totalDaysInRange = null;
    let startDate, endDate;

    if (from && to) {
      startDate = Time.fromISO(from).startOf("day");
      endDate = Time.fromISO(to).endOf("day");

      if (!Time.isValidDateTime(startDate) || !Time.isValidDateTime(endDate)) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      dateFilter = { $gte: Time.toJSDate(startDate), $lte: Time.toJSDate(endDate) };
      period = { from, to };
      totalDaysInRange = Math.ceil(Time.diff(endDate, startDate, ["days"]).days) + 1;
    }

    // Find department and employees
    const department = await Department.findById(departmentId)
      .populate('employees') // <-- remove match: { isDeleted: false }
      .populate({
        path: 'kpiCriteria.kpi',
        model: 'Kpi'
      });
    
    if (!department) {
      return res.status(404).json({ error: "Department not found" });
    }
    const employees = department.employees;

    // Prepare stats containers
    let departmentStats = {
      totalEmployees: employees.length,
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      avgCompletion: 0,
      onTimeTasks: 0,
      overdueTasks: 0,
      avgDelayDays: 0,
      presentDays: 0,
      totalLeaveDays: 0,
      attendanceRate: 0,
      onTimeRate: 0,
      projectBreakdown: {},
      employeeStats: [],
      kpiBreakdown: []
    };

    let totalCompletion = 0, totalDelay = 0, delayedTasks = 0;

    // Prepare KPI breakdown for department criteria
    const departmentKpiIds = department.kpiCriteria.map(k => k.kpi?._id?.toString() || k.kpi?.toString());
    const kpiStatsMap = {};
    const totalWeight = department.kpiCriteria.reduce((sum, k) => sum + (k.value || 0), 0);
    
    department.kpiCriteria.forEach(k => {
      const kpiId = k.kpi?._id?.toString() || k.kpi?.toString();
      kpiStatsMap[kpiId] = {
        kpiId,
        criteria: k.kpi?.criteria || "",
        description: k.kpi?.description || "",
        weight: k.value,
        weightPercentage: totalWeight ? (k.value / totalWeight * 100) : 0,
        taskCount: 0,
        completedCount: 0,
        totalCompletion: 0
      };
    });

    // Collect data for each employee
    for (const employee of employees) {
      // Fetch assignments for this employee in date range or lifetime
      const taskAssignments = await TaskAssignment.find({
        employee: employee._id,
        ...(dateFilter.$gte ? { assignedAt: dateFilter } : {}),
        isDeleted: false
      })
        .populate({
          path: 'tasks',
          match: { isDeleted: false },
          populate: { path: 'kpi' }
        })
        .populate({ path: 'project', select: 'name', match: { isDeleted: false } });

      // Per-employee stats
      let empTotalTasks = 0, empCompletedTasks = 0, empTotalCompletion = 0;
      let empOnTimeTasks = 0, empOverdueTasks = 0, empTotalDelay = 0, empDelayedTasks = 0;
      let empProjectStats = {};

      // Project-wise breakdown
      taskAssignments.forEach(ta => {
        const projectId = ta.project?._id?.toString() || ta.project?.toString();
        const projectName = ta.project?.name || "";
        if (projectId) {
          if (!empProjectStats[projectId]) {
            empProjectStats[projectId] = {
              projectId,
              projectName,
              assigned: 0,
              completed: 0,
              totalCompletion: 0
            };
          }
        }
        ta.tasks.forEach(task => {
          empTotalTasks++;
          departmentStats.totalTasks++;
          if (projectId) {
            empProjectStats[projectId].assigned++;
            empProjectStats[projectId].totalCompletion += task.completion || 0;
            if (task.isCompleted) empProjectStats[projectId].completed++;
          }
          if (task.isCompleted) {
            empCompletedTasks++;
            departmentStats.completedTasks++;
          }
          empTotalCompletion += task.completion || 0;
          totalCompletion += task.completion || 0;

          // On-time/Overdue
          if (task.isCompleted && task.completeAt && task.dueDate) {
            const completeDateTime = Time.fromJSDate(task.completeAt);
            const dueDateDateTime = Time.fromJSDate(task.dueDate);
            
            if (Time.isBefore(completeDateTime, dueDateDateTime) || completeDateTime.equals(dueDateDateTime)) {
              empOnTimeTasks++;
              departmentStats.onTimeTasks++;
            } else {
              empOverdueTasks++;
              departmentStats.overdueTasks++;
              const delay = Time.diff(completeDateTime, dueDateDateTime, ["days"]).days;
              empTotalDelay += delay;
              totalDelay += delay;
              empDelayedTasks++;
              delayedTasks++;
            }
          } else if (!task.isCompleted && task.dueDate && Time.isAfter(Time.now(), Time.fromJSDate(task.dueDate))) {
            empOverdueTasks++;
            departmentStats.overdueTasks++;
          }
        });
      });

      // Attendance
      const attendance = await Attendance.find({
        employeeId: employee._id,
        ...(dateFilter.$gte ? { date: dateFilter } : {})
      });
      const presentDays = attendance.filter(att => att.status === "present").length;

      // Leaves
      const leaveRecords = await Leave.find({
        employeeId: employee._id,
        ...(dateFilter.$gte
          ? { startDate: { $lte: dateFilter.$lte }, endDate: { $gte: dateFilter.$gte } }
          : {})
      });
      const approvedLeaveDays = leaveRecords
        .filter(l => l.status === "approved")
        .reduce((sum, l) => {
          const leaveStart = Time.fromJSDate(l.startDate);
          const leaveEnd = Time.fromJSDate(l.endDate);
          
          let s, e;
          if (from && to) {
            s = Time.isAfter(leaveStart, startDate) ? leaveStart : startDate;
            e = Time.isBefore(leaveEnd, endDate) ? leaveEnd : endDate;
          } else {
            s = leaveStart;
            e = leaveEnd;
          }
          
          return sum + Math.ceil(Time.diff(e, s, ["days"]).days) + 1;
        }, 0);

      departmentStats.presentDays += presentDays;
      departmentStats.totalLeaveDays += approvedLeaveDays;

      // Project breakdown aggregation
      Object.values(empProjectStats).forEach(p => {
        if (!departmentStats.projectBreakdown[p.projectId]) {
          departmentStats.projectBreakdown[p.projectId] = {
            projectId: p.projectId,
            projectName: p.projectName,
            assigned: 0,
            completed: 0,
            totalCompletion: 0
          };
        }
        departmentStats.projectBreakdown[p.projectId].assigned += p.assigned;
        departmentStats.projectBreakdown[p.projectId].completed += p.completed;
        departmentStats.projectBreakdown[p.projectId].totalCompletion += p.totalCompletion;
      });

      // KPI breakdown for department criteria only
      taskAssignments.forEach(ta => {
        ta.tasks.forEach(task => {
          const kpiId = task.kpi?._id?.toString() || task.kpi?.toString();
          if (departmentKpiIds.includes(kpiId)) {
            kpiStatsMap[kpiId].taskCount++;
            kpiStatsMap[kpiId].totalCompletion += task.completion || 0;
            if (task.isCompleted) kpiStatsMap[kpiId].completedCount++;
          }
        });
      });

      // Per-employee summary
      departmentStats.employeeStats.push({
        employeeId: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        assigned: empTotalTasks,
        completed: empCompletedTasks,
        completionRate: empTotalTasks ? Number((empCompletedTasks / empTotalTasks * 100).toFixed(2)) : 0,
        avgCompletion: empTotalTasks ? Number((empTotalCompletion / empTotalTasks).toFixed(2)) : 0,
        onTimeCompleted: empOnTimeTasks,
        overdue: empOverdueTasks,
        avgDelayDays: empDelayedTasks ? Number((empTotalDelay / empDelayedTasks).toFixed(2)) : 0,
        presentDays,
        approvedLeaveDays
      });
    }

    // Final calculations
    departmentStats.completionRate = departmentStats.totalTasks ? Number((departmentStats.completedTasks / departmentStats.totalTasks * 100).toFixed(2)) : 0;
    departmentStats.avgCompletion = departmentStats.totalTasks ? Number((totalCompletion / departmentStats.totalTasks).toFixed(2)) : 0;
    departmentStats.avgDelayDays = delayedTasks ? Number((totalDelay / delayedTasks).toFixed(2)) : 0;
    let totalDays;
    if (from && to) {
      totalDays = totalDaysInRange;
    } else {
      // For lifetime, use total attendance records per employee as base
      totalDays = departmentStats.totalEmployees ? Math.max(...departmentStats.employeeStats.map(e => e.presentDays)) : 1;
    }
    departmentStats.attendanceRate = totalDays && departmentStats.totalEmployees
      ? (departmentStats.presentDays / (departmentStats.totalEmployees * totalDays)) * 100
      : 0;
    departmentStats.onTimeRate = departmentStats.completedTasks ? (departmentStats.onTimeTasks / departmentStats.completedTasks) * 100 : 0;

    // Project breakdown: convert to array and add rates
    departmentStats.projectBreakdown = Object.values(departmentStats.projectBreakdown).map(p => ({
      projectId: p.projectId,
      projectName: p.projectName,
      assigned: p.assigned,
      completed: p.completed,
      completionRate: p.assigned ? Number((p.completed / p.assigned * 100).toFixed(2)) : 0,
      avgCompletion: p.assigned ? Number((p.totalCompletion / p.assigned).toFixed(2)) : 0
    }));

    // KPIs: Only department criteria, with actual stats
    // Calculate KPI values and final score
    let finalKpiScore = 0;
    departmentStats.kpiBreakdown = Object.values(kpiStatsMap).map(k => {
      // Calculate actual value (avg completion for this KPI)
      const actualValue = k.taskCount ? (k.totalCompletion / k.taskCount) : 0;
      // Calculate weighted contribution to final score
      const weightedValue = (actualValue * k.weightPercentage) / 100;
      finalKpiScore += weightedValue;
      return {
        kpiId: k.kpiId,
        criteria: k.criteria,
        description: k.description,
        weight: k.weight,
        weightPercentage: Number(k.weightPercentage.toFixed(2)),
        assignedTasks: k.taskCount,
        completedTasks: k.completedCount,
        completionRate: k.taskCount ? Number((k.completedCount / k.taskCount * 100).toFixed(2)) : 0,
        avgCompletion: k.taskCount ? Number((k.totalCompletion / k.taskCount).toFixed(2)) : 0,
        actualValue: Number(actualValue.toFixed(2)),
        weightedValue: Number(weightedValue.toFixed(2))
      };
    });

    // Add final weighted KPI score to response
    departmentStats.finalKpiScore = Number(finalKpiScore.toFixed(2));

    // Response
    const departmentKpiStats = {
      departmentId,
      departmentName: department.name,
      period,
      kpiBreakdown: departmentStats.kpiBreakdown,
      finalKpiScore: departmentStats.finalKpiScore,
      stats: departmentStats
    };

    res.status(200).json(departmentKpiStats);
  } catch (error) {
    console.error('Error fetching department KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Department Head KPI Stats
const getDepartmentHeadKpiStats = async (req, res) => {
  const { headId } = req.params;
  const { from, to } = req.query;
  try {
    // Find all departments where this user is departmentHead
    const departments = await Department.find({ departmentHeads: headId, isDeleted: false })
      .populate('employees');

    let allStats = [];
    if (departments && departments.length > 0) {
      for (const dept of departments) {
        req.params.departmentId = dept._id;
        req.query.from = from;
        req.query.to = to;
        // Reuse department stats logic
        const fakeRes = {
          status: () => fakeRes,
          json: (data) => { allStats.push(data); }
        };
        await getDepartmentKpiStats({ params: { departmentId: dept._id }, query: { from, to } }, fakeRes);
      }
    } else {
      // No departments found, return a default departmentKpiStats-like object
      allStats.push({
        departmentId: null,
        departmentName: null,
        period: from && to ? { from, to } : "lifetime",
        kpiBreakdown: [],
        finalKpiScore: 0,
        stats: {
          totalEmployees: 0,
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          avgCompletion: 0,
          onTimeTasks: 0,
          overdueTasks: 0,
          avgDelayDays: 0,
          presentDays: 0,
          totalLeaveDays: 0,
          attendanceRate: 0,
          onTimeRate: 0,
          projectBreakdown: [],
          employeeStats: [],
          kpiBreakdown: [],
          finalKpiScore: 0
        }
      });
    }
    res.json({ departmentHead: headId, departments: allStats });
  } catch (error) {
    console.error('Error fetching department head KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Manager KPI Stats
const getManagerKpiStats = async (req, res) => {
  const { managerId } = req.params;
  const { from, to } = req.query;
  try {
    // 1. Get time range in PST
    let dateFilter = {};
    let period = "lifetime";
    let totalCompletion = 0;

    if (from && to) {
      const { start, end } = Time.getDateRangeFromISO(from, to);
      if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      dateFilter.createdAt = {
        $gte: Time.toJSDate(start),
        $lte: Time.toJSDate(end),
      };
      period = { from, to };
    }

    // 2. Fetch projects managed by the user
    const projects = await Project.find({ managers: managerId, isDeleted: false });

    let stats = {
      totalProjects: projects.length,
      totalTasks: 0,
      completedTasks: 0,
      avgCompletion: 0,
      completionRate: 0,
      projectBreakdown: [],
      period
    };

    // 3. Loop through each project and gather task stats
    for (const project of projects) {
      const taskFilter = {
        project: project._id,
        isDeleted: false,
        ...dateFilter
      };

      const tasks = await Task.find(taskFilter);

      const assigned = tasks.length;
      const completed = tasks.filter(t => t.isCompleted).length;
      const sumCompletion = tasks.reduce((sum, t) => sum + (t.completion || 0), 0);

      stats.totalTasks += assigned;
      stats.completedTasks += completed;
      totalCompletion += sumCompletion;

      stats.projectBreakdown.push({
        projectId: project._id,
        projectName: project.name,
        assigned,
        completed,
        completionRate: assigned ? Number((completed / assigned * 100).toFixed(2)) : 0,
        avgCompletion: assigned ? Number((sumCompletion / assigned).toFixed(2)) : 0
      });
    }

    // 4. Final summary
    stats.completionRate = stats.totalTasks
      ? Number((stats.completedTasks / stats.totalTasks * 100).toFixed(2))
      : 0;
    stats.avgCompletion = stats.totalTasks
      ? Number((totalCompletion / stats.totalTasks).toFixed(2))
      : 0;

    return res.json({ managerId, stats });
  } catch (error) {
    console.error("Error fetching manager KPIs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Organization KPI Stats
const getOrganizationKpiStats = async (req, res) => {
  const { from, to } = req.query;
  try {
    // Get all departments
    const departments = await Department.find({ isDeleted: false })
      .populate('employees') // <-- remove match: { isDeleted: false }
      .populate({ path: 'kpiCriteria.kpi', model: 'Kpi' });
    let orgStats = {
      totalDepartments: departments.length,
      totalEmployees: 0,
      totalTasks: 0,
      completedTasks: 0,
      avgCompletion: 0,
      completionRate: 0,
      departmentBreakdown: []
    };
    let totalCompletion = 0;
    for (const dept of departments) {
      // Get department stats using existing logic
      const fakeRes = {
        status: () => fakeRes,
        json: (data) => { orgStats.departmentBreakdown.push(data); }
      };
      await getDepartmentKpiStats({ params: { departmentId: dept._id }, query: { from, to } }, fakeRes);
      // Aggregate
      const last = orgStats.departmentBreakdown[orgStats.departmentBreakdown.length - 1];
      if (last && last.stats) {
        orgStats.totalEmployees += last.stats.totalEmployees || 0;
        orgStats.totalTasks += last.stats.totalTasks || 0;
        orgStats.completedTasks += last.stats.completedTasks || 0;
        totalCompletion += (last.stats.avgCompletion || 0) * (last.stats.totalTasks || 0);
      }
    }
    orgStats.completionRate = orgStats.totalTasks ? Number((orgStats.completedTasks / orgStats.totalTasks * 100).toFixed(2)) : 0;
    orgStats.avgCompletion = orgStats.totalTasks ? Number((totalCompletion / orgStats.totalTasks).toFixed(2)) : 0;
    res.json({ organization: orgStats });
  } catch (error) {
    console.error('Error fetching organization KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Unified Department Stats Controller (supports filtering by departmentId, headId, managerId, or all)
const getDepartmentStats = async (req, res) => {
  const { departmentId, headId, managerId } = req.query;
  const { from, to } = req.query;

  try {
    let departmentFilter = { isDeleted: false };
    if (departmentId) departmentFilter._id = departmentId;
    if (headId) departmentFilter.departmentHeads = headId;
    if (managerId) departmentFilter.projectManagers = managerId;

    // Find departments based on filter
    const departments = await Department.find(departmentFilter)
      .populate('employees') // <-- remove match: { isDeleted: false }
      .populate({ path: 'kpiCriteria.kpi', model: 'Kpi' });

    if (!departments.length) {
      return res.status(404).json({ error: "No departments found for the given filter" });
    }

    let allStats = [];
    for (const dept of departments) {
      // Reuse getDepartmentKpiStats logic for each department
      const fakeReq = {
        params: { departmentId: dept._id },
        query: { from, to }
      };
      const fakeRes = {
        status: () => fakeRes,
        json: (data) => { allStats.push(data); }
      };
      await getDepartmentKpiStats(fakeReq, fakeRes);
    }
    res.json({ departments: allStats });
  } catch (error) {
    console.error('Error fetching filtered department KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Unified Employee Stats Controller (supports filtering by department, manager, head, etc.)
const getEmployeeStats = async (req, res) => {
  const { departmentId, managerId, headId } = req.query;
  const { from, to } = req.query;

  try {
    let employeeFilter = {};

    if (departmentId) employeeFilter.department = departmentId;
    // Do NOT add employeeFilter.isDeleted = false;
    // ...existing code...
    if (headId) {
      // ...existing code...
      const employees = await Employee.find({ department: { $in: deptIds } }).select('_id');
      // ...existing code...
    }

    // Combine filters
    let employees;
    if (managerId && headId) {
      employees = await Employee.find({ ...employeeFilter, _id: { $in: filteredIds } });
    } else if (managerId) {
      employees = await Employee.find({ ...employeeFilter, _id: { $in: managerEmployeeIds } });
    } else if (headId) {
      employees = await Employee.find({ ...employeeFilter, _id: { $in: headEmployeeIds } });
    } else {
      employees = await Employee.find(employeeFilter);
    }

    if (!employees.length) {
      return res.status(404).json({ error: "No employees found for the given filter" });
    }

    let allStats = [];
    for (const emp of employees) {
      const fakeReq = {
        params: { id: emp._id },
        query: { from, to }
      };
      const fakeRes = {
        status: () => fakeRes,
        json: (data) => { allStats.push(data); }
      };
      await getEmployeeKpiStats(fakeReq, fakeRes);
    }
    res.json({ employees: allStats });
  } catch (error) {
    console.error('Error fetching filtered employee KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Unified Organization Stats Controller (supports filtering)
const getOrganizationStats = async (req, res) => {
  const { departmentId, headId, managerId, from, to } = req.query;
  try {
    let departmentFilter = { isDeleted: false };
    if (departmentId) departmentFilter._id = departmentId;
    if (headId) departmentFilter.departmentHeads = headId;
    if (managerId) departmentFilter.projectManagers = managerId;

    // Find departments based on filter
    const departments = await Department.find(departmentFilter)
      .populate('employees') // <-- remove match: { isDeleted: false }
      .populate({ path: 'kpiCriteria.kpi', model: 'Kpi' });

    if (!departments.length) {
      return res.status(404).json({ error: "No departments found for the given filter" });
    }

    let orgStats = {
      totalDepartments: departments.length,
      totalEmployees: 0,
      totalTasks: 0,
      completedTasks: 0,
      avgCompletion: 0,
      completionRate: 0,
      departmentBreakdown: []
    };
    let totalCompletion = 0;
    for (const dept of departments) {
      // Get department stats using existing logic
      const fakeRes = {
        status: () => fakeRes,
        json: (data) => { orgStats.departmentBreakdown.push(data); }
      };
      await getDepartmentKpiStats({ params: { departmentId: dept._id }, query: { from, to } }, fakeRes);
      // Aggregate
      const last = orgStats.departmentBreakdown[orgStats.departmentBreakdown.length - 1];
      if (last && last.stats) {
        orgStats.totalEmployees += last.stats.totalEmployees || 0;
        orgStats.totalTasks += last.stats.totalTasks || 0;
        orgStats.completedTasks += last.stats.completedTasks || 0;
        totalCompletion += (last.stats.avgCompletion || 0) * (last.stats.totalTasks || 0);
      }
    }
    orgStats.completionRate = orgStats.totalTasks ? Number((orgStats.completedTasks / orgStats.totalTasks * 100).toFixed(2)) : 0;
    orgStats.avgCompletion = orgStats.totalTasks ? Number((totalCompletion / orgStats.totalTasks).toFixed(2)) : 0;
    res.json({ organization: orgStats });
  } catch (error) {
    console.error('Error fetching organization KPIs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /api/stats/overview?role=employee|departmentHead|manager[&departmentId=...][&managerId=...][&headId=...]
 * Returns a short overview for all users of the given role.
 */
const getOverviewStats = async (req, res) => {
  try {
    const { role, departmentId, page = 1, limit = 20, search } = req.query;

    let selectFields = "firstName lastName email department role";
    let users = [];
    let total = 0;
    let filter = {};

    // Build search filter if search is provided
    let searchFilter = {};
    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      searchFilter = {
        $or: [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex } } }
        ]
      };
    }

    if (departmentId) {
      // Fetch department and all related users
      const department = await Department.findById(departmentId)
        .populate({ path: "employees", select: selectFields })
        .lean();

      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }

      let userMap = new Map();

      // Employees
      (department.employees || []).forEach(emp => {
        if (emp && emp._id) userMap.set(String(emp._id), { ...emp, _role: emp.role || "Employee" });
      });

      // Department Head
      if (department.departmentHeads && department.departmentHeads.length > 0) {
        const heads = await Employee.find({ _id: { $in: department.departmentHeads } })
          .select(selectFields)
          .populate({ path: "department", select: "name" })
          .lean();
        heads.forEach(head => {
          if (head && head._id) userMap.set(String(head._id), { ...head, _role: "DepartmentHead" });
        });
      }

      // Managers
      if (Array.isArray(department.projectManagers) && department.projectManagers.length > 0) {
        const managers = await Employee.find({ _id: { $in: department.projectManagers } })
          .select(selectFields)
          .populate({ path: "department", select: "name" })
          .lean();
        managers.forEach(mgr => {
          if (mgr && mgr._id) userMap.set(String(mgr._id), { ...mgr, _role: "Manager" });
        });
      }

      let allUsers = Array.from(userMap.values());

      // If role is provided, filter users by role (_role for department context)
      if (role) {
        allUsers = allUsers.filter(u => {
          if (role === "Employee") return u._role === "Employee";
          if (role === "DepartmentHead") return u._role === "DepartmentHead";
          if (role === "Manager") return u._role === "Manager";
          return false;
        });
      }

      // If search is provided, filter users by search (firstName, lastName, email, fullName)
      if (search && typeof search === "string" && search.trim()) {
        const regex = new RegExp(search.trim(), "i");
        allUsers = allUsers.filter(u =>
          regex.test(u.firstName) ||
          regex.test(u.lastName) ||
          regex.test(u.email) ||
          regex.test(`${u.firstName} ${u.lastName}`)
        );
      }

      total = allUsers.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      users = allUsers.slice(skip, skip + parseInt(limit));
    } else if (role) {
      // Only role provided, return all users of that role (across all departments)
      filter.role = role;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const query = Object.keys(searchFilter).length ? { ...filter, ...searchFilter } : filter;
      users = await Employee.find(query)
        .select(selectFields)
        .populate({ path: "department", select: "name" })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
      total = await Employee.countDocuments(query);
      users = users.map(u => ({ ...u, _role: u.role || "Employee" }));
    } else {
      // No departmentId and no role: return all users
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const query = Object.keys(searchFilter).length ? searchFilter : {};
      users = await Employee.find(query)
        .select(selectFields)
        .populate({ path: "department", select: "name" })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
      total = await Employee.countDocuments(query);
      users = users.map(u => ({ ...u, _role: u.role || "Employee" }));
    }

    // For each user, get short stats (assigned/completed tasks, attendance, leaves, project count)
    const overview = await Promise.all(users.map(async (user) => {
      // Task stats
      const assignments = await TaskAssignment.find({ employee: user._id, isDeleted: false }).select("tasks").lean();
      const taskIds = assignments.flatMap(a => a.tasks);
      let assignedTasks = taskIds.length;
      let completedTasks = 0;
      if (assignedTasks > 0) {
        completedTasks = await Task.countDocuments({ _id: { $in: taskIds }, isCompleted: true, isDeleted: false });
      }
      // Attendance stats
      const presentDays = await Attendance.countDocuments({ employeeId: user._id, status: "present" });
      // Leave stats
      const approvedLeaves = await Leave.countDocuments({ employeeId: user._id, status: "approved" });

      // Project-based stats for all users
      let assignedProjects = 0;
      let completedProjects = 0;
      if (user._role === "DepartmentHead") {
        const projects = await Project.find({
          "departments.departmentHeads": user._id,
          isDeleted: false
        }).select("status employees");
        assignedProjects = projects.length;
        completedProjects = projects.filter(p => p.status === "Completed").length;
      } else if (user._role === "Manager") {
        const projects = await Project.find({
          managers: user._id,
          isDeleted: false
        }).select("status employees");
        assignedProjects = projects.length;
        completedProjects = projects.filter(p => p.status === "Completed").length;
      } else {
        // Employee: count projects where this user is in employees list
        const projects = await Project.find({
          "employees.employee": user._id,
          isDeleted: false
        }).select("status employees");
        assignedProjects = projects.length;
        completedProjects = projects.filter(p => p.status === "Completed").length;
      }

      // Get department name (if populated)
      let departmentName = "";
      if (user.department && typeof user.department === "object" && user.department.name) {
        departmentName = user.department.name;
      }

      return {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        department: user.department?._id || user.department || null,
        departmentName,
        role: user.role,
        assignedTasks,
        completedTasks,
        presentDays,
        approvedLeaves,
        assignedProjects,
        completedProjects
      };
    }));

    res.json({
      count: overview.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / (parseInt(limit) || 1)),
      data: overview
    });
  } catch (error) {
    console.error("Error fetching overview stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


// Controller to fetch the dashboard summary with filters
const getDashboardSummary = async (req, res) => {
  try {
    const { startDate, endDate, departmentIds = [], employeesId = [], userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await Employee.findById(userId).lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let departments = [];
    let employees = [];

    if (user.role === 'DepartmentHead') {
      departments = (await Department.find({ departmentHeads: user._id, isDeleted: false })
        .select('_id'))
        ?.map(dep => dep._id.toString());

      employees = (await Employee.find({ department: { $in: departments }, role: { $ne: "Admin" } })
        .select('_id'))
        ?.map(emp => emp._id.toString());
    } else if (user.role === 'Manager') {
      departments = (await Department.find({ projectManagers: user._id, isDeleted: false })
        .select('_id'))
        ?.map(dep => dep._id.toString());

      employees = (await Employee.find({ department: { $in: departments }, role: { $ne: "Admin" } })
        .select('_id'))
        ?.map(emp => emp._id.toString());

    } else if (user.role === 'Employee') {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    if( departmentIds && departmentIds.length > 0) {
      departments = departmentIds.split(",").map(id => id.trim()).filter(Boolean) || [];
    }
    if( employeesId && employeesId.length > 0) {
      employees = employeesId.split(",").map(id => id.trim()).filter(Boolean) || [];
    }

    // Date range filter using Luxon
    const dateFilter = {};
    let startDateTime, endDateTime;
    if (startDate && endDate) {
      startDateTime = Time.fromISO(startDate);
      endDateTime = Time.fromISO(endDate);
      
      if (!Time.isValidDateTime(startDateTime) || !Time.isValidDateTime(endDateTime)) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      
      if (Time.isAfter(startDateTime, endDateTime)) {
        return res.status(400).json({ error: "Start date must be before end date" });
      }
      
      dateFilter.date = { 
        $gte: Time.toJSDate(startDateTime.startOf("day")), 
        $lte: Time.toJSDate(endDateTime.endOf("day")) 
      };
    }

    // Employees filter
    const employeeFilter = employees.length > 0 ? { _id: { $in: employees } } : {};

    // --- Employees ---
    const employeesList = await Employee.find({
      ...employeeFilter,
      ...(departments.length > 0 ? { department: { $in: departments } } : {})
    }).select("_id firstName lastName department role status").lean();
    const employeeIds = employeesList.map(e => e._id);

    // --- Attendance ---
    const attendanceFilter = {
      ...dateFilter,
      ...(employeeIds.length > 0 ? { employeeId: { $in: employeeIds } } : {}),
      ...(departments.length > 0 ? { department: { $in: departments } } : {})
    };

    const attendanceRecords = await Attendance.find(attendanceFilter).lean();

    // --- Leaves ---
    const leaveFilter = {
      ...(employeeIds.length > 0 ? { employeeId: { $in: employeeIds } } : {}),
      ...(departments.length > 0 ? { departmentId: { $in: departments } } : {}),
      ...(startDate && endDate ? {
        $or: [
          { 
            startDate: { $lte: Time.toJSDate(endDateTime.endOf("day")) }, 
            endDate: { $gte: Time.toJSDate(startDateTime.startOf("day")) } 
          }
        ]
      } : {})
    };
    const leaveRecords = await Leave.find(leaveFilter).lean();

    // --- Projects ---
    const projectFilter = {
      isDeleted: false,
      ...(departments.length > 0 ? { "departments.department": { $in: departments } } : {})
    };
    const projects = await Project.find(projectFilter).lean();

    // --- Tasks ---
    const taskFilter = {
      isDeleted: false,
      ...(departments.length > 0 ? { department: { $in: departments } } : {})
    };
    const tasks = await Task.find(taskFilter).lean();

    // --- Department List ---
    const departmentFilter = {
      isDeleted: false,
      ...(departments.length > 0 ? { _id: { $in: departments } } : {})
    };
    const departmentList = await Department.find(departmentFilter).lean();

    // --- Calculations ---
    const totalEmployees = employeesList.length;
    const totalDepartments = departmentList.length || await Department.countDocuments({ isDeleted: false });
    const totalProjects = projects.length;
    const totalTasks = tasks.length;

    // Attendance stats
    const presentDays = attendanceRecords.filter(a => a.status === "present").length;
    const absentDays = attendanceRecords.filter(a => a.status === "absent").length;
    const lateDays = attendanceRecords.filter(a => a.status === "late").length;
    const onLeaveDays = attendanceRecords.filter(a => a.status === "on leave").length;

    // Work hours using Luxon
    const workedHoursArr = attendanceRecords
      .filter(a => a.checkIn && a.checkOut)
      .map(a => {
        const checkIn = Time.fromJSDate(a.checkIn);
        const checkOut = Time.fromJSDate(a.checkOut);
        return Time.diff(checkOut, checkIn, ["hours"]).hours;
      });
    const totalWorkedHours = workedHoursArr.reduce((sum, h) => sum + h, 0);
    const avgWorkHours = workedHoursArr.length ? totalWorkedHours / workedHoursArr.length : 0;

    // Leaves
    const totalLeaves = leaveRecords.length;
    const approvedLeaves = leaveRecords.filter(l => l.status === "approved").length;
    const pendingLeaves = leaveRecords.filter(l => l.status && l.status.startsWith("pending")).length;
    const rejectedLeaves = leaveRecords.filter(l => l.status === "rejected").length;

    // Project stats
    const completedProjects = projects.filter(p => p.status === "Completed").length;
    const inProgressProjects = projects.filter(p => p.status === "InProgress").length;
    const notStartedProjects = projects.filter(p => p.status === "NotStarted").length;

    // Task stats
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const inProgressTasks = tasks.filter(t => t.status === "In Progress").length;
    const todoTasks = tasks.filter(t => t.status === "To Do").length;
    const reviewTasks = tasks.filter(t => t.status === "In Review").length;

    // Department-wise stats (aggregate employee stats for attendance, work hours, leaves)
    const departmentStats = departmentList.map(dep => {
      const depEmployees = employeesList.filter(e => e.department && e.department.toString() === dep._id.toString());
      const depEmployeeIds = depEmployees.map(e => e._id);

      // Attendance and work hours (aggregate per employee)
      let depPresentDays = 0, depAbsentDays = 0, depOnLeaveDays = 0, depLateDays = 0, depWorkedHours = 0, depWorkHourCount = 0;
      depEmployeeIds.forEach(empId => {
        const empAttendance = attendanceRecords.filter(a => {
          const eid = a.employeeId?.toString ? a.employeeId.toString() : a.employeeId;
          return eid === empId.toString();
        });
        depPresentDays += empAttendance.filter(a => a.status === "present").length;
        depAbsentDays += empAttendance.filter(a => a.status === "absent").length;
        depOnLeaveDays += empAttendance.filter(a => a.status === "on leave").length;
        depLateDays += empAttendance.filter(a => a.status === "late").length;
        empAttendance.forEach(a => {
          if (a.checkIn && a.checkOut) {
            const checkIn = Time.fromJSDate(a.checkIn);
            const checkOut = Time.fromJSDate(a.checkOut);
            depWorkedHours += Time.diff(checkOut, checkIn, ["hours"]).hours;
            depWorkHourCount++;
          }
        });
      });
      const depAvgWorkHours = depWorkHourCount ? depWorkedHours / depWorkHourCount : 0;

      // Tasks and projects
      const depTasks = tasks.filter(t => t.department && t.department.toString() === dep._id.toString());
      const depProjects = projects.filter(p =>
        (p.departments || []).some(d => d.department && d.department.toString() === dep._id.toString())
      );

      // Leaves (aggregate per employee)
      let depTotalLeaves = 0, depApprovedLeaves = 0, depPendingLeaves = 0, depRejectedLeaves = 0;
      const depLeaveTypeStats = {};
      depEmployeeIds.forEach(empId => {
        const empLeaves = leaveRecords.filter(l => {
          const eid = l.employeeId?.toString ? l.employeeId.toString() : l.employeeId;
          return eid === empId.toString();
        });
        depTotalLeaves += empLeaves.length;
        depApprovedLeaves += empLeaves.filter(l => l.status === "approved").length;
        depPendingLeaves += empLeaves.filter(l => l.status && l.status.startsWith("pending")).length;
        depRejectedLeaves += empLeaves.filter(l => l.status === "rejected").length;
        empLeaves.forEach(l => {
          if (!depLeaveTypeStats[l.leaveType]) depLeaveTypeStats[l.leaveType] = { total: 0, approved: 0, rejected: 0 };
          depLeaveTypeStats[l.leaveType].total++;
          if (l.status === "approved") depLeaveTypeStats[l.leaveType].approved++;
          if (l.status === "rejected") depLeaveTypeStats[l.leaveType].rejected++;
        });
      });
      const depLeaveTypeArr = Object.entries(depLeaveTypeStats).map(([type, obj]) => ({
        type,
        total: obj.total,
        approved: obj.approved,
        rejected: obj.rejected
      }));

      return {
        departmentId: dep._id,
        departmentName: dep.name,
        totalEmployees: depEmployees.length,
        totalProjects: depProjects.length,
        totalTasks: depTasks.length,
        completedTasks: depTasks.filter(t => t.isCompleted).length,
        presentDays: depPresentDays,
        absentDays: depAbsentDays,
        onLeaveDays: depOnLeaveDays,
        lateDays: depLateDays,
        totalWorkedHours: Number(depWorkedHours.toFixed(2)),
        avgWorkHours: Number(depAvgWorkHours.toFixed(2)),
        totalLeaves: depTotalLeaves,
        approvedLeaves: depApprovedLeaves,
        pendingLeaves: depPendingLeaves,
        rejectedLeaves: depRejectedLeaves,
        leaveTypeStats: depLeaveTypeArr,
        employeeCount: depEmployees.length,
        projectCount: depProjects.length
      };
    });

    // Top 5 Employees by Attendance (most present days)
    const attendanceByEmployee = {};
    attendanceRecords.forEach(a => {
      const eid = a.employeeId?.toString ? a.employeeId.toString() : a.employeeId;
      if (!attendanceByEmployee[eid]) attendanceByEmployee[eid] = { present: 0, absent: 0, late: 0, onLeave: 0 };
      if (a.status === "present") attendanceByEmployee[eid].present++;
      if (a.status === "absent") attendanceByEmployee[eid].absent++;
      if (a.status === "late") attendanceByEmployee[eid].late++;
      if (a.status === "on leave") attendanceByEmployee[eid].onLeave++;
    });
    const topPresentEmployees = Object.entries(attendanceByEmployee)
      .sort((a, b) => b[1].present - a[1].present)
      .slice(0, 5)
      .map(([eid, stats]) => {
        const emp = employeesList.find(e => e._id.toString() === eid);
        return {
          employeeId: eid,
          name: emp ? `${emp.firstName} ${emp.lastName}` : "",
          presentDays: stats.present,
          absentDays: stats.absent,
          lateDays: stats.late,
          onLeaveDays: stats.onLeave
        };
      });

    // Top 5 Employees by Completed Tasks
    const completedTasksByEmployee = {};
    tasks.forEach(t => {
      if (t.isCompleted && t.createdBy) {
        const eid = t.createdBy.toString();
        if (!completedTasksByEmployee[eid]) completedTasksByEmployee[eid] = 0;
        completedTasksByEmployee[eid]++;
      }
    });
    const topCompletedTaskEmployees = Object.entries(completedTasksByEmployee)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([eid, count]) => {
        const emp = employeesList.find(e => e._id.toString() === eid);
        return {
          employeeId: eid,
          name: emp ? `${emp.firstName} ${emp.lastName}` : "",
          completedTasks: count
        };
      });

    // Top 5 Employees by Approved Leaves
    const approvedLeavesByEmployee = {};
    leaveRecords.forEach(l => {
      if (l.status === "approved" && l.employeeId) {
        const eid = l.employeeId.toString();
        if (!approvedLeavesByEmployee[eid]) approvedLeavesByEmployee[eid] = 0;
        approvedLeavesByEmployee[eid]++;
      }
    });
    const topApprovedLeaveEmployees = Object.entries(approvedLeavesByEmployee)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([eid, count]) => {
        const emp = employeesList.find(e => e._id.toString() === eid);
        return {
          employeeId: eid,
          name: emp ? `${emp.firstName} ${emp.lastName}` : "",
          approvedLeaves: count
        };
      });

    // Project completion rate
    const projectCompletionRate = totalProjects ? (completedProjects / totalProjects) * 100 : 0;
    // Task completion rate
    const taskCompletionRate = totalTasks ? (completedTasks / totalTasks) * 100 : 0;

    // --- Additional Stats for Graphs ---

    // 1. Employee count by department (for pie/bar chart)
    const employeeCountByDepartment = departmentList.map(dep => ({
      departmentId: dep._id,
      departmentName: dep.name,
      count: employeesList.filter(e => e.department && e.department.toString() === dep._id.toString()).length
    }));

    // 2. Task status distribution (for pie chart)
    const taskStatusDistribution = [
      { status: "To Do", count: tasks.filter(t => t.status === "To Do").length },
      { status: "In Progress", count: tasks.filter(t => t.status === "In Progress").length },
      { status: "In Review", count: tasks.filter(t => t.status === "In Review").length },
      { status: "Completed", count: tasks.filter(t => t.status === "Completed" || t.isCompleted).length }
    ];

    // 3. Project status distribution (for pie chart)
    const projectStatusDistribution = [
      { status: "NotStarted", count: projects.filter(p => p.status === "NotStarted").length },
      { status: "InProgress", count: projects.filter(p => p.status === "InProgress").length },
      { status: "Completed", count: projects.filter(p => p.status === "Completed").length },
      { status: "Reviewed", count: projects.filter(p => p.status === "Reviewed").length },
      { status: "OnHold", count: projects.filter(p => p.status === "OnHold").length },
      { status: "Cancelled", count: projects.filter(p => p.status === "Cancelled").length }
    ];

    // 4. Leaves by type (for pie/bar chart) - include approved/rejected
    const leaveTypeDistribution = {};
    leaveRecords.forEach(l => {
      if (!leaveTypeDistribution[l.leaveType]) leaveTypeDistribution[l.leaveType] = { total: 0, approved: 0, rejected: 0 };
      leaveTypeDistribution[l.leaveType].total++;
      if (l.status === "approved") leaveTypeDistribution[l.leaveType].approved++;
      if (l.status === "rejected") leaveTypeDistribution[l.leaveType].rejected++;
    });
    const leaveTypeStats = Object.entries(leaveTypeDistribution).map(([type, obj]) => ({
      type,
      total: obj.total,
      approved: obj.approved,
      rejected: obj.rejected
    }));

    // 5. Attendance trend by day (for line chart) using Luxon
    const attendanceTrend = {};
    attendanceRecords.forEach(a => {
      if (!a.date) return;
      const day = Time.fromJSDate(a.date).toISODate(); // Use Luxon for consistent date formatting
      if (!attendanceTrend[day]) attendanceTrend[day] = { present: 0, absent: 0, late: 0, onLeave: 0 };
      if (a.status === "present") attendanceTrend[day].present++;
      if (a.status === "absent") attendanceTrend[day].absent++;
      if (a.status === "late") attendanceTrend[day].late++;
      if (a.status === "on leave") attendanceTrend[day].onLeave++;
    });
    const attendanceTrendArr = Object.entries(attendanceTrend).map(([date, stats]) => ({
      date, ...stats
    })).sort((a, b) => a.date.localeCompare(b.date));

    // 6. Project count by department (for bar chart)
    const projectCountByDepartment = departmentList.map(dep => ({
      departmentId: dep._id,
      departmentName: dep.name,
      count: projects.filter(p =>
        (p.departments || []).some(d => d.department && d.department.toString() === dep._id.toString())
      ).length
    }));

    // 7. Task completion trend by day (for line chart) using Luxon
    const taskCompletionTrend = {};
    tasks.forEach(t => {
      if (t.isCompleted && t.completeAt) {
        const day = Time.fromJSDate(t.completeAt).toISODate(); // Use Luxon for consistent date formatting
        if (!taskCompletionTrend[day]) taskCompletionTrend[day] = 0;
        taskCompletionTrend[day]++;
      }
    });
    const taskCompletionTrendArr = Object.entries(taskCompletionTrend).map(([date, count]) => ({
      date, completedTasks: count
    })).sort((a, b) => a.date.localeCompare(b.date));

    // 8. Employee role distribution (for pie/bar chart)
    const roleDistribution = {};
    employeesList.forEach(e => {
      const role = e.role || "Employee";
      if (!roleDistribution[role]) roleDistribution[role] = 0;
      roleDistribution[role]++;
    });
    const roleDistributionArr = Object.entries(roleDistribution).map(([role, count]) => ({ role, count }));

    // 9. Average task completion per department (for bar chart)
    const avgTaskCompletionByDepartment = departmentList.map(dep => {
      const depTasks = tasks.filter(t => t.department && t.department.toString() === dep._id.toString());
      const completed = depTasks.filter(t => t.isCompleted).length;
      return {
        departmentId: dep._id,
        departmentName: dep.name,
        avgCompletion: depTasks.length ? Number((completed / depTasks.length * 100).toFixed(2)) : 0
      };
    });

    // 10. Employee status distribution (for pie/bar chart)
    const employeeStatusDistribution = {};
    employeesList.forEach(e => {
      const status = e.status || "Active";
      if (!employeeStatusDistribution[status]) employeeStatusDistribution[status] = 0;
      employeeStatusDistribution[status]++;
    });
    const employeeStatusArr = Object.entries(employeeStatusDistribution).map(([status, count]) => ({ status, count }));

    // --- Build final response ---
    const response = {
      summaryStats: {
        totalEmployees,
        totalDepartments,
        totalProjects,
        totalTasks,
        completedProjects,
        inProgressProjects,
        notStartedProjects,
        completedTasks,
        inProgressTasks,
        todoTasks,
        reviewTasks,
        presentDays,
        absentDays,
        lateDays,
        onLeaveDays,
        totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
        avgWorkHours: Number(avgWorkHours.toFixed(2)),
        totalLeaves,
        approvedLeaves,
        pendingLeaves,
        rejectedLeaves,
        projectCompletionRate: Number(projectCompletionRate.toFixed(2)),
        taskCompletionRate: Number(taskCompletionRate.toFixed(2)),
      },
      departmentStats,
      topPresentEmployees,
      topCompletedTaskEmployees,
      topApprovedLeaveEmployees,
      taskStatusDistribution,
      projectStatusDistribution,
      leaveTypeStats,
      attendanceTrend: attendanceTrendArr,
      taskCompletionTrend: taskCompletionTrendArr,
      roleDistribution: roleDistributionArr,
      avgTaskCompletionByDepartment,
      employeeStatusArr,
      projectCountByDepartment,
      employeeCountByDepartment,
    };

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


module.exports = {
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
};
