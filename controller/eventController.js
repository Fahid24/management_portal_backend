const Event = require('../model/eventSchema');
const Employee = require('../model/employeeSchema');
const Department = require('../model/departmentSchema');
const Time = require('../utils/time');

const validEnums = {
    notificationType: ['email', 'sms', 'push'],
    notificationTiming: ['5_minutes_before', '30_minutes_before', '1_hour_before', '1_day_before'],
    frequency: ['daily', 'weekly', 'monthly', 'yearly'],
    type: ['party', 'meeting', 'training', 'discussion', 'holiday', 'conference', 'workshop', 'birthday', 'webinar', 'other'],
    priority: ['low', 'medium', 'high', 'urgent'],
    status: ['draft', 'scheduled', 'confirmed', 'cancelled', 'completed'],
    targetType: ['all', 'department', 'role', 'user'],
    createdByRole: ['Admin', 'Manager', 'DepartmentHead', 'Employee']
};

const hasCreatePermission = (role, targetType) => {
    const permissions = {
        Admin: ['all', 'department', 'role', 'user', 'private'],
        DepartmentHead: ['department', 'role', 'user', 'private'],
        Manager: ['role', 'user', 'private'],
        Employee: ['user', 'private'],
    };
    return permissions[role]?.includes(targetType);
};

const getEvents = async (req, res) => {
    try {
        // Accept only userId as param, fetch user details
        const { userId, includePrivate = true, startDate, endDate, type, status, page = 1, limit = 10 } = req.query;

        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        // Fetch user details
        const user = await Employee.findById(userId).select('role department').lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const userRole = user.role;
        const department = user.department ? user.department.toString() : null;

        const baseFilters = [];

        if (userRole === 'Admin') {
            baseFilters.push({
                $or: [
                    { isPrivate: false },
                    ...(includePrivate === 'true' ? [{ createdBy: userId, isPrivate: true }] : [])
                ]
            });
        } else {
            const roles = userRole === "DepartmentHead" ?['Manager', 'DepartmentHead', 'Employee'] : userRole === "Manager" ? ['Manager', 'Employee'] : [userRole];
            baseFilters.push({
                $or: [
                    { targetType: 'all', isPrivate: false },
                    { targetType: 'department', targetValues: { $in: [department] }, isPrivate: false },
                    { targetType: 'role', targetValues: { $in: roles }, isPrivate: false },
                    { targetType: 'user', targetValues: { $in: [userId] }, isPrivate: false },
                    ...(includePrivate === 'true' ? [{ createdBy: userId, isPrivate: true }] : [])
                ]
            });
            baseFilters.push({
                $or: [
                    { createdBy: userId },         
                    { status: { $ne: 'draft' } }          
                ]
            });
        }

        if (startDate && endDate && (startDate !== "null" || endDate !== "null")) {
            // Since startDate and endDate are stored as strings, we need to handle string comparison
            const fromDT = Time.fromISO(startDate).startOf('day');
            const toDT = Time.fromISO(endDate).endOf('day');

            if (!Time.isValidDateTime(fromDT) || !Time.isValidDateTime(toDT)) {
                return res.status(400).json({ message: 'Invalid startDate or endDate format' });
            }

            // Convert to ISO date strings for comparison with database string fields
            const fromDateStr = Time.toISODate(fromDT);
            const toDateStr = Time.toISODate(toDT);

            baseFilters.push({
                $or: [
                    // Event starts within the range
                    { startDate: { $gte: fromDateStr, $lte: toDateStr } },
                    // Event ends within the range
                    { endDate: { $gte: fromDateStr, $lte: toDateStr } },
                    // Event spans the entire range (starts before and ends after)
                    { startDate: { $lte: fromDateStr }, endDate: { $gte: toDateStr } }
                ]
            });
        }
        if (type) baseFilters.push({ type });
        if (status) baseFilters.push({ status });

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Main query
        let events = await Event.find({ $and: baseFilters })
            .sort({ startDate: 1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate({ path: 'createdBy', select: 'firstName lastName email' })
            .lean();

        // Populate targetValues based on targetType
        for (let event of events) {
            if (event.targetType === 'department') {
                if (event.targetValues && event.targetValues.length > 0) {
                    if (event.targetValues.length === 1 && (event.targetValues[0] === 'all' || event.targetValues[0] === 'AllDepartment')) {
                        event.targetValuesPopulated = [{ name: 'All Departments' }];
                    } else {
                        const departments = await Department.find({ _id: { $in: event.targetValues } })
                            .select('name description')
                            .lean();
                        event.targetValuesPopulated = departments;
                    }
                }
            } else if (event.targetType === 'user') {
                if (event.targetValues && event.targetValues.length > 0) {
                    if (event.targetValues.length === 1 && (event.targetValues[0] === 'all' || event.targetValues[0] === 'AllEmployee')) {
                        event.targetValuesPopulated = [{ name: 'All Employees' }];
                    } else {
                        const employees = await Employee.find({ _id: { $in: event.targetValues } })
                            .select('firstName lastName email')
                            .lean();
                        event.targetValuesPopulated = employees;
                    }
                }
            } else if (event.targetType === 'role') {
                if (event.targetValues && event.targetValues.length > 0) {
                    event.targetValuesPopulated = event.targetValues.map(role =>
                        typeof role === 'string'
                            ? role.charAt(0).toUpperCase() + role.slice(1)
                            : role
                    );
                }
            } else if (event.targetType === 'all') {
                event.targetValuesPopulated = [{ name: 'All' }];
            }
        }

        const total = await Event.countDocuments({ $and: baseFilters });

        res.status(200).json({ events, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch events', error: err.message });
    }
};

const getSingleEvent = async (req, res) => {
    try {
        const { id } = req.params;

        const event = await Event.findById(id);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        res.status(200).json({ event });
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve event', error: err.message });
    }
};

const createEvent = async (req, res) => {
    try {
        const {
            title, description, type, startDate, endDate,
            startTime, endTime, allDay, location, attendees,
            priority, status, targetType = 'all', targetValues,
            isPrivate, createdBy, createdByRole, metadata, isRecurring
        } = req.body;

        if (!title || !type || !startDate || !endDate) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // if(!isPrivate && (!targetType || !Array.isArray(targetValues))) {
        //     return res.status(400).json({ message: 'Invalid targetType or targetValues' });
        // }

        // if (!validEnums.type.includes(type)) return res.status(400).json({ message: `Invalid type: ${type}` });
        // if (priority && !validEnums.priority.includes(priority)) return res.status(400).json({ message: `Invalid priority: ${priority}` });
        // if (status &&!validEnums.status.includes(status)) return res.status(400).json({ message: `Invalid status: ${status}` });
        // if (targetType &&!validEnums.targetType.includes(targetType)) return res.status(400).json({ message: `Invalid targetType: ${targetType}` });
        // if (createdByRole && !validEnums.createdByRole.includes(createdByRole)) return res.status(400).json({ message: `Invalid createdByRole: ${createdByRole}` });

        const event = new Event({
            title,
            description,
            type,
            startDate,
            endDate,
            startTime,
            endTime,
            allDay,
            location,
            attendees,
            priority,
            status,
            targetType,
            targetValues: targetType === 'all' ? [] : targetValues,
            isPrivate,
            createdBy,
            createdByRole,
            metadata,
            isRecurring: isRecurring || false
        });

        await event.save();
        res.status(201).json({ message: 'Event created successfully', event });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create event', error: err.message });
    }
};

const updateEvent = async (req, res) => {
    try {
        const { id } = req.params;
        const update = req.body;

        const event = await Event.findById(id);
        if (!event) return res.status(404).json({ message: 'Event not found' });


        if (update.type && !validEnums.type.includes(update.type)) return res.status(400).json({ message: `Invalid type: ${update.type}` });
        if (update.priority && !validEnums.priority.includes(update.priority)) return res.status(400).json({ message: `Invalid priority: ${update.priority}` });
        if (update.status && !validEnums.status.includes(update.status)) return res.status(400).json({ message: `Invalid status: ${update.status}` });
        if (update.targetType && !validEnums.targetType.includes(update.targetType)) return res.status(400).json({ message: `Invalid targetType: ${update.targetType}` });
        if (update.createdByRole && !validEnums.createdByRole.includes(update.createdByRole)) return res.status(400).json({ message: `Invalid createdByRole: ${update.createdByRole}` });

        // Luxon date normalization
        if (update.startDate) {
            const startDT = Time.fromISO(update.startDate);
            if (!Time.isValidDateTime(startDT)) {
                return res.status(400).json({ message: 'Invalid startDate format' });
            }
            update.startDate = Time.toISODate(startDT); // Store as ISO date string
        }

        if (update.endDate) {
            const endDT = Time.fromISO(update.endDate);
            if (!Time.isValidDateTime(endDT)) {
                return res.status(400).json({ message: 'Invalid endDate format' });
            }
            update.endDate = Time.toISODate(endDT); // Store as ISO date string
        }

        const updatedEvent = await Event.findByIdAndUpdate(id, update, { new: true });
        res.status(200).json({ message: 'Event updated', event: updatedEvent });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update event', error: err.message });
    }
};

const deleteEvent = async (req, res) => {
    try {
        const { id } = req.params;

        const event = await Event.findById(id);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        await Event.findByIdAndDelete(id);
        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete event', error: err.message });
    }
};

const getEventsByMonth = async (req, res) => {
    try {
        const { userId, month } = req.query;
        if (!userId) {
            return res.status(400).json({ message: "userId is required" });
        }

        const user = await Employee.findById(userId).select('role department').lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const userRole = user.role;
        const department = user.department ? user.department.toString() : null;
        const now = Time.now();

        // Determine month to filter
        let monthDT;
        if (month) {
            monthDT = Time.fromISO(`${month}-01`);
            if (!Time.isValidDateTime(monthDT)) {
                return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM' });
            }
        } else {
            monthDT = now.startOf('month');
        }

        const monthStartDate = Time.toJSDate(monthDT.startOf('month'));
        const monthEndDate = Time.toJSDate(monthDT.endOf('month'));
        const todayStartDate = Time.toJSDate(now.startOf('day'));
        const todayEndDate = Time.toJSDate(now.endOf('day'));

        // Permissions-based filter
        const baseFilters = userRole === 'Admin'
            ? [{ $or: [{ isPrivate: false }, { createdBy: userId, isPrivate: true }] }]
            : [{
                $or: [
                    { targetType: 'all', isPrivate: false },
                    { targetType: 'department', targetValues: { $in: [department] }, isPrivate: false },
                    { targetType: 'role', targetValues: { $in: [userRole] }, isPrivate: false },
                    { targetType: 'user', targetValues: { $in: [userId] }, isPrivate: false },
                    { createdBy: userId, isPrivate: true }
                ]
            }];

        const queryFilters = [
            ...baseFilters,
            {
                $or: [
                    { startDate: { $gte: monthStartDate.toISOString(), $lte: monthEndDate.toISOString() } },
                    { endDate: { $gte: monthStartDate.toISOString(), $lte: monthEndDate.toISOString() } },
                    { startDate: { $lte: monthStartDate.toISOString() }, endDate: { $gte: monthEndDate.toISOString() } }
                ]
            }
        ];

        const monthEvents = await Event.find({ $and: queryFilters })
            .populate({ path: 'createdBy', select: 'firstName lastName email' })
            .lean();

        const todayEvents = [];
        const upcomingEvents = [];
        const pastEvents = [];

        for (const ev of monthEvents) {
            const start = Time.fromISO(ev.startDate).toJSDate();
            const end = Time.fromISO(ev.endDate).toJSDate();

            const isToday =
                (start >= todayStartDate && start <= todayEndDate) ||
                (end >= todayStartDate && end <= todayEndDate) ||
                (start <= todayEndDate && end >= todayStartDate);

            const isPast = end < todayStartDate;
            const isUpcoming = start > todayEndDate || (start <= todayEndDate && end > todayEndDate);

            if (isToday) {
                todayEvents.push(ev);
            } else if (isPast) {
                pastEvents.push(ev);
            } else if (isUpcoming) {
                upcomingEvents.push(ev);
            }
        }

        const populateTargetValues = async (eventArr) => {
            for (let event of eventArr) {
                if (event.targetType === 'department') {
                    if (event.targetValues?.length) {
                        if (event.targetValues.length === 1 && ['all', 'AllDepartment'].includes(event.targetValues[0])) {
                            event.targetValuesPopulated = [{ name: 'All Departments' }];
                        } else {
                            const departments = await Department.find({ _id: { $in: event.targetValues } })
                                .select('name description').lean();
                            event.targetValuesPopulated = departments;
                        }
                    }
                } else if (event.targetType === 'user') {
                    if (event.targetValues?.length) {
                        if (event.targetValues.length === 1 && ['all', 'AllEmployee'].includes(event.targetValues[0])) {
                            event.targetValuesPopulated = [{ name: 'All Employees' }];
                        } else {
                            const employees = await Employee.find({ _id: { $in: event.targetValues } })
                                .select('firstName lastName email').lean();
                            event.targetValuesPopulated = employees;
                        }
                    }
                } else if (event.targetType === 'role') {
                    if (event.targetValues?.length) {
                        event.targetValuesPopulated = event.targetValues.map(role =>
                            typeof role === 'string' ? role.charAt(0).toUpperCase() + role.slice(1) : role
                        );
                    }
                } else if (event.targetType === 'all') {
                    event.targetValuesPopulated = [{ name: 'All' }];
                }
            }
        };

        await Promise.all([
            populateTargetValues(todayEvents),
            populateTargetValues(upcomingEvents),
            populateTargetValues(pastEvents)
        ]);

        res.status(200).json({
            todayEvents,
            pastEvents,
            upcomingEvents,
            month: monthDT.toFormat('yyyy-MM')
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch events by month', error: err.message });
    }
};

module.exports = {
    getEvents,
    getEventsByMonth,
    getSingleEvent,
    createEvent,
    updateEvent,
    deleteEvent
};