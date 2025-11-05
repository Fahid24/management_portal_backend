const mongoose = require("mongoose");
const ShortLeave = require("../model/ShortLeaveSchema"); // Import your ShortLeave model
const Employee = require("../model/employeeSchema");
const AdminConfig = require("../model/AdminConfigSchema");
const Time = require("../utils/time");
const sendEmailUtil = require("../utils/emailService");
const { sendNotificationToUsers } = require("../utils/sendNotificationToUsers");
const { shortLeaveReqTemplate } = require("../utils/emailTemplates");
const Department = require("../model/departmentSchema");
const Event = require("../model/eventSchema");
const { production } = require("../baseUrl");

async function getShortLeaveRequests(req, res) {
    try {
        const {
            userId,
            departmentIds,
            employeeIds,
            status,
            startDate,
            endDate,
            page = 1,
            limit = 10
        } = req.query;

        // Validate required parameters
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        // Find the logged-in user to determine their role
        const loggedInUser = await Employee.findById(userId);
        if (!loggedInUser) {
            return res.status(404).json({ error: "User not found" });
        }

        const userRole = loggedInUser.role;

        // Build base query
        let query = {};

        // Role-based access control
        if (userRole === "Admin") {
            // Admin can see all requests - no additional filtering needed
        } else if (userRole === "DepartmentHead") {
            // DepartmentHead can only see requests from employees in departments they manage

            // Step 1: Find departments where this user is assigned as department head
            const managedDepartments = await Department.find({
                departmentHeads: userId
            }).select('_id');

            if (managedDepartments.length === 0) {
                return res.status(403).json({ error: "No departments found under your management" });
            }

            const managedDeptIds = managedDepartments.map(dept => dept._id);

            // Step 2: Find employees in those departments (excluding Admins)
            const employeesInManagedDepts = await Employee.find({
                department: { $in: managedDeptIds },
                role: { $ne: "Admin" } // Explicitly exclude Admin role employees
            }).select('_id role');

            const managedEmployeeIds = employeesInManagedDepts.map(emp => emp._id);

            if (managedEmployeeIds.length === 0) {
                return res.status(403).json({ error: "No employees found under your department management" });
            }

            // Filter short leave requests to only those from managed employees
            query.employeeId = { $in: managedEmployeeIds };
        } else {
            // Employee/Manager can only see their own requests
            query.employeeId = userId;
        }

        // Apply additional filters (but respect role-based restrictions)
        if (departmentIds) {
            const deptIdArray = departmentIds.split(',').map(id => id.trim()).filter(Boolean);
            if (deptIdArray.length > 0) {
                if (userRole === "Admin") {
                    // Admin can filter by any departments
                    const employeesInFilteredDepts = await Employee.find({
                        department: { $in: deptIdArray }
                    }).select('_id');

                    const filteredEmployeeIds = employeesInFilteredDepts.map(emp => emp._id);
                    query.employeeId = { $in: filteredEmployeeIds };
                } else if (userRole === "DepartmentHead") {
                    // DepartmentHead: filter must be combined with their managed employees (excluding Admins)
                    const employeesInFilteredDepts = await Employee.find({
                        department: { $in: deptIdArray },
                        _id: { $in: query.employeeId.$in },
                        role: { $ne: "Admin" } // Exclude Admin employees
                    }).select('_id');

                    const filteredEmployeeIds = employeesInFilteredDepts.map(emp => emp._id);
                    query.employeeId = { $in: filteredEmployeeIds };
                }
                // For Employee/Manager, ignore department filter since they can only see their own
            }
        }

        if (employeeIds) {
            const empIdArray = employeeIds.split(',').map(id => id.trim()).filter(Boolean);
            if (empIdArray.length > 0) {
                if (userRole === "Admin") {
                    // Admin can filter by any employees
                    query.employeeId = { $in: empIdArray };
                } else if (userRole === "DepartmentHead") {
                    // DepartmentHead: only employees they manage AND in the filter (excluding Admins)
                    const allowedEmployees = query.employeeId.$in.filter(id =>
                        empIdArray.includes(id.toString())
                    );
                    
                    // Double-check to exclude Admin employees from the filtered list
                    const nonAdminEmployees = await Employee.find({
                        _id: { $in: allowedEmployees },
                        role: { $ne: "Admin" }
                    }).select('_id');
                    
                    query.employeeId = { $in: nonAdminEmployees.map(emp => emp._id) };
                } else {
                    // Employee/Manager: only their own ID if it's in the filter
                    if (empIdArray.includes(userId)) {
                        query.employeeId = userId;
                    } else {
                        // If their ID is not in the filter, return empty results
                        return res.status(200).json({
                            success: true,
                            data: [],
                            pagination: {
                                currentPage: parseInt(page),
                                totalPages: 0,
                                totalCount: 0,
                                limit: parseInt(limit),
                                hasNextPage: false,
                                hasPrevPage: false
                            }
                        });
                    }
                }
            }
        }

        if (status) {
            const statusArray = status.split(',').map(s => s.trim()).filter(Boolean);
            if (statusArray.length > 0) {
                const validStatuses = ["pending_dept_head", "pending_admin", "approved", "rejected"];
                const filteredStatuses = statusArray.filter(s => validStatuses.includes(s));
                if (filteredStatuses.length > 0) {
                    query.status = { $in: filteredStatuses };
                }
            }
        }

        // Date range filter
        if (startDate || endDate) {
            query.date = {};

            if (startDate) {
                const startDT = Time.fromISO(startDate).startOf("day");
                if (Time.isValidDateTime(startDT)) {
                    query.date.$gte = Time.toJSDate(startDT);
                }
            }

            if (endDate) {
                const endDT = Time.fromISO(endDate).endOf("day");
                if (Time.isValidDateTime(endDT)) {
                    query.date.$lte = Time.toJSDate(endDT);
                }
            }
        }

        // Pagination
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, Math.min(100, parseInt(limit))); // Max 100 per page
        const skip = (pageNum - 1) * limitNum;

        // Execute query with population
        const [requests, totalCount] = await Promise.all([
            ShortLeave.find(query)
                .populate({
                    path: 'employeeId',
                    select: 'firstName lastName email role photoUrl',
                    populate: {
                        path: 'department',
                        select: 'name'
                    }
                })
                .populate({
                    path: 'departmentId',
                    select: 'name'
                })
                .sort({ date: -1 }) // Most recent first
                .skip(skip)
                .limit(limitNum)
                .lean(),

            ShortLeave.countDocuments(query)
        ]);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / limitNum);

        res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalCount,
                limit: limitNum,
            },
        });

    } catch (error) {
        console.error("❌ getShortLeaveRequests Error:", error);
        res.status(500).json({ error: error.message });
    }
}

async function requestShortLeave(req, res) {
    try {
        const {
            employeeId,
            date: dateISO,
            startTime,
            endTime,
            reason,
            departmentId
        } = req.body;

        // Validate and parse date
        const dateDT = Time.fromISO(dateISO).startOf("day");
        if (!Time.isValidDateTime(dateDT)) {
            return res.status(400).json({ error: "Invalid date" });
        }

        const dateJS = Time.toJSDate(dateDT);

        // Check if the date is a holiday or weekend
        const holidayOrWeekendEvents = await Event.aggregate([
            { $match: { type: { $in: ["holiday", "weekend"] } } },
            {
                $addFields: {
                    startDateParsed: { $dateFromString: { dateString: "$startDate" } },
                    endDateParsed: { $dateFromString: { dateString: "$endDate" } }
                }
            },
            {
                $match: {
                    startDateParsed: { $lte: dateJS },
                    endDateParsed: { $gte: dateJS }
                }
            }
        ]);

        if (holidayOrWeekendEvents.length > 0) {
            const eventType = holidayOrWeekendEvents[0].type;
            return res.status(400).json({ 
                error: `Cannot apply for short leave on ${eventType}. Short leave requests are only allowed on working days.`
            });
        }

        // Validate time format (HH:mm)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({ error: "Invalid start or end time format (expected HH:mm)" });
        }

        // Fetch employee and department heads
        const employee = await Employee.findById(employeeId).populate({
            path: 'department',
            populate: { path: 'departmentHeads' }
        });

        if (!employee) {
            return res.status(404).json({ error: "Employee not found" });
        }

        // Get employee shift (default to "Day" if not specified)
        const employeeShift = employee.shift || "Day";

        // Get admin config for working hours validation
        const adminConfig = await AdminConfig.findOne().lean();
        if (!adminConfig) {
            return res.status(500).json({ error: "Admin configuration not found. Please contact administrator." });
        }

        // Convert start and end time to minutes for duration validation
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        let startTotalMin = startHour * 60 + startMin;
        let endTotalMin = endHour * 60 + endMin;

        // Validate working hours based on employee shift
        if (employeeShift === "Night") {
            const nightShiftHours = adminConfig.nightShiftWorkingHours;
            if (!nightShiftHours) {
                return res.status(500).json({ error: "Night shift working hours not configured. Please contact administrator." });
            }

            const [nightStartHour, nightStartMin] = nightShiftHours.start.split(":").map(Number);
            const [nightEndHour, nightEndMin] = nightShiftHours.end.split(":").map(Number);
            const nightStartTotalMin = nightStartHour * 60 + nightStartMin;
            let nightEndTotalMin = nightEndHour * 60 + nightEndMin;

            // Handle cross-midnight working hours
            if (nightEndTotalMin < nightStartTotalMin) {
                nightEndTotalMin += 24 * 60; // Add 24 hours for next day
                
                // For night shift cross-midnight, allow times that span midnight
                if (endTotalMin < startTotalMin) {
                    endTotalMin += 24 * 60; // Add 24 hours for next day
                }

                // Validate that short leave times are within night shift working hours
                const isStartInRange = (startTotalMin >= nightStartTotalMin) || (startTotalMin <= nightEndTotalMin - 24 * 60);
                const isEndInRange = (endTotalMin >= nightStartTotalMin) || (endTotalMin <= nightEndTotalMin);

                if (!isStartInRange || !isEndInRange) {
                    return res.status(400).json({ 
                        error: `Short leave times must be within your night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                    });
                }
            } else {
                // Normal night shift (same day)
                if (startTotalMin < nightStartTotalMin || startTotalMin > nightEndTotalMin || 
                    endTotalMin < nightStartTotalMin || endTotalMin > nightEndTotalMin) {
                    return res.status(400).json({ 
                        error: `Short leave times must be within your night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                    });
                }
            }
        } else {
            // Day shift validation
            const dayShiftHours = adminConfig.workingHours;
            if (!dayShiftHours) {
                return res.status(500).json({ error: "Day shift working hours not configured. Please contact administrator." });
            }

            const [dayStartHour, dayStartMin] = dayShiftHours.start.split(":").map(Number);
            const [dayEndHour, dayEndMin] = dayShiftHours.end.split(":").map(Number);
            const dayStartTotalMin = dayStartHour * 60 + dayStartMin;
            const dayEndTotalMin = dayEndHour * 60 + dayEndMin;

            // Regular day shift validation - end time must be after start time on same day
            if (startTotalMin >= endTotalMin) {
                return res.status(400).json({ error: "End time must be after start time" });
            }

            // Validate that short leave times are within day shift working hours
            if (startTotalMin < dayStartTotalMin || startTotalMin > dayEndTotalMin || 
                endTotalMin < dayStartTotalMin || endTotalMin > dayEndTotalMin) {
                return res.status(400).json({ 
                    error: `Short leave times must be within your day shift working hours (${dayShiftHours.start} - ${dayShiftHours.end})` 
                });
            }
        }

        // Calculate duration in hours
        const durationMinutes = endTotalMin - startTotalMin;
        const durationHours = (durationMinutes / 60).toFixed(2);

        const deptHeadIds = employee?.department?.departmentHeads?.map(head => head._id) || [];

        // Create ShortLeave request
        const shortLeaveRequest = new ShortLeave({
            employeeId,
            departmentId,
            date: dateJS,
            startTime,
            endTime,
            durationHours,
            reason,
            status: "pending_dept_head",
            deptHeadIds,
            deptHeadAction: null,
            deptHeadComment: null,
            deptHeadActionAt: null,
            adminId: null,
            adminAction: null,
            adminComment: null,
            adminActionAt: null
        });

        await shortLeaveRequest.save();

        // Send notification to department heads
        if (deptHeadIds.length > 0) {
            const shiftInfo = employeeShift === "Night" ? " (Night Shift)" : "";
            await sendNotificationToUsers({
                userIds: deptHeadIds,
                type: "short_leave",
                title: "New Short Leave Request",
                message: `Short leave request from ${employee.firstName} ${employee.lastName}${shiftInfo}`
            });
        }

        // Email notification
        const shiftInfo = employeeShift === "Night" ? " (Night Shift Employee)" : "";
        const emailBody = shortLeaveReqTemplate
            .replaceAll('$employeeName', `${employee.firstName} ${employee.lastName}${shiftInfo}`)
            .replaceAll('$departmentName', employee.department?.name || 'N/A')
            .replaceAll('$leaveType', "Short Leave")
            .replaceAll('$date', dateJS.toDateString())
            .replaceAll('$startTime', startTime)
            .replaceAll('$endTime', endTime)
            .replaceAll('$reason', reason || "No reason provided");

        await sendEmailUtil(
            production ? "admin.portal@yopmail.com.com" : "fahidhasanfuad20018@gmail.com",
            `Short Leave Request from ${employee.firstName} ${employee.lastName}${shiftInfo}`,
            emailBody
        );

        res.status(201).json({ 
            message: "Short leave request submitted", 
            shortLeaveRequest: {
                ...shortLeaveRequest.toObject(),
                employeeShift: employeeShift
            }
        });

    } catch (error) {
        console.error("❌ Short leave request error:", error);
        res.status(500).json({ error: error.message });
    }
}

async function handleShortLeaveAction(req, res) {
    try {
        const { id } = req.params;
        const {
            role,         // "DepartmentHead" | "Admin"
            action,       // "approved" | "rejected"
            comment,
            date: dateISO,
            startTime,
            endTime
        } = req.body;

        // Validate role and action
        if (!["DepartmentHead", "Admin"].includes(role)) {
            return res.status(400).json({ error: "Invalid role (must be DepartmentHead or Admin)" });
        }

        if (!["approved", "rejected"].includes(action)) {
            return res.status(400).json({ error: "Invalid action (must be approved or rejected)" });
        }

        const leave = await ShortLeave.findById(id).populate({
            path: 'employeeId',
            select: 'firstName lastName email',
        });

        if (!leave) return res.status(404).json({ error: "Short leave request not found" });

        // Check valid state for role
        if (role === "DepartmentHead" && leave.status !== "pending_dept_head") {
            return res.status(400).json({ error: "Short leave is not pending DepartmentHead approval" });
        }

        // if (role === "Admin" && leave.status !== "pending_admin") {
        //     return res.status(400).json({ error: "Short leave is not pending Admin approval" });
        // }

        // Optional: Allow time edit if approved
        if (action === "approved" && startTime && endTime) {
            const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

            if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
                return res.status(400).json({ error: "Invalid time format (HH:mm)" });
            }

            // Get employee shift information and admin config for proper validation
            const employee = await Employee.findById(leave.employeeId);
            const employeeShift = employee?.shift || "Day";
            
            const adminConfig = await AdminConfig.findOne().lean();
            if (!adminConfig) {
                return res.status(500).json({ error: "Admin configuration not found. Please contact administrator." });
            }

            const [sh, sm] = startTime.split(":").map(Number);
            const [eh, em] = endTime.split(":").map(Number);
            let startTotalMin = sh * 60 + sm;
            let endTotalMin = eh * 60 + em;

            // Validate working hours based on employee shift
            if (employeeShift === "Night") {
                const nightShiftHours = adminConfig.nightShiftWorkingHours;
                if (!nightShiftHours) {
                    return res.status(500).json({ error: "Night shift working hours not configured. Please contact administrator." });
                }

                const [nightStartHour, nightStartMin] = nightShiftHours.start.split(":").map(Number);
                const [nightEndHour, nightEndMin] = nightShiftHours.end.split(":").map(Number);
                const nightStartTotalMin = nightStartHour * 60 + nightStartMin;
                let nightEndTotalMin = nightEndHour * 60 + nightEndMin;

                // Handle cross-midnight working hours
                if (nightEndTotalMin < nightStartTotalMin) {
                    nightEndTotalMin += 24 * 60; // Add 24 hours for next day
                    
                    // For night shift cross-midnight, allow times that span midnight
                    if (endTotalMin < startTotalMin) {
                        endTotalMin += 24 * 60; // Add 24 hours for next day
                    }

                    // Validate that short leave times are within night shift working hours
                    const isStartInRange = (startTotalMin >= nightStartTotalMin) || (startTotalMin <= nightEndTotalMin - 24 * 60);
                    const isEndInRange = (endTotalMin >= nightStartTotalMin) || (endTotalMin <= nightEndTotalMin);

                    if (!isStartInRange || !isEndInRange) {
                        return res.status(400).json({ 
                            error: `Short leave times must be within night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                        });
                    }
                } else {
                    // Normal night shift (same day)
                    if (startTotalMin < nightStartTotalMin || startTotalMin > nightEndTotalMin || 
                        endTotalMin < nightStartTotalMin || endTotalMin > nightEndTotalMin) {
                        return res.status(400).json({ 
                            error: `Short leave times must be within night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                        });
                    }
                }
            } else {
                // Day shift validation
                const dayShiftHours = adminConfig.workingHours;
                if (!dayShiftHours) {
                    return res.status(500).json({ error: "Day shift working hours not configured. Please contact administrator." });
                }

                const [dayStartHour, dayStartMin] = dayShiftHours.start.split(":").map(Number);
                const [dayEndHour, dayEndMin] = dayShiftHours.end.split(":").map(Number);
                const dayStartTotalMin = dayStartHour * 60 + dayStartMin;
                const dayEndTotalMin = dayEndHour * 60 + dayEndMin;

                // Regular day shift validation - end time must be after start time on same day
                if (startTotalMin >= endTotalMin) {
                    return res.status(400).json({ error: "endTime must be after startTime" });
                }

                // Validate that short leave times are within day shift working hours
                if (startTotalMin < dayStartTotalMin || startTotalMin > dayEndTotalMin || 
                    endTotalMin < dayStartTotalMin || endTotalMin > dayEndTotalMin) {
                    return res.status(400).json({ 
                        error: `Short leave times must be within day shift working hours (${dayShiftHours.start} - ${dayShiftHours.end})` 
                    });
                }
            }

            // Calculate duration
            const durationMinutes = endTotalMin - startTotalMin;
            const durationHours = (durationMinutes / 60).toFixed(2);

            leave.startTime = startTime;
            leave.endTime = endTime;
            leave.durationHours = durationHours;
        }

        if (action === "approved" && dateISO) {
            const dateDT = Time.fromISO(dateISO).startOf("day");
            leave.date = Time.toJSDate(dateDT);
        }

        const now = Time.toJSDate(Time.now());

        // Apply approval/rejection logic
        if (role === "DepartmentHead") {
            leave.deptHeadAction = action;
            leave.deptHeadComment = comment;
            leave.deptHeadActionAt = now;
            leave.status = action === "approved" ? "pending_admin" : "rejected";
        }

        if (role === "Admin") {
            leave.adminAction = action;
            leave.adminComment = comment;
            leave.adminActionAt = now;
            leave.status = action === "approved" ? "approved" : "rejected";
        }

        await leave.save();

        const emp = leave.employeeId;

        // Notify employee
        await sendNotificationToUsers({
            userIds: [emp._id],
            type: "short_leave",
            title: `Short Leave ${action} by ${role}`,
            message: `Your short leave request was ${action} by ${role}.`
        });

        // Notify admin if DepartmentHead approved
        if (role === "DepartmentHead" && action === "approved") {
            const admins = await Employee.find({ role: "Admin" });
            const adminIds = admins.map(admin => admin?._id.toString());
            if (adminIds.length > 0) {
                await sendNotificationToUsers({
                    userIds: adminIds,
                    type: "short_leave",
                    title: "Short Leave Pending Admin Approval",
                    message: `Short leave request from ${emp.firstName} ${emp.lastName} needs your review.`,
                });
            }
        }

        res.status(200).json({
            message: `Short leave ${action} by ${role}`,
            leave,
        });

    } catch (error) {
        console.error("❌ handleShortLeaveAction Error:", error);
        res.status(500).json({ error: error.message });
    }
}

async function getSingleShortLeave(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid short leave request ID" });
        }

        const leave = await ShortLeave.findById(id).populate({
            path: 'employeeId',
            select: 'firstName lastName email photoUrl department',
            populate: { path: 'department', select: 'name' }
        });

        if (!leave) return res.status(404).json({ error: "Short leave request not found" });

        res.status(200).json({ leave });
    } catch (error) {
        console.error("❌ Get Single Short Leave Error:", error);
        res.status(500).json({ error: error.message });
    }
}

async function updateShortLeave(req, res) {
    try {
        const { id } = req.params;
        const { date: dateISO, startTime, endTime, reason, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid short leave request ID" });
        }

        const leave = await ShortLeave.findById(id);
        if (!leave) return res.status(404).json({ error: "Short leave request not found" });

        // Get employee shift information and admin config for proper validation
        const employee = await Employee.findById(leave.employeeId);
        const employeeShift = employee?.shift || "Day";

        const adminConfig = await AdminConfig.findOne().lean();
        if (!adminConfig) {
            return res.status(500).json({ error: "Admin configuration not found. Please contact administrator." });
        }

        // Validate time format (HH:mm)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (startTime && !timeRegex.test(startTime)) {
            return res.status(400).json({ error: "Invalid start time format (HH:mm)" });
        }
        if (endTime && !timeRegex.test(endTime)) {
            return res.status(400).json({ error: "Invalid end time format (HH:mm)" });
        }

        if (startTime && endTime) {
            const [sh, sm] = startTime.split(":").map(Number);
            const [eh, em] = endTime.split(":").map(Number);
            let startTotalMin = sh * 60 + sm;
            let endTotalMin = eh * 60 + em;

            // Validate working hours based on employee shift
            if (employeeShift === "Night") {
                const nightShiftHours = adminConfig.nightShiftWorkingHours;
                if (!nightShiftHours) {
                    return res.status(500).json({ error: "Night shift working hours not configured. Please contact administrator." });
                }

                const [nightStartHour, nightStartMin] = nightShiftHours.start.split(":").map(Number);
                const [nightEndHour, nightEndMin] = nightShiftHours.end.split(":").map(Number);
                const nightStartTotalMin = nightStartHour * 60 + nightStartMin;
                let nightEndTotalMin = nightEndHour * 60 + nightEndMin;

                // Handle cross-midnight working hours
                if (nightEndTotalMin < nightStartTotalMin) {
                    nightEndTotalMin += 24 * 60; // Add 24 hours for next day
                    
                    // For night shift cross-midnight, allow times that span midnight
                    if (endTotalMin < startTotalMin) {
                        endTotalMin += 24 * 60; // Add 24 hours for next day
                    }

                    // Validate that short leave times are within night shift working hours
                    const isStartInRange = (startTotalMin >= nightStartTotalMin) || (startTotalMin <= nightEndTotalMin - 24 * 60);
                    const isEndInRange = (endTotalMin >= nightStartTotalMin) || (endTotalMin <= nightEndTotalMin);

                    if (!isStartInRange || !isEndInRange) {
                        return res.status(400).json({ 
                            error: `Short leave times must be within night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                        });
                    }
                } else {
                    // Normal night shift (same day)
                    if (startTotalMin < nightStartTotalMin || startTotalMin > nightEndTotalMin || 
                        endTotalMin < nightStartTotalMin || endTotalMin > nightEndTotalMin) {
                        return res.status(400).json({ 
                            error: `Short leave times must be within night shift working hours (${nightShiftHours.start} - ${nightShiftHours.end})` 
                        });
                    }
                }
            } else {
                // Day shift validation
                const dayShiftHours = adminConfig.workingHours;
                if (!dayShiftHours) {
                    return res.status(500).json({ error: "Day shift working hours not configured. Please contact administrator." });
                }

                const [dayStartHour, dayStartMin] = dayShiftHours.start.split(":").map(Number);
                const [dayEndHour, dayEndMin] = dayShiftHours.end.split(":").map(Number);
                const dayStartTotalMin = dayStartHour * 60 + dayStartMin;
                const dayEndTotalMin = dayEndHour * 60 + dayEndMin;

                // Regular day shift validation - end time must be after start time on same day
                if (startTotalMin >= endTotalMin) {
                    return res.status(400).json({ error: "End time must be after start time" });
                }

                // Validate that short leave times are within day shift working hours
                if (startTotalMin < dayStartTotalMin || startTotalMin > dayEndTotalMin || 
                    endTotalMin < dayStartTotalMin || endTotalMin > dayEndTotalMin) {
                    return res.status(400).json({ 
                        error: `Short leave times must be within day shift working hours (${dayShiftHours.start} - ${dayShiftHours.end})` 
                    });
                }
            }

            // Calculate duration
            const durationMinutes = endTotalMin - startTotalMin;
            const durationHours = (durationMinutes / 60).toFixed(2);

            leave.startTime = startTime;
            leave.endTime = endTime;
            leave.durationHours = durationHours;
        }

        // Validate date
        if (dateISO) {
            const dateDT = Time.fromISO(dateISO).startOf("day");
            if (!Time.isValidDateTime(dateDT)) {
                return res.status(400).json({ error: "Invalid date" });
            }
            leave.date = Time.toJSDate(dateDT);
        }

        if (reason) leave.reason = reason;

        if (status) {
            const validStatuses = ["pending_dept_head", "pending_admin", "approved", "rejected"];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: "Invalid status" });
            }
            leave.status = status;
        }

        await leave.save();

        // Notify employee about the update
        await sendNotificationToUsers({
            userIds: [leave.employeeId],
            type: "short_leave",
            title: "Short Leave Request Updated",
            message: `Your short leave request has been updated. Status: ${status || leave.status}`
        });

        res.status(200).json({ message: "Short leave request updated successfully", leave });
    } catch (error) {
        console.error("❌ Update Short Leave Error:", error);
        res.status(500).json({ error: error.message });
    }
}

async function deleteLeaveRequest(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "Invalid short leave request ID" });
        }

        const leave = await ShortLeave.findByIdAndDelete(id);
        if (!leave) return res.status(404).json({ error: "Short leave request not found" });

        res.status(200).json({ message: "Short leave request deleted successfully" });
    } catch (error) {
        console.error("❌ Delete Short Leave Error:", error);
        res.status(500).json({ error: error.message });
    }
}



module.exports = {
    getShortLeaveRequests,
    requestShortLeave,
    handleShortLeaveAction,
    getSingleShortLeave,
    updateShortLeave,
    deleteLeaveRequest,
};
