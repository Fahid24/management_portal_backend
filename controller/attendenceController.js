const mongoose = require("mongoose");
const Attendance = require("../model/attendenceSchema");
const LeaveRequest = require("../model/leaveSchema");
const Employee = require("../model/employeeSchema");
const Time = require("../utils/time");
const Event = require("../model/eventSchema");
const AdminConfig = require("../model/AdminConfigSchema");
const ShortLeave = require("../model/ShortLeaveSchema");

/* ─────────────── POST /api/attendance/checkin ────────────── */
const officeLocation = {
  latitude: 23.819667, // Replace with your actual office latitude
  longitude: 90.450194 // Replace with your actual office longitude
};

// Haversine Formula
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ────────────── POST /api/attendance/create ───────────── */
const createAttendance = async (req, res) => {
  try {
    const {
      employeeId,
      employeeShift,
      date,
      checkIn,
      checkOut,
      checkInLocation,
      checkOutLocation,
      status,
      lateReason,
      createdBy,
      remarks
    } = req.body;

    if (!employeeId || !date) {
      return res.status(400).json({ message: "employeeId and date are required" });
    }

    // Check if employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Use Time utility for all date/time handling
    const dateDT = Time.fromISO(date);
    if (!Time.isValidDateTime(dateDT)) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    const dateJS = Time.toJSDate(dateDT.startOf("day"));

    // Prevent duplicate attendance for same employee/date
    const existing = await Attendance.findOne({ employeeId, date: dateJS });
    if (existing) {
      return res.status(400).json({ message: "Attendance already exists for this employee and date" });
    }

    // Format changes string for frontend
    const changesString = "Attendance record created manually by admin.";

    const attendance = new Attendance({
      employeeId,
      employeeShift: employeeShift || "Day",
      date: dateJS,
      checkIn: checkIn ? Time.toJSDate(Time.fromISO(checkIn)) : undefined,
      checkOut: checkOut ? Time.toJSDate(Time.fromISO(checkOut)) : undefined,
      manuallyCreated: true,
      checkInLocation,
      checkOutLocation,
      status: status || "present",
      lateReason,
      remarks,
      updated: [
        {
          updatedBy: createdBy,
          updatedAt: Time.now().toJSDate(),
          changes: changesString
        }
      ]
    });

    await attendance.save();
    return res.status(201).json({ message: "Attendance created successfully", attendance });
  } catch (error) {
    console.error("Error creating attendance record:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ────────────── POST /api/attendance/checkin ───────────── */
async function checkIn(req, res) {
  try {
    const { employeeId, checkInLocation, QRCode, lateReason } = req.body;
    if (QRCode && QRCode !== 'dGVzdF90b2tlbl9mb3JfYXR0ZW5kYW5jZV9zeXN0ZW1fd2l0aF9zdXBlcl9zZWN1cml0eV9rZXlfYW5kX2NvbXBsZXhfcGF5bG9hZC1zaWduYXR1cmVfdGhhdF9jYW5fdGVzdF9xcl9jb2RlLXN5c3RlbXMtd2l0aF9sb25nX2tleX9saWtlX3RoaXNfdG9rZW5fZG9lc19ub3RfZXhwaXJlX2Zvcl8xMDBfeWVhcnNfdXNlX3Jlc2V0X2lmX3lvdV93YW50X3RvX3NpbXVsYXRlX2Z1bGxfSmV3VFNfZGV2aWNlX2F1dGhlbnRpY2F0aW9uX2JlaGF2aW9y') {
      // If QR code is provided, extract employeeId from it
      return res
        .status(400)
        .json({ error: "Invalid QR code" });
    }
    if (QRCode && QRCode === 'dGVzdF90b2tlbl9mb3JfYXR0ZW5kYW5jZV9zeXN0ZW1fd2l0aF9zdXBlcl9zZWN1cml0eV9rZXlfYW5kX2NvbXBsZXhfcGF5bG9hZC1zaWduYXR1cmVfdGhhdF9jYW5fdGVzdF9xcl9jb2RlLXN5c3RlbXMtd2l0aF9sb25nX2tleX9saWtlX3RoaXNfdG9rZW5fZG9lc19ub3RfZXhwaXJlX2Zvcl8xMDBfeWVhcnNfdXNlX3Jlc2V0X2lmX3lvdV93YW50X3RvX3NpbXVsYXRlX2Z1bGxfSmV3VFNfZGV2aWNlX2F1dGhlbnRpY2F0aW9uX2JlaGF2aW9y') {
      // If QR code is provided, extract employeeId from it
      return res
        .status(200)
        .json({ error: "QR matched successfully" });
    }

    if (!employeeId)
      return res.status(400).json({ message: "Employee ID is required" });

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    if (employee.status === "Terminated" || employee.status === "Pending" || employee.status === "Resigned") {
      return res.status(400).json({ message: "Cannot check in, your status is not active" });
    }

    // Get today (start of day in PST)
    const todayLuxon = Time.today();
    const nowLuxon = Time.now();

    // Step 1: Get admin config
    const config = await AdminConfig.findOne();
    if (!config) {
      throw new Error("Admin configuration not found.");
    }

    // Step 2: Determine if employee is night shift and get appropriate working hours
    const isNightShift = employee.shift === "Night";
    const workingHours = isNightShift ? config.nightShiftWorkingHours : config.workingHours;

    if (!workingHours?.start) {
      throw new Error(`${isNightShift ? 'Night shift w' : 'W'}orking hours start time is not configured.`);
    }

    // Step 3: Parse start time and grace time
    const [hourStr, minuteStr] = workingHours.start.split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    // Parse grace time if available
    const graceTime = workingHours.grace;
    let graceHour = hour;
    let graceMinute = minute;

    if (graceTime) {
      const [graceHourStr, graceMinuteStr] = graceTime.split(":");
      graceHour = parseInt(graceHourStr, 10);
      graceMinute = parseInt(graceMinuteStr, 10);
    }

    const endTime = workingHours.end;
    let endHour = hour;
    let endMinute = minute;

    if (endTime) {
      const [endHourStr, endMinuteStr] = endTime.split(":");
      endHour = parseInt(endHourStr, 10);
      endMinute = parseInt(endMinuteStr, 10);
    }

    // Step 4: Determine the correct work start date for attendance record
    let attendanceDateLuxon = todayLuxon;

    if (isNightShift && endHour < hour) {
      // Night shift crosses midnight (e.g., 9 PM to 6 AM)
      const currentHour = nowLuxon.hour;

      // If current time is before the end hour (early morning), this belongs to previous day's shift
      if (currentHour >= 0 && currentHour < endHour) {
        attendanceDateLuxon = todayLuxon.minus({ days: 1 });
      }
    }

    const attendanceDateJS = Time.toJSDate(attendanceDateLuxon);

    // Step 5: Handle time calculations based on shift type
    let workStartCutoff, graceCutoff, earliestAllowedTime;

    if (isNightShift) {
      // For night shift, use the attendance date as base for calculations
      const nightStartHour = hour;
      const currentHour = nowLuxon.hour;

      // If current time is before end time and night shift crosses midnight,
      // we're in the "next day" scenario (e.g., 2 AM check-in for 10 PM - 6 AM shift)
      if (currentHour < endHour && endHour < nightStartHour) {
        // Use attendance date for shift start calculation
        workStartCutoff = attendanceDateLuxon.set({ hour, minute, second: 0, millisecond: 0 });
        graceCutoff = attendanceDateLuxon.set({ hour: graceHour, minute: graceMinute, second: 0, millisecond: 0 });
        earliestAllowedTime = attendanceDateLuxon.set({ hour: Math.max(0, nightStartHour - 1), minute: 0, second: 0, millisecond: 0 });
      } else {
        // Normal scenario - use attendance date
        workStartCutoff = attendanceDateLuxon.set({ hour, minute, second: 0, millisecond: 0 });
        graceCutoff = attendanceDateLuxon.set({ hour: graceHour, minute: graceMinute, second: 0, millisecond: 0 });
        earliestAllowedTime = attendanceDateLuxon.set({ hour: Math.max(0, hour - 1), minute: 0, second: 0, millisecond: 0 });
      }
    } else {
      // Day shift - standard calculation using attendance date
      workStartCutoff = attendanceDateLuxon.set({ hour, minute, second: 0, millisecond: 0 });
      graceCutoff = attendanceDateLuxon.set({ hour: graceHour, minute: graceMinute, second: 0, millisecond: 0 });
      // Prevent attendance before 8:00 AM for day shift
      earliestAllowedTime = attendanceDateLuxon.set({ hour: 8, minute: 0, second: 0, millisecond: 0 });
    }

    // Check earliest allowed time
    if (nowLuxon < earliestAllowedTime) {
      const shiftType = isNightShift ? "night shift" : "day shift";
      const earliestTime = earliestAllowedTime.toFormat("hh:mm a");
      return res.status(400).json({
        message: `Attendance not allowed before ${earliestTime} for ${shiftType} employees`
      });
    }

    // Check if employee has approved short leave on the attendance date and adjust grace cutoff
    const startOfAttendanceDay = Time.toJSDate(attendanceDateLuxon.startOf('day'));
    const endOfAttendanceDay = Time.toJSDate(attendanceDateLuxon.endOf('day'));

    const attendanceDayShortLeave = await ShortLeave.findOne({
      employeeId,
      status: "approved",
      date: {
        $gte: startOfAttendanceDay,
        $lte: endOfAttendanceDay
      }
    });

    let adjustedGraceCutoff = graceCutoff;
    if (attendanceDayShortLeave && attendanceDayShortLeave.startTime && attendanceDayShortLeave.durationHours) {
      const shortLeaveStartTime = Time.fromTimeString(attendanceDayShortLeave.startTime, attendanceDateLuxon);

      // If short leave starts at or before office start time, extend cutoff to short leave end time
      if (shortLeaveStartTime && shortLeaveStartTime <= workStartCutoff) {
        const shortLeaveEndTime = Time.getShortLeaveEndTime(attendanceDayShortLeave.startTime, attendanceDayShortLeave.durationHours, attendanceDateLuxon);
        if (shortLeaveEndTime) {
          // Use the later of grace cutoff or short leave end time
          adjustedGraceCutoff = shortLeaveEndTime > graceCutoff ? shortLeaveEndTime : graceCutoff;
        }
      }
    }

    // Check if employee is on leave on the attendance date
    const onLeave = await LeaveRequest.exists({
      employeeId,
      status: "approved",
      startDate: { $lte: attendanceDateJS },
      endDate: { $gte: attendanceDateJS },
    });

    if (onLeave) {
      return res
        .status(400)
        .json({ message: "Cannot check in while on leave" });
    }

    // Check if already checked in for the attendance date
    const attendance = await Attendance.findOne({
      employeeId,
      date: attendanceDateJS,
    });

    if (attendance) {
      return res.status(400).json({ message: "Already checked in for this work shift" });
    }

    const onOffDay = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] }
        }
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: attendanceDateJS },
          endDateParsed: { $gte: attendanceDateJS }
        }
      },
      {
        $limit: 1
      }
    ]);

    if (onOffDay.length > 0) {
      return res.status(400).json({ message: "Cannot check in on an off day" });
    }

    // Get current time and determine status based on check-in time
    let status;

    if (nowLuxon > adjustedGraceCutoff) {
      status = "late";
    } else if (nowLuxon > workStartCutoff) {
      status = "graced";
    } else {
      status = "present";
    }

    const type = checkInLocation.type || "office";
    const userLat = checkInLocation.latitude || 0;
    const userLng = checkInLocation.longitude || 0;
    const accuracy = checkInLocation.accuracy || 0;

    // Optional: Location validation logic (commented out)
    /*
    if (type === "office") {
      const distance = getDistanceFromLatLonInMeters(
        userLat,
        userLng,
        officeLocation.latitude,
        officeLocation.longitude
      );
      const allowedDistance = 100 + accuracy;

      if (distance > allowedDistance) {
        return res.status(400).json({
          message: `Check-in failed. You are ${Math.round(distance)} meters away from the office, beyond the allowed ${Math.round(allowedDistance)} meters.`
        });
      }
    }
    */

    const newAttendance = new Attendance({
      employeeId,
      employeeShift: employee.shift || "Day",
      date: attendanceDateJS,
      checkIn: Time.toJSDate(nowLuxon),
      checkInLocation: {
        from: type,
        latitude: userLat,
        longitude: userLng,
        locationName: checkInLocation.address || "Unknown Location",
      },
      status,
      lateReason,
    });

    await newAttendance.save();

    return res
      .status(201)
      .json({ message: "Check-in successful", attendance: newAttendance });

  } catch (error) {
    console.error("Error during check-in:", error);
    return res.status(500).json({ error: error.message });
  }
}

/* ────────────── POST /api/attendance/checkout ───────────── */
async function checkOut(req, res) {
  try {
    const { employeeId, checkOutLocation, QRCode } = req.body;
    if (QRCode && QRCode !== 'dGVzdF90b2tlbl9mb3JfYXR0ZW5kYW5jZV9zeXN0ZW1fd2l0aF9zdXBlcl9zZWN1cml0eV9rZXlfYW5kX2NvbXBsZXhfcGF5bG9hZC1zaWduYXR1cmVfdGhhdF9jYW5fdGVzdF9xcl9jb2RlLXN5c3RlbXMtd2l0aF9sb25nX2tleX9saWtlX3RoaXNfdG9rZW5fZG9lc19ub3RfZXhwaXJlX2Zvcl8xMDBfeWVhcnNfdXNlX3Jlc2V0X2lmX3lvdV93YW50X3RvX3NpbXVsYXRlX2Z1bGxfSmV3VFNfZGV2aWNlX2F1dGhlbnRpY2F0aW9uX2JlaGF2aW9y') {
      // If QR code is provided, extract employeeId from it
      return res
        .status(400)
        .json({ error: "Invalid QR code" });
    }
    // if (QRCode && QRCode === 'dGVzdF90b2tlbl9mb3JfYXR0ZW5kYW5jZV9zeXN0ZW1fd2l0aF9zdXBlcl9zZWN1cml0eV9rZXlfYW5kX2NvbXBsZXhfcGF5bG9hZC1zaWduYXR1cmVfdGhhdF9jYW5fdGVzdF9xcl9jb2RlLXN5c3RlbXMtd2l0aF9sb25nX2tleX9saWtlX3RoaXNfdG9rZW5fZG9lc19ub3RfZXhwaXJlX2Zvcl8xMDBfeWVhcnNfdXNlX3Jlc2V0X2lmX3lvdV93YW50X3RvX3NpbXVsYXRlX2Z1bGxfSmV3VFNfZGV2aWNlX2F1dGhlbnRpY2F0aW9uX2JlaGF2aW9y') {
    //   // If QR code is provided, extract employeeId from it
    //   return res
    //     .status(200)
    //     .json({ error: "valid QR code" });
    // }
    if (!employeeId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    // Get employee information
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Get current time and today's date
    const todayLuxon = Time.today();
    const nowLuxon = Time.now();

    // Get admin config to determine working hours for shift detection
    const config = await AdminConfig.findOne();
    if (!config) {
      throw new Error("Admin configuration not found.");
    }

    // Use the same work start day logic as checkIn to find attendance records
    // We need to check multiple potential dates based on current time and shift types

    let attendanceCandidates = [];

    // Always include today as a candidate
    attendanceCandidates.push(todayLuxon);

    // For night shift scenarios, also check yesterday
    // This handles cases where night shift employee is checking out after midnight
    const yesterdayLuxon = todayLuxon.minus({ days: 1 });
    attendanceCandidates.push(yesterdayLuxon);

    // Find attendance record by checking candidate dates
    let attendance = null;
    let attendanceDate = null;

    for (const candidateDate of attendanceCandidates) {
      const candidateDateJS = Time.toJSDate(candidateDate);
      const foundAttendance = await Attendance.findOne({
        employeeId,
        date: candidateDateJS,
        checkOut: { $exists: false } // Only find records without checkout
      });

      if (foundAttendance) {
        attendance = foundAttendance;
        attendanceDate = candidateDate;
        break;
      }
    }

    if (!attendance) {
      return res
        .status(400)
        .json({ message: "No active check-in record found for checkout" });
    }

    if (attendance.checkOut) {
      return res.status(400).json({ message: "Already checked out for this work shift" });
    }

    // Determine if this is a night shift based on the attendance record
    const isAttendanceNightShift = attendance.employeeShift === "Night";
    const workingHours = isAttendanceNightShift ? config.nightShiftWorkingHours : config.workingHours;

    if (!workingHours?.end) {
      throw new Error(`${isAttendanceNightShift ? 'Night shift w' : 'W'}orking hours end time is not configured.`);
    }

    // Parse shift times
    const [startHourStr, startMinuteStr] = workingHours.start.split(":");
    const startHour = parseInt(startHourStr, 10);
    const startMinute = parseInt(startMinuteStr, 10);

    const [endHourStr, endMinuteStr] = workingHours.end.split(":");
    const endHour = parseInt(endHourStr, 10);
    const endMinute = parseInt(endMinuteStr, 10);

    // Get the attendance date for time calculations
    const attendanceDateLuxon = Time.fromJSDate(attendance.date);

    // Calculate latest allowed check-out time based on shift type and cross-midnight logic
    let latestCheckoutTime;

    if (isAttendanceNightShift) {
      // Night shift logic
      const crossesMidnight = endHour < startHour; // e.g., 21:00 to 06:00
      const currentHour = nowLuxon.hour;

      if (crossesMidnight) {
        // Night shift crosses midnight
        if (currentHour >= 0 && currentHour <= endHour + 1) {
          // Current time is in the "next day" morning - checkout allowed on day after attendance date
          latestCheckoutTime = attendanceDateLuxon.plus({ days: 1 }).set({
            hour: endHour + 1, // Allow 1 hour grace after shift end
            minute: endMinute,
            second: 0,
            millisecond: 0
          });
        } else {
          // Current time is same day as attendance date - allow checkout until end of day
          latestCheckoutTime = attendanceDateLuxon.set({
            hour: 23,
            minute: 59,
            second: 59,
            millisecond: 999
          });
        }
      } else {
        // Night shift doesn't cross midnight (rare case)
        latestCheckoutTime = attendanceDateLuxon.set({
          hour: endHour + 1,
          minute: endMinute,
          second: 0,
          millisecond: 0
        });
      }
    } else {
      // Day shift - simple case, checkout allowed same day until 1 hour after end time
      latestCheckoutTime = attendanceDateLuxon.set({
        hour: Math.min(22, endHour + 1), // Don't allow day shift checkout past 10 PM
        minute: endMinute,
        second: 0,
        millisecond: 0
      });
    }

    // Check if current time exceeds latest allowed checkout time
    if (nowLuxon > latestCheckoutTime) {
      const shiftType = isAttendanceNightShift ? "night shift" : "day shift";
      const latestTime = latestCheckoutTime.toFormat("HH:mm");
      const latestDate = latestCheckoutTime.toFormat("MMM dd");
      return res.status(400).json({
        message: `Check-out not allowed after ${latestTime} on ${latestDate} for ${shiftType} employees`
      });
    }

    // Set check-out time using Luxon
    attendance.checkOut = Time.toJSDate(nowLuxon);

    attendance.checkOutLocation = {
      from: checkOutLocation.type || "office",
      latitude: checkOutLocation.latitude || 0,
      longitude: checkOutLocation.longitude || 0,
      locationName: checkOutLocation.address || "Unknown Location",
    };

    await attendance.save();

    res.status(200).json({
      message: "Check-out successful",
      attendance,
    });

  } catch (error) {
    console.error("Error during check-out:", error);
    res.status(500).json({ error: error.message });
  }
}

/* ────────────── GET /api/attendance/:employeeId ─────────── */
async function getAttendanceRecords(req, res) {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate } = req.query;

    if (!employeeId) {
      return res.status(400).json({ error: "Employee ID is required" });
    }

    const filter = { employeeId };

    if (startDate && endDate) {
      const { start, end } = Time.getDateRangeFromISO(startDate, endDate);

      if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
        return res.status(400).json({ error: "Invalid start or end date" });
      }

      filter.date = {
        $gte: Time.toJSDate(start),
        $lte: Time.toJSDate(end),
      };
    }

    const records = await Attendance.find(filter).sort({ date: -1 });

    return res.status(200).json(records);
  } catch (error) {
    console.error("Error fetching attendance records:", error);
    return res.status(500).json({ error: error.message });
  }
}

/* ─────────────── GET /api/attendance/stats ─────────────── */
async function getAttendanceStats(req, res) {
  try {
    const { startDate, endDate, departmentIds } = req.query;

    // Build Luxon date range
    let dateFilter = {};
    let range = null;

    if (startDate && endDate) {
      range = Time.getDateRangeFromISO(startDate, endDate);

      if (!Time.isValidDateTime(range.start) || !Time.isValidDateTime(range.end)) {
        return res.status(400).json({ error: "Invalid start or end date" });
      }

      dateFilter = {
        $gte: Time.toJSDate(range.start),
        $lte: Time.toJSDate(range.end),
      };
    }

    // Filter employees by departments
    let employeeFilter = {};
    if (departmentIds) {
      const deptIdArray = departmentIds
        .split(",")
        .map((id) => new mongoose.Types.ObjectId(id.trim()));
      employeeFilter.department = { $in: deptIdArray };
    }

    const employees = await Employee.find(employeeFilter, {
      _id: 1,
      name: 1,
      department: 1,
    });
    const employeeIds = employees.map((emp) => emp._id);

    if (departmentIds && employeeIds.length === 0) {
      return res.status(200).json({ stats: [], totals: {}, leaveStats: {}, leaveTotals: {} });
    }

    const attendanceMatch = {};
    if (employeeIds.length) attendanceMatch.employeeId = { $in: employeeIds };
    if (range) attendanceMatch.date = dateFilter;

    const attendanceStats = await Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: "$employeeId",
          presentCount: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          gracedCount: {
            $sum: { $cond: [{ $eq: ["$status", "graced"] }, 1, 0] },
          },
          absentCount: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
          lateCount: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "employees",
          localField: "_id",
          foreignField: "_id",
          as: "employee",
        },
      },
      { $unwind: "$employee" },
      {
        $project: {
          employeeName: "$employee.name",
          presentCount: 1,
          gracedCount: 1,
          absentCount: 1,
          lateCount: 1,
          department: "$employee.department",
        },
      },
    ]);

    const nowJS = Time.toJSDate(Time.now());
    const minDateJS = Time.toJSDate(Time.fromJSDate(new Date(0)));

    const leaveMatch = {
      employeeId: { $in: employeeIds },
      $or: [
        {
          startDate: { $lte: dateFilter.$lte || nowJS },
          endDate: { $gte: dateFilter.$gte || minDateJS },
        },
      ],
    };

    const leaveStatsAgg = await LeaveRequest.aggregate([
      { $match: leaveMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const leaveStats = leaveStatsAgg.reduce(
      (acc, cur) => {
        acc[cur._id] = cur.count;
        return acc;
      },
      { requested: 0, approved: 0, rejected: 0, pending: 0 }
    );

    const approvedLeaves = await LeaveRequest.find({
      ...leaveMatch,
      status: "approved",
    });

    const leaveDaysMap = {};
    approvedLeaves.forEach((leave) => {
      const leaveStart = Time.fromJSDate(leave.startDate);
      const leaveEnd = Time.fromJSDate(leave.endDate);

      const startBound = range?.start || Time.fromJSDate(new Date(0));
      const endBound = range?.end || Time.now();

      const actualStart = Time.isBefore(leaveStart, startBound) ? startBound : leaveStart;
      const actualEnd = Time.isAfter(leaveEnd, endBound) ? endBound : leaveEnd;

      const days = Math.floor(Time.diff(actualEnd, actualStart, ["days"]).days) + 1;

      const key = leave.employeeId.toString();
      leaveDaysMap[key] = (leaveDaysMap[key] || 0) + days;
    });

    const stats = attendanceStats.map((stat) => ({
      ...stat,
      leaveCount: leaveDaysMap[stat._id.toString()] || 0,
    }));

    const totalAttendanceAgg = await Attendance.aggregate([
      { $match: attendanceMatch },
      {
        $group: {
          _id: null,
          totalPresent: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          totalGraced: {
            $sum: { $cond: [{ $eq: ["$status", "graced"] }, 1, 0] },
          },
          totalAbsent: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
          totalLate: {
            $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] },
          },
        },
      },
    ]);

    const totals = totalAttendanceAgg[0] || {
      totalPresent: 0,
      totalGraced: 0,
      totalAbsent: 0,
      totalLate: 0,
    };

    const totalLeaveDays = Object.values(leaveDaysMap).reduce((a, b) => a + b, 0);

    res.status(200).json({
      stats,
      totals,
      leaveStats,
      leaveTotals: {
        totalLeaveDays,
      },
    });
  } catch (error) {
    console.error("Error fetching attendance stats with detailed leave:", error);
    res.status(500).json({ error: error.message });
  }
}

async function getSingleEmployeeWorkStats(req, res) {
  try {
    const { employeeId, startDate, endDate } = req.query;

    if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ error: "Invalid employeeId format" });
    }

    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    // Check if employee exists and is not pending
    const employee = await Employee.findById(empObjectId, "status startDate terminationDate shift");
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    if (employee.status === "Pending") {
      return res.status(200).json({
        employeeId: empObjectId,
        employeeName: "",
        employeeEmail: "",
        employeeImage: null,
        employeeRole: "",
        employeeShift: "",
        department: null,
        workHours: 0,
        dailyStats: [],
        totalLateCount: 0,
        totalLateHours: 0,
        totalGracedCount: 0,
        totalGracedHours: 0,
        totalOvertimeCount: 0,
        totalOvertimeHours: 0,
        message: "Cannot get work stats for pending employees"
      });
    }

    // Build date range
    const today = Time.now();
    const jan1 = today.set({ month: 1, day: 1 }).startOf("day");

    let requestedRange = Time.getDateRangeFromISO(
      startDate || jan1.toISODate(),
      endDate || today.toISODate()
    );

    if (!Time.isValidDateTime(requestedRange.start) || !Time.isValidDateTime(requestedRange.end)) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    // Adjust date range based on employee's employment period
    let actualStart = requestedRange.start;
    let actualEnd = requestedRange.end;

    // If employee has a start date, don't include dates before they started
    if (employee.startDate) {
      const employeeStartDate = Time.fromJSDate(employee.startDate).startOf('day');
      actualStart = employeeStartDate > actualStart ? employeeStartDate : actualStart;
    }

    // For terminated employees, limit the date range to their active period
    if ((employee.status === "Terminated" || employee.status === "Resigned") && employee.terminationDate) {
      const terminationDate = Time.fromJSDate(employee.terminationDate).startOf('day');
      actualEnd = terminationDate < actualEnd ? terminationDate : actualEnd;
    }

    // Check if there's any valid date range left
    if (actualStart > actualEnd) {
      return res.status(200).json({
        employeeId: empObjectId,
        employeeName: "",
        employeeEmail: "",
        employeeImage: null,
        employeeRole: "",
        employeeShift: "",
        department: null,
        workHours: 8,
        dailyStats: [],
        totalLateCount: 0,
        totalLateHours: 0,
        totalGracedCount: 0,
        totalGracedHours: 0,
        totalOvertimeCount: 0,
        totalOvertimeHours: 0,
        message: "No valid employment period overlaps with requested date range"
      });
    }

    const range = { start: actualStart, end: actualEnd };
    const startJS = Time.toJSDate(range.start);
    const endJS = Time.toJSDate(range.end);

    // Get admin config for working hours and grace period
    const adminConfig = await AdminConfig.findOne({});
    if (!adminConfig?.workingHours?.start) {
      return res.status(500).json({ error: "Working hours not configured." });
    }

    // Day shift configuration
    const [workStartHour, workStartMinute] = adminConfig.workingHours.start.split(":").map(Number);
    const [graceHour, graceMinute] = adminConfig.workingHours.grace
      ? adminConfig.workingHours.grace.split(":").map(Number)
      : [workStartHour, workStartMinute]; // Default to start time if no grace period
    const [workEndHour, workEndMinute] = adminConfig.workingHours.end
      ? adminConfig.workingHours.end.split(":").map(Number)
      : [19, 0];

    // Night shift configuration (if available)
    let nightStartHour, nightStartMinute, nightGraceHour, nightGraceMinute, nightEndHour, nightEndMinute;
    if (adminConfig.nightShiftWorkingHours?.start) {
      [nightStartHour, nightStartMinute] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
      [nightGraceHour, nightGraceMinute] = adminConfig.nightShiftWorkingHours.grace
        ? adminConfig.nightShiftWorkingHours.grace.split(":").map(Number)
        : [nightStartHour, nightStartMinute]; // Default to start time if no grace period
      [nightEndHour, nightEndMinute] = adminConfig.nightShiftWorkingHours.end
        ? adminConfig.nightShiftWorkingHours.end.split(":").map(Number)
        : [6, 0]; // Default night shift end
    }

    const attendanceRecords = await Attendance.find({
      employeeId: empObjectId,
      date: { $gte: startJS, $lte: endJS },
    }).lean();

    const leaveRecords = await LeaveRequest.find({
      employeeId: empObjectId,
      status: "approved",
      startDate: { $lte: endJS },
      endDate: { $gte: startJS },
    }).lean();

    // Build leave dates
    const leaveDatesSet = new Set();
    leaveRecords.forEach((leave) => {
      let current = Time.fromJSDate(leave.startDate > startJS ? leave.startDate : startJS);
      const leaveEnd = Time.fromJSDate(leave.endDate < endJS ? leave.endDate : endJS);
      while (current <= leaveEnd) {
        leaveDatesSet.add(current.toISODate());
        current = current.plus({ days: 1 });
      }
    });

    // Get holidays/weekends
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] }
        }
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: endJS },
          endDateParsed: { $gte: startJS }
        }
      }
    ]);

    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(event.startDateParsed < startJS ? startJS : event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed > endJS ? endJS : event.endDateParsed);

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Get short leaves
    const shortLeaves = await ShortLeave.find({
      employeeId,
      status: "approved",
      date: {
        $gte: startJS,
        $lte: endJS,
      },
    });

    const shortLeaveDatesMap = new Map();
    shortLeaves.forEach((sl) => {
      // Ensure consistent date string formatting using the same method as attendance records
      const dateStr = Time.fromJSDate(sl.date).startOf('day').toISODate();
      shortLeaveDatesMap.set(dateStr, {
        durationHours: sl.durationHours || 0, // duration in hours
        reason: sl.reason || "",
        startTime: sl.startTime || null, // start time of short leave
        endTime: sl.endTime || null // end time of short leave
      });
    });

    // Map attendance records by date
    const attendanceMap = {};
    attendanceRecords.forEach((att) => {
      const dateStr = Time.fromJSDate(att.date).toISODate();
      attendanceMap[dateStr] = att;
    });

    const dailyStats = [];
    let totalLateCount = 0;
    let totalLateHours = 0;
    let totalGracedCount = 0;
    let totalGracedHours = 0;
    let totalOvertimeCount = 0;
    let totalOvertimeHours = 0;

    let d = range.start;
    while (d <= range.end) {
      const dateStr = d.toISODate();
      const record = attendanceMap[dateStr];

      let workedHours = 0;
      let isLate = false;
      let lateHours = 0;
      let isGraced = false;
      let gracedHours = 0;
      let isOvertime = false;
      let overtimeHours = 0;

      if (record && record.checkIn && record.checkOut) {
        const checkIn = Time.fromJSDate(record.checkIn);
        const checkOut = Time.fromJSDate(record.checkOut);

        workedHours = Time.diff(checkOut, checkIn, ["hours"]).hours;
        const dateString = d.startOf('day').toISODate();

        // Determine shift for this specific attendance record - use attendance.employeeShift if available, fallback to employee.shift
        const recordIsNightShift = record.employeeShift === "Night" || (record.employeeShift !== "Day" && employee.shift === "Night");

        // Use appropriate working hours based on this record's shift
        let recordWorkStartHour, recordWorkStartMinute, recordGraceHour, recordGraceMinute, recordWorkEndHour, recordWorkEndMinute;
        if (recordIsNightShift && nightStartHour !== undefined) {
          recordWorkStartHour = nightStartHour;
          recordWorkStartMinute = nightStartMinute;
          recordGraceHour = nightGraceHour;
          recordGraceMinute = nightGraceMinute;
          recordWorkEndHour = nightEndHour;
          recordWorkEndMinute = nightEndMinute;
        } else {
          recordWorkStartHour = workStartHour;
          recordWorkStartMinute = workStartMinute;
          recordGraceHour = graceHour;
          recordGraceMinute = graceMinute;
          recordWorkEndHour = workEndHour;
          recordWorkEndMinute = workEndMinute;
        }

        // Subtract only the overlapped hours with short leave
        const shortLeaveInfo = shortLeaveDatesMap.get(dateString);
        if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours && workedHours > 0) {
          // Parse short leave start and end times
          const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, checkIn);
          const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

          // Calculate overlap between attendance period and short leave period
          const overlapStart = checkIn > shortLeaveStartDT ? checkIn : shortLeaveStartDT;
          const overlapEnd = checkOut < shortLeaveEndDT ? checkOut : shortLeaveEndDT;

          let overlappedHours = 0;
          if (overlapEnd > overlapStart) {
            overlappedHours = overlapEnd.diff(overlapStart, 'hours').hours;
          }

          workedHours = Math.max(0, workedHours - overlappedHours);
        } else if (shortLeaveInfo && shortLeaveInfo.durationHours && workedHours > 0) {
          // Fallback: subtract full duration if no startTime available
          workedHours = Math.max(0, workedHours - shortLeaveInfo.durationHours);
        }

        const officeStart = checkIn.set({ hour: recordWorkStartHour, minute: recordWorkStartMinute, second: 0, millisecond: 0 });
        const graceCutoff = checkIn.set({ hour: recordGraceHour, minute: recordGraceMinute, second: 0, millisecond: 0 });

        // For night shift, calculate office end time considering cross-midnight scenarios
        let officeEnd;
        if (recordIsNightShift && nightEndHour !== undefined && recordWorkEndHour < recordWorkStartHour) {
          // Night shift ends next day
          officeEnd = checkIn.plus({ days: 1 }).set({ hour: recordWorkEndHour, minute: recordWorkEndMinute, second: 0, millisecond: 0 });
        } else {
          // Day shift or same-day night shift
          officeEnd = checkIn.set({ hour: recordWorkEndHour, minute: recordWorkEndMinute, second: 0, millisecond: 0 });
        }

        // Calculate adjusted grace cutoff if short leave exists at start of day
        let adjustedGraceCutoff = graceCutoff;
        if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
          const shortLeaveStartTime = Time.fromTimeString(shortLeaveInfo.startTime, checkIn);

          // If short leave starts at or before office start time, extend cutoff to short leave end time
          if (shortLeaveStartTime && shortLeaveStartTime <= officeStart) {
            const shortLeaveEndTime = Time.getShortLeaveEndTime(shortLeaveInfo.startTime, shortLeaveInfo.durationHours, checkIn);
            if (shortLeaveEndTime) {
              // Use the later of grace cutoff or short leave end time
              adjustedGraceCutoff = shortLeaveEndTime > graceCutoff ? shortLeaveEndTime : graceCutoff;
            }
          }
        }

        if (record.isStatusUpdated && (record.status === "late" || record.status === "graced")) {
          if (record.status === "late") {
            isLate = true;
            lateHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
            totalLateCount++;
            totalLateHours += lateHours;
          } else if (record.status === "graced") {
            isGraced = true;
            gracedHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
            totalGracedCount++;
            totalGracedHours += gracedHours;
          }
        } else {
          // For night shift, handle cross-midnight time comparison
          if (recordIsNightShift && nightStartHour !== undefined) {
            // Night shift cross-midnight logic
            const checkInHour = checkIn.hour;
            const checkInMinute = checkIn.minute;
            const adjustedGraceHour = adjustedGraceCutoff.hour;
            const adjustedGraceMinute = adjustedGraceCutoff.minute;

            if (adjustedGraceHour > recordWorkStartHour) {
              // Grace time is same day as start time (e.g., start: 21:00, grace: 21:30)
              if (checkInHour >= recordWorkStartHour) {
                // Check-in is same day as start time
                if (checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute)) {
                  isLate = true;
                  lateHours = Time.diff(checkIn, adjustedGraceCutoff, ["hours"]).hours;
                } else if (checkInHour > recordWorkStartHour || (checkInHour === recordWorkStartHour && checkInMinute > recordWorkStartMinute)) {
                  isGraced = true;
                  gracedHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
                }
              } else {
                // Check-in is next day (very late) - definitely late
                isLate = true;
                lateHours = Time.diff(checkIn, adjustedGraceCutoff, ["hours"]).hours;
              }
            } else {
              // Grace time spans to next day (e.g., start: 23:00, grace: 01:00 next day)
              if (checkInHour >= recordWorkStartHour) {
                // Check-in same day as start - within grace if before midnight
                if (checkInHour > recordWorkStartHour || (checkInHour === recordWorkStartHour && checkInMinute > recordWorkStartMinute)) {
                  isGraced = true;
                  gracedHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
                }
              } else {
                // Check-in next day
                if (checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute)) {
                  isLate = true;
                  lateHours = Time.diff(checkIn, adjustedGraceCutoff, ["hours"]).hours;
                } else {
                  isGraced = true;
                  gracedHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
                }
              }
            }

            if (isLate) {
              totalLateCount++;
              totalLateHours += lateHours;
            } else if (isGraced) {
              totalGracedCount++;
              totalGracedHours += gracedHours;
            }
          } else {
            // Day shift logic (standard comparison)
            if (checkIn > adjustedGraceCutoff) {
              isLate = true;
              lateHours = Time.diff(checkIn, adjustedGraceCutoff, ["hours"]).hours;
              totalLateCount++;
              totalLateHours += lateHours;
            } else if (checkIn > officeStart) {
              isGraced = true;
              gracedHours = Time.diff(checkIn, officeStart, ["hours"]).hours;
              totalGracedCount++;
              totalGracedHours += gracedHours;
            }
          }
        }

        // Overtime calculation (now handles cross-midnight correctly via officeEnd calculation)
        if (checkOut > officeEnd) {
          isOvertime = true;
          overtimeHours = Time.diff(checkOut, officeEnd, ["hours"]).hours;
          totalOvertimeCount++;
          totalOvertimeHours += overtimeHours;
        }
      }

      const isLeave = leaveDatesSet.has(dateStr);
      const isHoliday = holidayDates.has(dateStr);
      const isWeekend = weekendDates.has(dateStr);
      const shortLeaveInfo = shortLeaveDatesMap.get(dateStr);

      // Check if employee is currently on short leave (only for today's date)
      const currentDate = Time.now().startOf('day');
      const isToday = d.hasSame(currentDate, 'day');
      let isCurrentlyOnShortLeave = false;

      if (isToday && shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
        const now = Time.now();
        const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, now);
        const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

        // Check if current time is within short leave period
        if (now >= shortLeaveStartDT && now <= shortLeaveEndDT) {
          isCurrentlyOnShortLeave = true;
        }
      }

      // If it's a non-working day (leave, holiday, or weekend), set everything to 0
      const isNonWorkingDay = isLeave || isHoliday || isWeekend;

      dailyStats.push({
        date: Time.toJSDate(d),
        workedHours: isNonWorkingDay ? 0 : Number(workedHours.toFixed(2)),
        attendanceShift: recordIsNightShift ? "Night" : "Day",
        isLeaveDay: isLeave,
        isLate: isNonWorkingDay ? false : isLate,
        lateHours: isNonWorkingDay ? 0 : Number(lateHours.toFixed(2)),
        isGraced: isNonWorkingDay ? false : isGraced,
        gracedHours: isNonWorkingDay ? 0 : Number(gracedHours.toFixed(2)),
        isOvertime: isNonWorkingDay ? false : isOvertime,
        overtimeHours: isNonWorkingDay ? 0 : Number(overtimeHours.toFixed(2)),
        isHoliday,
        isWeekend,
        shortLeave: shortLeaveInfo ? {
          duration: shortLeaveInfo.durationHours,
          reason: shortLeaveInfo.reason,
          startTime: shortLeaveInfo.startTime,
          endTime: shortLeaveInfo.endTime,
          hasShortLeaveToday: true,
          isCurrentlyOnShortLeave: isCurrentlyOnShortLeave
        } : {
          hasShortLeaveToday: false,
          isCurrentlyOnShortLeave: false
        },
      });

      d = d.plus({ days: 1 });
    }

    const emp = await Employee.findById(empObjectId).populate("department");
    if (!emp) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // const adminConfig = await AdminConfig.findOne({});
    const workHours = emp.shift === "Day" ? adminConfig?.workHourPerDay : adminConfig?.nightShiftWorkHourPerDay;

    res.status(200).json({
      employeeId: emp._id,
      employeeName: emp.firstName + " " + emp.lastName,
      employeeEmail: emp.email,
      employeeImage: emp.photoUrl || null,
      employeeRole: emp.role,
      employeeShift: emp.shift || "Day",
      department: emp.department || null,
      workHours: workHours || 8,
      dailyStats,
      totalLateCount,
      totalLateHours: Number(totalLateHours.toFixed(2)),
      totalGracedCount,
      totalGracedHours: Number(totalGracedHours.toFixed(2)),
      totalOvertimeCount,
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      employmentStatus: emp.status,
      employmentPeriod: emp.status === "Terminated" && emp.terminationDate
        ? { startDate: emp.startDate, terminationDate: emp.terminationDate }
        : { startDate: emp.startDate },
      actualDateRange: {
        requestedStart: startDate || jan1.toISODate(),
        requestedEnd: endDate || today.toISODate(),
        actualStart: Time.toISODate(actualStart),
        actualEnd: Time.toISODate(actualEnd)
      }
    });
  } catch (error) {
    console.error("Error fetching single employee work stats:", error);
    res.status(500).json({ error: error.message });
  }
}



// Get daily worked hours stats for multiple employees filtered by employeeIds, departmentIds, date range
async function getWorkStats(req, res) {
  try {
    const { employeeIds, startDate, endDate, departmentIds } = req.query;

    // Handle default date range (current month or provided)
    const now = Time.now();
    const startOfMonth = now.startOf("month");
    const endOfMonth = now.endOf("month");

    const range = Time.getDateRangeFromISO(
      startDate || startOfMonth.toISODate(),
      endDate || endOfMonth.toISODate()
    );

    const startJS = Time.toJSDate(range.start);
    const endJS = Time.toJSDate(range.end);

    // Build employee filter - exclude pending employees
    let empFilter = {
      role: { $ne: "Admin" },
      status: { $ne: "Pending" } // Exclude employees with pending status
    };

    if (departmentIds) {
      const deptIdArray = departmentIds
        .split(",")
        .map((id) => new mongoose.Types.ObjectId(id.trim()));
      empFilter.department = { $in: deptIdArray };
    }

    if (employeeIds && employeeIds.trim() !== "") {
      const empIdArray = employeeIds
        .split(",")
        .map((id) => new mongoose.Types.ObjectId(id.trim()));

      if (empIdArray.length === 1) {
        empFilter.role = { $in: ["Employee", "Manager", "DepartmentHead", "Admin"] };
      }

      empFilter._id = { $in: empIdArray };
    }

    const employees = await Employee.find(empFilter, "_id firstName lastName photoUrl department status startDate terminationDate designation dateOfBirth shift").populate("department").lean();
    if (!employees.length) {
      return res.status(200).json({ employees: [] });
    }

    // Create employee-specific date ranges based on their employment status
    const employeeDateRanges = {};
    const validEmployees = [];

    employees.forEach(emp => {
      const empId = emp._id.toString();
      let empStart = range.start;
      let empEnd = range.end;

      // For terminated employees, limit the date range to their active period
      if ((emp.status === "Terminated" || emp.status === "Resigned") && emp.terminationDate) {
        const terminationDate = Time.fromJSDate(emp.terminationDate).startOf('day');
        empEnd = terminationDate < empEnd ? terminationDate : empEnd;
      }

      // If employee has a start date, don't include dates before they started
      if (emp.startDate) {
        const employeeStartDate = Time.fromJSDate(emp.startDate).startOf('day');
        empStart = employeeStartDate > empStart ? employeeStartDate : empStart;
      }

      // Only include employee if their employment period overlaps with requested range
      if (empStart <= empEnd) {
        employeeDateRanges[empId] = { start: empStart, end: empEnd };
        validEmployees.push(emp);
      }
    });

    if (!validEmployees.length) {
      return res.status(200).json({
        employees: employees.length === 1 ? [
          {
            employeeId: employees[0]._id,
            employeeName: employees[0].firstName + " " + employees[0].lastName,
            employeeEmail: employees[0].email,
            employeeRole: employees[0].role,
            employeeDesignation: employees[0].designation,
            employeePhoto: employees[0].photoUrl || "",
            employeeDob: employees[0].dateOfBirth || null,
            employeeShift: employees[0].shift || "Day",
            department: employees[0].department || null,
            dailyStats: [],
          }
        ] : []
      });
    }

    const employeeIdSet = new Set(validEmployees.map((e) => e._id.toString()));

    // Get admin config for working hours and grace period
    const adminConfig = await AdminConfig.findOne({});
    if (!adminConfig?.workingHours?.start) {
      return res.status(500).json({ error: "Working hours not configured." });
    }

    // Day shift configuration
    const [workStartHour, workStartMinute] = adminConfig.workingHours.start.split(":").map(Number);
    const [graceHour, graceMinute] = adminConfig.workingHours.grace
      ? adminConfig.workingHours.grace.split(":").map(Number)
      : [workStartHour, workStartMinute]; // Default to start time if no grace period
    const [workEndHour, workEndMinute] = adminConfig.workingHours.end
      ? adminConfig.workingHours.end.split(":").map(Number)
      : [19, 0];

    // Night shift configuration (if available)
    let nightStartHour, nightStartMinute, nightGraceHour, nightGraceMinute, nightEndHour, nightEndMinute;
    if (adminConfig.nightShiftWorkingHours?.start) {
      [nightStartHour, nightStartMinute] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
      [nightGraceHour, nightGraceMinute] = adminConfig.nightShiftWorkingHours.grace
        ? adminConfig.nightShiftWorkingHours.grace.split(":").map(Number)
        : [nightStartHour, nightStartMinute]; // Default to start time if no grace period
      [nightEndHour, nightEndMinute] = adminConfig.nightShiftWorkingHours.end
        ? adminConfig.nightShiftWorkingHours.end.split(":").map(Number)
        : [6, 0]; // Default night shift end
    }

    // Attendance
    const attendanceRecords = await Attendance.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      date: { $gte: startJS, $lte: endJS },
    }).lean();

    // Leaves
    const leaveRecords = await LeaveRequest.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      status: "approved",
      startDate: { $lte: endJS },
      endDate: { $gte: startJS },
    }).lean();

    // Map leave dates per employee
    const leaveDatesMap = {};
    leaveRecords.forEach(({ employeeId, startDate: s, endDate: e }) => {
      const empIdStr = employeeId.toString();
      if (!leaveDatesMap[empIdStr]) leaveDatesMap[empIdStr] = new Set();

      let current = Time.fromJSDate(s > startJS ? s : startJS);
      const leaveEnd = Time.fromJSDate(e < endJS ? e : endJS);

      while (current <= leaveEnd) {
        leaveDatesMap[empIdStr].add(current.toISODate());
        current = current.plus({ days: 1 });
      }
    });

    // Map Events for holidays/weekends
    const events = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] }
        }
      },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: endJS },
          endDateParsed: { $gte: startJS }
        }
      }
    ]);

    // Create quick lookup sets for holidays and weekends
    const holidayDates = new Set();
    const weekendDates = new Set();

    events.forEach((event) => {
      let current = Time.fromJSDate(event.startDateParsed < startJS ? startJS : event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed > endJS ? endJS : event.endDateParsed);

      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Get short leaves for all employees
    const shortLeaves = await ShortLeave.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      status: "approved",
      date: {
        $gte: startJS,
        $lte: endJS,
      },
    });

    // Map short leaves per employee
    const shortLeaveDatesMap = {};
    shortLeaves.forEach((sl) => {
      const empIdStr = sl.employeeId.toString();
      const dateStr = Time.fromJSDate(sl.date).startOf('day').toISODate();

      if (!shortLeaveDatesMap[empIdStr]) {
        shortLeaveDatesMap[empIdStr] = new Map();
      }

      shortLeaveDatesMap[empIdStr].set(dateStr, {
        durationHours: sl.durationHours || 0, // duration in hours
        reason: sl.reason || "",
        startTime: sl.startTime || null, // start time of short leave
        endTime: sl.endTime || null // end time of short leave
      });
    });

    // Map attendance
    const attendanceMap = {};
    attendanceRecords.forEach((att) => {
      const dateStr = Time.fromJSDate(att.date).toISODate();
      const empIdStr = att.employeeId.toString();
      const key = `${empIdStr}|${dateStr}`;

      // Find employee to determine shift with fallback logic
      const employee = validEmployees.find(emp => emp._id.toString() === empIdStr);
      const isNightShift = att.employeeShift === "Night" || (att.employeeShift !== "Day" && employee?.shift === "Night");

      // Use appropriate working hours based on shift
      let currentWorkStartHour, currentWorkStartMinute, currentGraceHour, currentGraceMinute;
      if (isNightShift && nightStartHour !== undefined) {
        currentWorkStartHour = nightStartHour;
        currentWorkStartMinute = nightStartMinute;
        currentGraceHour = nightGraceHour;
        currentGraceMinute = nightGraceMinute;
      } else {
        currentWorkStartHour = workStartHour;
        currentWorkStartMinute = workStartMinute;
        currentGraceHour = graceHour;
        currentGraceMinute = graceMinute;
      }

      if (att.checkIn || att.checkOut) {
        const checkIn = att.checkIn.getTime();
        let checkOut;

        if (att.checkOut) {
          checkOut = att.checkOut.getTime();
        } else {
          const checkInDate = Time.fromJSDate(att.checkIn);
          let estimatedCheckOut;

          // For night shift employees, handle cross-midnight scenarios
          if (isNightShift && nightEndHour !== undefined) {
            // For night shift, if they haven't checked out yet, estimate checkout time
            // Check if the shift likely ends next day
            if (nightEndHour < currentWorkStartHour) {
              // Shift ends next day (e.g., start 21:00, end 06:00 next day)
              estimatedCheckOut = checkInDate.plus({ days: 1 }).set({
                hour: nightEndHour,
                minute: nightEndMinute,
                second: 0,
                millisecond: 0
              });
            } else {
              // Shift ends same day (unusual for night shift but possible)
              estimatedCheckOut = checkInDate.set({
                hour: nightEndHour,
                minute: nightEndMinute,
                second: 0,
                millisecond: 0
              });
            }
          } else {
            // For day shift, use end of check-in day as before
            estimatedCheckOut = checkInDate.endOf('day');
          }

          const nowTime = Time.now();
          // Use the lesser of current time and estimated checkout time
          checkOut = Math.min(Time.toJSDate(nowTime).getTime(), estimatedCheckOut.toJSDate().getTime());
        }
        const hours = (checkOut - checkIn) / (1000 * 60 * 60);

        // Calculate late and graced status if checkIn exists
        let isLate = false;
        let isGraced = false;
        let lateHours = 0;
        let gracedHours = 0;

        if (att.checkIn) {
          const checkInTime = Time.fromJSDate(att.checkIn);
          const officeStart = checkInTime.set({ hour: currentWorkStartHour, minute: currentWorkStartMinute, second: 0, millisecond: 0 });
          const graceCutoff = checkInTime.set({ hour: currentGraceHour, minute: currentGraceMinute, second: 0, millisecond: 0 });

          // Calculate adjusted grace cutoff if short leave exists at start of day
          let adjustedGraceCutoff = graceCutoff;
          const shortLeaveInfo = shortLeaveDatesMap[empIdStr]?.get(dateStr);
          if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
            const shortLeaveStartTime = Time.fromTimeString(shortLeaveInfo.startTime, checkInTime);

            // If short leave starts at or before office start time, extend cutoff to short leave end time
            if (shortLeaveStartTime && shortLeaveStartTime <= officeStart) {
              const shortLeaveEndTime = Time.getShortLeaveEndTime(shortLeaveInfo.startTime, shortLeaveInfo.durationHours, checkInTime);
              if (shortLeaveEndTime) {
                // Use the later of grace cutoff or short leave end time
                adjustedGraceCutoff = shortLeaveEndTime > graceCutoff ? shortLeaveEndTime : graceCutoff;
              }
            }
          }

          if (att.isStatusUpdated && (att.status === "late" || att.status === "graced")) {
            isLate = att.status === "late";
            isGraced = att.status === "graced";
            lateHours = isLate ? Time.diff(checkInTime, officeStart, ["hours"]).hours : 0;
            gracedHours = isGraced ? Time.diff(checkInTime, officeStart, ["hours"]).hours : 0;
          } else {
            // For night shift, handle cross-midnight time comparison
            if (isNightShift && nightStartHour !== undefined) {
              // Night shift cross-midnight logic
              const checkInHour = checkInTime.hour;
              const checkInMinute = checkInTime.minute;
              const adjustedGraceHour = adjustedGraceCutoff.hour;
              const adjustedGraceMinute = adjustedGraceCutoff.minute;

              if (adjustedGraceHour > currentWorkStartHour) {
                // Grace time is same day as start time (e.g., start: 21:00, grace: 21:30)
                if (checkInHour >= currentWorkStartHour) {
                  // Check-in is same day as start time
                  if (checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute)) {
                    isLate = true;
                    lateHours = Time.diff(checkInTime, adjustedGraceCutoff, ["hours"]).hours;
                  } else if (checkInHour > currentWorkStartHour || (checkInHour === currentWorkStartHour && checkInMinute > currentWorkStartMinute)) {
                    isGraced = true;
                    gracedHours = Time.diff(checkInTime, officeStart, ["hours"]).hours;
                  }
                } else {
                  // Check-in is next day (very late) - definitely late
                  isLate = true;
                  lateHours = Time.diff(checkInTime, adjustedGraceCutoff, ["hours"]).hours;
                }
              } else {
                // Grace time spans to next day (e.g., start: 23:00, grace: 01:00 next day)
                if (checkInHour >= currentWorkStartHour) {
                  // Check-in same day as start - within grace if before midnight
                  if (checkInHour > currentWorkStartHour || (checkInHour === currentWorkStartHour && checkInMinute > currentWorkStartMinute)) {
                    isGraced = true;
                    gracedHours = Time.diff(checkInTime, officeStart, ["hours"]).hours;
                  }
                } else {
                  // Check-in next day
                  if (checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute)) {
                    isLate = true;
                    lateHours = Time.diff(checkInTime, adjustedGraceCutoff, ["hours"]).hours;
                  } else {
                    isGraced = true;
                    gracedHours = Time.diff(checkInTime, officeStart, ["hours"]).hours;
                  }
                }
              }
            } else {
              // Day shift logic (standard comparison)
              if (checkInTime > adjustedGraceCutoff) {
                isLate = true;
                lateHours = Time.diff(checkInTime, adjustedGraceCutoff, ["hours"]).hours;
              } else if (checkInTime > officeStart) {
                isGraced = true;
                gracedHours = Time.diff(checkInTime, officeStart, ["hours"]).hours;
              }
            }
          }
        }

        attendanceMap[key] = {
          hours,
          checkIn,
          checkOut,
          isLate,
          isGraced,
          shift: isNightShift ? "Night" : "Day",
          lateHours: Number(lateHours.toFixed(2)),
          gracedHours: Number(gracedHours.toFixed(2)),
        };
      } else {
        attendanceMap[key] = 0;
      }
    });

    const employeesWithStats = validEmployees.map((emp) => {
      const empIdStr = emp._id.toString();
      const empDateRange = employeeDateRanges[empIdStr];
      const dailyStats = [];

      let current = range.start;
      while (current <= range.end) {
        const dateStr = current.toISODate();

        // Skip this date if it's outside the employee's employment period
        if (current < empDateRange.start || current > empDateRange.end) {
          current = current.plus({ days: 1 });
          continue;
        }

        const key = `${empIdStr}|${dateStr}`;

        const isLeaveDay = leaveDatesMap[empIdStr]?.has(dateStr) || false;
        const isHoliday = holidayDates.has(dateStr);
        const isWeekend = weekendDates.has(dateStr);
        const attendance = attendanceMap[key];

        // If it's a non-working day (leave, holiday, or weekend), set everything to 0
        const isNonWorkingDay = isLeaveDay || isHoliday || isWeekend;

        // Get short leave info for this employee and date
        const shortLeaveInfo = shortLeaveDatesMap[empIdStr]?.get(dateStr);
        let finalWorkedHours = isNonWorkingDay ? 0 : (attendance?.hours || 0);

        // Check if employee is currently on short leave (only for today's date)
        const currentDate = Time.now().startOf('day');
        const isToday = current.hasSame(currentDate, 'day');
        let isCurrentlyOnShortLeave = false;

        if (isToday && shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
          const now = Time.now();
          const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, now);
          const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

          // Check if current time is within short leave period
          if (now >= shortLeaveStartDT && now <= shortLeaveEndDT) {
            isCurrentlyOnShortLeave = true;
          }
        }

        // Subtract only the overlapped hours with short leave if not a non-working day
        if (!isNonWorkingDay && shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours && finalWorkedHours > 0 && attendance && attendance.checkIn && attendance.checkOut) {
          // Parse short leave start and end times
          const checkInDT = Time.fromJSDate(new Date(attendance.checkIn));
          const checkOutDT = Time.fromJSDate(new Date(attendance.checkOut));
          const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, checkInDT);
          const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

          // Calculate overlap between attendance period and short leave period
          const overlapStart = checkInDT > shortLeaveStartDT ? checkInDT : shortLeaveStartDT;
          const overlapEnd = checkOutDT < shortLeaveEndDT ? checkOutDT : shortLeaveEndDT;

          let overlappedHours = 0;
          if (overlapEnd > overlapStart) {
            overlappedHours = overlapEnd.diff(overlapStart, 'hours').hours;
          }

          finalWorkedHours = Math.max(0, finalWorkedHours - overlappedHours);
        } else if (!isNonWorkingDay && shortLeaveInfo && shortLeaveInfo.durationHours && finalWorkedHours > 0) {
          // Fallback: subtract full duration if no startTime available or no complete attendance record
          finalWorkedHours = Math.max(0, finalWorkedHours - shortLeaveInfo.durationHours);
        }

        finalWorkedHours = Math.round(finalWorkedHours * 100) / 100;

        dailyStats.push({
          date: Time.toJSDate(current),
          attendanceShift: attendance?.shift || emp.shift || "Day",
          workedHours: finalWorkedHours,
          isLeaveDay,
          isLate: isNonWorkingDay ? false : (attendance?.isLate || false),
          lateHours: isNonWorkingDay ? 0 : (attendance?.lateHours || 0),
          isGraced: isNonWorkingDay ? false : (attendance?.isGraced || false),
          gracedHours: isNonWorkingDay ? 0 : (attendance?.gracedHours || 0),
          isHoliday,
          isWeekend,
          checkIn: isNonWorkingDay ? 0 : (attendance?.checkIn || 0),
          checkOut: isNonWorkingDay ? 0 : (attendance?.checkOut || 0),
          shortLeave: shortLeaveInfo ? {
            duration: shortLeaveInfo.durationHours,
            reason: shortLeaveInfo.reason,
            startTime: shortLeaveInfo.startTime,
            endTime: shortLeaveInfo.endTime,
            hasShortLeaveToday: true,
            isCurrentlyOnShortLeave: isCurrentlyOnShortLeave
          } : {
            hasShortLeaveToday: false,
            isCurrentlyOnShortLeave: false
          },
        });

        current = current.plus({ days: 1 });
      }

      return {
        employeeId: emp._id,
        employeeName: emp.firstName + " " + emp.lastName,
        employeeEmail: emp.email,
        employeeRole: emp.role,
        employeeDesignation: emp.designation,
        employeePhoto: emp.photoUrl || "",
        employeeDob: emp.dateOfBirth || null,
        employeeShift: emp.shift || "Day",
        department: emp.department || null,
        dailyStats,
        employmentStatus: emp.status, // Add employment status
        employmentPeriod: emp.status === "Terminated" && emp.terminationDate
          ? { startDate: emp.startDate, terminationDate: emp.terminationDate }
          : { startDate: emp.startDate },
        actualDateRange: {
          start: Time.toISODate(empDateRange.start),
          end: Time.toISODate(empDateRange.end)
        }
      };
    });

    const workHours = adminConfig?.workHourPerDay;

    res.status(200).json({ employees: employeesWithStats, workHours: workHours || 8 });
  } catch (error) {
    console.error("Error fetching work stats:", error);
    res.status(500).json({ error: error.message });
  }
}


// Controller to get today's attendance of a single employee
const getAttendanceByEmployeeID = async (req, res) => {
  try {
    const employeeId = req.params.id;
    const { startDate, endDate } = req.query;

    // Validate employeeId
    if (!employeeId) {
      return res.status(400).json({ message: "employeeId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employeeId format" });
    }

    // Case: startDate & endDate provided
    if (startDate && endDate) {
      const { start, end } = Time.getDateRangeFromISO(startDate, endDate);

      if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const attendance = await Attendance.find({
        employeeId,
        date: {
          $gte: Time.toJSDate(start),
          $lte: Time.toJSDate(end),
        },
      });

      if (!attendance || attendance.length === 0) {
        return res
          .status(200)
          .json({ message: "No attendance found in the selected range" });
      }

      return res.json(attendance); // return array
    }

    // Case: Default to current work shift (handles night shift cross-midnight logic)

    // Get employee information to determine shift
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Get current time and admin config for shift determination
    const todayLuxon = Time.today();
    const nowLuxon = Time.now();

    const config = await AdminConfig.findOne();
    if (!config) {
      return res.status(500).json({ message: "Admin configuration not found" });
    }

    // Use the same work start day logic as checkIn/checkOut to find current attendance
    let attendanceCandidates = [];

    // Always include today as a candidate
    attendanceCandidates.push(todayLuxon);

    // For night shift scenarios, also check yesterday
    // This handles cases where night shift employee's attendance is from yesterday but still active
    const isNightShift = employee.shift === "Night";

    if (isNightShift && config.nightShiftWorkingHours?.end) {
      const [endHourStr] = config.nightShiftWorkingHours.end.split(":");
      const endHour = parseInt(endHourStr, 10);
      const [startHourStr] = config.nightShiftWorkingHours.start.split(":");
      const startHour = parseInt(startHourStr, 10);
      const currentHour = nowLuxon.hour;

      // If shift crosses midnight and current time suggests we might be in the "next day" portion
      if (endHour < startHour) {
        // Add yesterday as a candidate if current time is before end hour (early morning)
        if (currentHour >= 0 && currentHour <= endHour + 1) { // +1 for grace period
          attendanceCandidates.unshift(todayLuxon.minus({ days: 1 }));
        }
      }
    }

    // Find the most relevant attendance record
    let todayAttendance = null;

    for (const candidateDate of attendanceCandidates) {
      const candidateDateJS = Time.toJSDate(candidateDate);
      const foundAttendance = await Attendance.findOne({
        employeeId,
        date: candidateDateJS
      });

      if (foundAttendance) {
        // Prioritize records that don't have checkout yet (active shifts)
        if (!foundAttendance.checkOut) {
          todayAttendance = foundAttendance;
          break;
        } else if (!todayAttendance) {
          // If no active record found yet, keep this as backup
          todayAttendance = foundAttendance;
        }
      }
    }

    if (!todayAttendance) {
      return res
        .status(200)
        .json({ message: "No attendance found for current work shift" });
    }

    return res.json(todayAttendance); // return object
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};


// Delete Attendance Record
const deleteAttendanceRecord = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ message: "Attendance ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid attendance ID format" });
    }

    const attendance = await Attendance.findByIdAndDelete(id);

    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    return res.status(200).json({ message: "Attendance record deleted successfully" });
  } catch (error) {
    console.error("Error deleting attendance record:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
}

// Controller to get attendance summary for multiple employees
const getAttendanceSummary = async (req, res) => {
  try {
    const { departmentIds, employeeIds, from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "'from' and 'to' are required" });
    }

    const { start, end } = Time.getDateRangeFromISO(from, to);
    if (!Time.isValidDateTime(start) || !Time.isValidDateTime(end)) {
      return res.status(400).json({ message: "Invalid 'from' or 'to' date format" });
    }

    const startJS = Time.toJSDate(start);
    const endJS = Time.toJSDate(end);

    // Fetch admin config
    const adminConfig = await AdminConfig.findOne().sort({ createdAt: -1 }).lean();
    if (!adminConfig?.workingHours?.start || !adminConfig?.nightShiftWorkingHours?.start) {
      return res.status(500).json({ message: "Working hours not configured." });
    }

    // Day shift configuration
    const [workStartHour, workStartMinute] = adminConfig.workingHours.start.split(":").map(Number);
    const [graceHour, graceMinute] = adminConfig.workingHours.grace
      ? adminConfig.workingHours.grace.split(":").map(Number)
      : [workStartHour, workStartMinute]; // Default to start time if no grace period

    // Night shift configuration (if available)
    let nightStartHour, nightStartMinute, nightGraceHour, nightGraceMinute;
    if (adminConfig.nightShiftWorkingHours?.start) {
      [nightStartHour, nightStartMinute] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
      [nightGraceHour, nightGraceMinute] = adminConfig.nightShiftWorkingHours.grace
        ? adminConfig.nightShiftWorkingHours.grace.split(":").map(Number)
        : [nightStartHour, nightStartMinute]; // Default to start time if no grace period
    }

    // Fetch holidays and weekends
    const events = await Event.aggregate([
      { $match: { type: { $in: ["holiday", "weekend"] } } },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: endJS },
          endDateParsed: { $gte: startJS }
        }
      }
    ]);

    const holidayDates = new Set();
    const weekendDates = new Set();
    events.forEach(event => {
      let current = Time.fromJSDate(event.startDateParsed < startJS ? startJS : event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed > endJS ? endJS : event.endDateParsed);
      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Employee filtering - exclude pending employees and include status check
    const employeeFilter = {
      role: { $ne: "Admin" },
      status: { $ne: "Pending" } // Exclude employees with pending status
    };
    if (employeeIds) employeeFilter._id = { $in: employeeIds.split(",").map(id => id.trim()) };
    if (departmentIds) employeeFilter.department = { $in: departmentIds.split(",").map(id => id.trim()) };

    const employees = await Employee.find(employeeFilter, "_id firstName lastName photoUrl department designation status startDate terminationDate shift")
      .populate("department", "name")
      .lean();

    // Create employee-specific date ranges based on their employment status
    const employeeDateRanges = {};
    employees.forEach(emp => {
      const empId = emp._id.toString();
      let empStart = start;
      let empEnd = end;

      // For terminated employees, limit the date range to their active period
      if ((emp.status === "Terminated" || emp.status === "Resigned") && emp.terminationDate) {
        const terminationDate = Time.fromJSDate(emp.terminationDate).startOf('day');
        empEnd = terminationDate < end ? terminationDate : end;
      }

      // If employee has a start date, don't include dates before they started
      if (emp.startDate) {
        const employeeStartDate = Time.fromJSDate(emp.startDate).startOf('day');
        empStart = employeeStartDate > start ? employeeStartDate : start;
      }

      // Only include employee if their employment period overlaps with requested range
      if (empStart <= empEnd) {
        employeeDateRanges[empId] = { start: empStart, end: empEnd };
      }
    });

    // Filter out employees who have no overlap with the requested date range
    const activeEmployeeIds = Object.keys(employeeDateRanges);

    if (!employees.length || !activeEmployeeIds.length) {
      return res.json({
        dateRange: { from: Time.toISODate(start), to: Time.toISODate(end) },
        overallSummary: { present: 0, graced: 0, late: 0, absent: 0, onLeave: 0, paidLeave: 0, unpaidLeave: 0 },
        dailySummaries: [],
      });
    }

    const employeeMap = Object.fromEntries(employees.map(e => [e._id.toString(), e]));

    // Fetch attendance records - only for active employees
    const attendances = await Attendance.find({
      employeeId: { $in: activeEmployeeIds },
      date: { $gte: startJS, $lte: endJS }
    }).lean();

    const attendanceMap = {};
    attendances.forEach(att => {
      const dateStr = Time.toISODate(Time.fromJSDate(att.date));
      attendanceMap[`${att.employeeId}|${dateStr}`] = att;
    });

    // Fetch approved leave records - only for active employees
    const leaves = await LeaveRequest.find({
      employeeId: { $in: activeEmployeeIds },
      startDate: { $lte: endJS },
      endDate: { $gte: startJS },
      status: "approved"
    }).lean();

    // Group leaves by employee to handle overlapping requests
    const leavesByEmployee = {};
    leaves.forEach(leave => {
      const empId = leave.employeeId.toString();
      if (!leavesByEmployee[empId]) {
        leavesByEmployee[empId] = [];
      }
      leavesByEmployee[empId].push(leave);
    });

    const leaveMap = {};
    const paidLeaveMap = {};
    const unpaidLeaveMap = {};

    // Process each employee's leaves individually to avoid overlap conflicts
    Object.keys(leavesByEmployee).forEach(empId => {
      const employeeLeaves = leavesByEmployee[empId];

      // Sort leaves by start date to process chronologically
      employeeLeaves.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      // Process each leave request individually
      employeeLeaves.forEach(leave => {
        let cur = Time.fromJSDate(leave.startDate).startOf("day");
        const leaveEnd = Time.fromJSDate(leave.endDate).endOf("day");

        // Collect working days in this leave request that are NOT already processed
        const workingDays = [];
        let tempCur = Time.fromJSDate(leave.startDate).startOf("day");
        while (tempCur <= leaveEnd) {
          const tempDateStr = Time.toISODate(tempCur);
          const tempKey = `${leave.employeeId}|${tempDateStr}`;
          const isHoliday = holidayDates.has(tempDateStr);
          const isWeekend = weekendDates.has(tempDateStr);

          // Only include working days that haven't been processed by previous leave requests
          if (!isHoliday && !isWeekend && !paidLeaveMap[tempKey] && !unpaidLeaveMap[tempKey]) {
            workingDays.push(tempDateStr);
          }
          tempCur = Time.add(tempCur, { days: 1 });
        }

        const paidDays = leave.paidLeave || 0;
        const unpaidDays = leave.unpaidLeave || 0;
        const totalAllocatedDays = paidDays + unpaidDays;

        // Apply paid/unpaid logic to available working days
        workingDays.forEach((workingDate, index) => {
          const key = `${leave.employeeId}|${workingDate}`;
          const workingDayNumber = index + 1;

          if (workingDayNumber <= paidDays) {
            paidLeaveMap[key] = true;
          } else {
            // All remaining working days should be unpaid leave
            unpaidLeaveMap[key] = true;
          }
        });

        // Mark ALL days in the leave period as leave days (including holidays/weekends)
        cur = Time.fromJSDate(leave.startDate).startOf("day");
        while (cur <= leaveEnd) {
          const dateStr = Time.toISODate(cur);
          const key = `${leave.employeeId}|${dateStr}`;
          const isHoliday = holidayDates.has(dateStr);
          const isWeekend = weekendDates.has(dateStr);
          leaveMap[key] = true;
          cur = Time.add(cur, { days: 1 });
        }
      });
    });

    // Fetch approved short leaves - only for active employees
    const shortLeaves = await ShortLeave.find({
      employeeId: { $in: activeEmployeeIds },
      status: "approved",
      date: { $gte: startJS, $lte: endJS }
    }).lean();

    const shortLeaveMap = {};
    shortLeaves.forEach(sl => {
      const dateStr = Time.fromJSDate(sl.date).startOf('day').toISODate();
      const empIdStr = sl.employeeId.toString();
      const key = `${empIdStr}|${dateStr}`;
      shortLeaveMap[key] = {
        durationHours: sl.durationHours || 0,
        reason: sl.reason || "",
        startTime: sl.startTime || null, // start time of short leave
        endTime: sl.endTime || null // end time of short leave
      };
    });

    // Process daily summaries
    const dateRange = Time.getDateRange(start, end);
    const dailySummaries = [];
    const overallSummary = { present: 0, graced: 0, late: 0, absent: 0, onLeave: 0, paidLeave: 0, unpaidLeave: 0 };

    for (const dt of dateRange) {
      const dateStr = Time.toISODate(dt);
      const isHoliday = holidayDates.has(dateStr);
      const isWeekend = weekendDates.has(dateStr);

      // If non-working day, return empty employee summary
      if (isHoliday || isWeekend) {
        dailySummaries.push({
          date: dateStr,
          isHoliday,
          isWeekend,
          employees: [],
          counts: { present: 0, graced: 0, late: 0, absent: 0, onLeave: 0, paidLeave: 0, unpaidLeave: 0 }
        });
        continue;
      }

      const daySummary = {
        date: dateStr,
        isHoliday: false,
        isWeekend: false,
        employees: [],
        counts: { present: 0, graced: 0, late: 0, absent: 0, onLeave: 0, paidLeave: 0, unpaidLeave: 0 }
      };

      for (const empId of activeEmployeeIds) {
        const emp = employeeMap[empId];
        const empDateRange = employeeDateRanges[empId];

        // Skip this employee if the current date is outside their employment period
        if (dt < empDateRange.start || dt > empDateRange.end) {
          continue;
        }

        const key = `${empId}|${dateStr}`;
        let status = "absent";
        let checkIn = null, checkOut = null, hoursWorked = 0;

        if (leaveMap[key]) {
          // For holidays and weekends during leave period, don't mark as paid/unpaid
          if (isHoliday || isWeekend) {
            status = "on leave"; // Just general leave, not consuming paid/unpaid balance
          } else {
            // Only working days consume paid/unpaid leave balance
            if (paidLeaveMap[key]) {
              status = "paid leave";
            } else if (unpaidLeaveMap[key]) {
              status = "unpaid leave";
            } else {
              status = "on leave"; // fallback
            }
          }
        } else if (attendanceMap[key]) {
          const att = attendanceMap[key];
          checkIn = att.checkIn ? Time.format(Time.fromJSDate(att.checkIn), "HH:mm") : null;
          checkOut = att.checkOut ? Time.format(Time.fromJSDate(att.checkOut), "HH:mm") : null;

          if (att.checkIn && att.checkOut) {
            hoursWorked = (att.checkOut.getTime() - att.checkIn.getTime()) / (1000 * 60 * 60);

            // Subtract only the overlapped hours with short leave
            const shortLeaveInfo = shortLeaveMap[key];
            if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours && hoursWorked > 0) {
              // Parse short leave start and end times
              const checkInDT = Time.fromJSDate(att.checkIn);
              const checkOutDT = Time.fromJSDate(att.checkOut);
              const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, checkInDT);
              const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

              // Calculate overlap between attendance period and short leave period
              const overlapStart = checkInDT > shortLeaveStartDT ? checkInDT : shortLeaveStartDT;
              const overlapEnd = checkOutDT < shortLeaveEndDT ? checkOutDT : shortLeaveEndDT;

              let overlappedHours = 0;
              if (overlapEnd > overlapStart) {
                overlappedHours = overlapEnd.diff(overlapStart, 'hours').hours;
              }

              hoursWorked = Math.max(0, hoursWorked - overlappedHours);
            } else if (shortLeaveInfo && shortLeaveInfo.durationHours && hoursWorked > 0) {
              // Fallback: subtract full duration if no startTime available
              hoursWorked = Math.max(0, hoursWorked - shortLeaveInfo.durationHours);
            }

            hoursWorked = Math.round(hoursWorked * 100) / 100;
          }

          const checkInTime = Time.fromJSDate(att.checkIn);

          // Determine which working hours to use based on attendance record shift with fallback
          const isNightShift = att.employeeShift === "Night" || (att.employeeShift !== "Day" && emp.shift === "Night");
          let currentWorkStartHour, currentWorkStartMinute, currentGraceHour, currentGraceMinute;

          if (isNightShift && nightStartHour !== undefined) {
            // Use night shift working hours
            currentWorkStartHour = nightStartHour;
            currentWorkStartMinute = nightStartMinute;
            currentGraceHour = nightGraceHour;
            currentGraceMinute = nightGraceMinute;
          } else {
            // Use day shift working hours (default for employees without shift or Day shift)
            currentWorkStartHour = workStartHour;
            currentWorkStartMinute = workStartMinute;
            currentGraceHour = graceHour;
            currentGraceMinute = graceMinute;
          }

          // Calculate adjusted grace cutoff if short leave exists at start of day
          let adjustedGraceHour = currentGraceHour;
          let adjustedGraceMinute = currentGraceMinute;

          const shortLeaveInfo = shortLeaveMap[key];
          if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
            const shortLeaveStartTime = Time.fromTimeString(shortLeaveInfo.startTime, checkInTime);
            const officeStart = checkInTime.set({ hour: currentWorkStartHour, minute: currentWorkStartMinute, second: 0, millisecond: 0 });

            // If short leave starts at or before office start time, extend cutoff to short leave end time
            if (shortLeaveStartTime && shortLeaveStartTime <= officeStart) {
              const shortLeaveEndTime = Time.getShortLeaveEndTime(shortLeaveInfo.startTime, shortLeaveInfo.durationHours, checkInTime);
              if (shortLeaveEndTime) {
                const graceCutoff = checkInTime.set({ hour: currentGraceHour, minute: currentGraceMinute, second: 0, millisecond: 0 });
                // Use the later of grace cutoff or short leave end time
                const adjustedGraceCutoff = shortLeaveEndTime > graceCutoff ? shortLeaveEndTime : graceCutoff;
                adjustedGraceHour = adjustedGraceCutoff.hour;
                adjustedGraceMinute = adjustedGraceCutoff.minute;
              }
            }
          }

          // For night shift, handle cross-midnight time comparison
          let isLate = false;
          let isGraced = false;

          if (isNightShift && nightStartHour !== undefined) {
            // Night shift cross-midnight logic
            const checkInHour = checkInTime.hour;
            const checkInMinute = checkInTime.minute;

            // For night shift, we need to handle the case where grace/start times might be 
            // on the previous day (e.g., night shift starts at 21:00, grace at 21:30)
            // and check-in might be on the next day (e.g., checking in at 22:00 same day or 01:00 next day)

            if (adjustedGraceHour > currentWorkStartHour) {
              // Grace time is same day as start time (e.g., start: 21:00, grace: 21:30)
              if (checkInHour >= currentWorkStartHour) {
                // Check-in is same day as start time
                isLate = checkInHour > adjustedGraceHour ||
                  (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute);
                isGraced = !isLate && (checkInHour > currentWorkStartHour ||
                  (checkInHour === currentWorkStartHour && checkInMinute > currentWorkStartMinute));
              } else {
                // Check-in is next day (very late) - definitely late
                isLate = true;
              }
            } else {
              // Grace time spans to next day (e.g., start: 23:00, grace: 01:00 next day)
              if (checkInHour >= currentWorkStartHour) {
                // Check-in same day as start - within grace if before midnight
                isGraced = checkInHour > currentWorkStartHour ||
                  (checkInHour === currentWorkStartHour && checkInMinute > currentWorkStartMinute);
              } else {
                // Check-in next day
                isLate = checkInHour > adjustedGraceHour ||
                  (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute);
                isGraced = !isLate;
              }
            }
          } else {
            // Day shift logic (standard comparison)
            isLate = checkInTime.hour > adjustedGraceHour ||
              (checkInTime.hour === adjustedGraceHour && checkInTime.minute > adjustedGraceMinute);
            isGraced = !isLate && (checkInTime.hour > currentWorkStartHour ||
              (checkInTime.hour === currentWorkStartHour && checkInTime.minute > currentWorkStartMinute));
          }

          // Determine final status
          if (isLate) {
            status = "late";
          } else if (isGraced) {
            status = "graced";
          } else {
            status = "present";
          }
        }

        // Check if employee is currently on short leave (only for today's date)
        const currentDate = Time.now().startOf('day');
        const isToday = dt.hasSame(currentDate, 'day');
        const shortLeaveInfo = shortLeaveMap[key];
        let isCurrentlyOnShortLeave = false;

        if (isToday && shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
          const now = Time.now();
          const shortLeaveStartDT = Time.fromTimeString(shortLeaveInfo.startTime, now);
          const shortLeaveEndDT = shortLeaveStartDT.plus({ hours: shortLeaveInfo.durationHours });

          // Check if current time is within short leave period
          if (now >= shortLeaveStartDT && now <= shortLeaveEndDT) {
            isCurrentlyOnShortLeave = true;
          }
        }

        // Update counts based on status
        if (status === "paid leave") {
          daySummary.counts.paidLeave++;
          overallSummary.paidLeave++;
          // Also count as general leave for backward compatibility
          daySummary.counts.onLeave++;
          overallSummary.onLeave++;
        } else if (status === "unpaid leave") {
          daySummary.counts.unpaidLeave++;
          overallSummary.unpaidLeave++;
          // Also count as general leave for backward compatibility
          daySummary.counts.onLeave++;
          overallSummary.onLeave++;
        } else {
          // Handle other statuses (present, graced, late, absent, on leave)
          if (status === "on leave") {
            daySummary.counts.onLeave++;
            overallSummary.onLeave++;
          } else {
            daySummary.counts[status]++;
            overallSummary[status]++;
          }
        }

        // Determine employee shift from attendance record or fallback to employee shift
        const attendanceRecord = attendanceMap[key];
        const employeeShift = attendanceRecord ?
          (attendanceRecord.employeeShift === "Night" || (attendanceRecord.employeeShift !== "Day" && emp.shift === "Night") ? "Night" : "Day") :
          (emp.shift || "Day");

        daySummary.employees.push({
          employeeId: empId,
          name: `${emp.firstName} ${emp.lastName}`,
          shift: employeeShift,
          photoUrl: emp.photoUrl || "",
          designation: emp.designation || "",
          department: emp.department?.name || "",
          attendanceId: attendanceMap[key]?._id || null,
          status: attendanceMap[key]?.isStatusUpdated ? attendanceMap[key]?.status : status,
          leaveType: (isHoliday || isWeekend) ? null : (paidLeaveMap[key] ? "paid" : (unpaidLeaveMap[key] ? "unpaid" : null)),
          checkIn,
          checkOut,
          hoursWorked,
          isUpdated: attendanceMap[key]?.updated?.length > 0 ? true : false,
          isAutoCheckout: attendanceMap[key]?.checkOutLocation?.from === "auto" ? true : false,
          manuallyCreated: attendanceMap[key]?.manuallyCreated || false,
          employmentStatus: emp.status, // Add employment status (Active, Terminated, etc.)
          employmentPeriod: emp.status === "Terminated" && emp.terminationDate
            ? { startDate: emp.startDate, terminationDate: emp.terminationDate }
            : { startDate: emp.startDate },
          shortLeave: shortLeaveMap[key] ? {
            duration: shortLeaveMap[key].durationHours,
            reason: shortLeaveMap[key].reason,
            startTime: shortLeaveMap[key].startTime,
            endTime: shortLeaveMap[key].endTime,
            hasShortLeaveToday: true,
            isCurrentlyOnShortLeave: isCurrentlyOnShortLeave
          } : {
            hasShortLeaveToday: false,
            isCurrentlyOnShortLeave: false
          }
        });
      }

      dailySummaries.push(daySummary);
    }

    return res.json({
      dateRange: { from: Time.toISODate(start), to: Time.toISODate(end) },
      overallSummary,
      dailySummaries
    });

  } catch (err) {
    console.error("Attendance Summary Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


// Get Attendance record by id
const getAttendanceById = async (req, res) => {
  try {
    const attendanceId = req.params.id;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "Attendance ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
      return res.status(400).json({ success: false, message: "Invalid attendance ID format" });
    }

    const attendance = await Attendance.findById(attendanceId)
      .populate({
        path: "employeeId",
        select: "firstName lastName email photoUrl role department shift",
        populate: {
          path: "department", // field in Employee schema
          select: "name description", // choose department fields
        }
      })
      .populate({
        path: "updated.updatedBy",
        select: "firstName lastName email photoUrl role department",
        populate: {
          path: "department",
          select: "name description",
        }
      })
      .lean();
    if (!attendance) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    return res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    console.error("Error fetching attendance by ID:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


// Update Attendance record by id
const updateAttendanceRecord = async (req, res) => {
  try {
    const attendanceId = req.params.id;
    const { employeeShift, checkIn, checkOut, status, lateReason, remarks, updatedBy } = req.body;
    if (!attendanceId) {
      return res.status(400).json({ success: false, message: "Attendance ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) {
      return res.status(400).json({ success: false, message: "Invalid attendance ID format" });
    }
    const attendance = await Attendance.findById(attendanceId)
      .populate('employeeId', 'shift');
    if (!attendance) {
      return res.status(404).json({ success: false, message: "Attendance record not found" });
    }

    // Determine if employee is night shift
    const isNightShift = attendance.employeeShift === "Night";

    const updatedFields = [];

    // Get the original attendance date to preserve it when updating times
    const attendanceDate = Time.fromJSDate(attendance.date);

    if (employeeShift) {
      attendance.employeeShift = employeeShift;
      updatedFields.push({
        field: "employeeShift",
        oldValue: attendance.employeeShift || "Day",
        newValue: employeeShift
      });
    }

    if (checkIn) {
      let checkInDateTime;

      // Check if checkIn is just time (HH:MM format) or full ISO datetime
      if (checkIn.match(/^\d{2}:\d{2}$/)) {
        // If it's just time format (HH:MM), combine with attendance date
        const [hours, minutes] = checkIn.split(':').map(Number);

        // For night shift employees, handle cross-midnight scenarios
        if (isNightShift && hours < 12) {
          // If check-in time is before noon for night shift, it's likely next day check-in
          checkInDateTime = attendanceDate.plus({ days: 1 }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        } else {
          checkInDateTime = attendanceDate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        }
      } else {
        // If it's full ISO datetime, parse it normally but preserve the date part
        const parsedDateTime = Time.fromISO(checkIn);
        if (!Time.isValidDateTime(parsedDateTime)) {
          return res.status(400).json({ success: false, message: "Invalid check-in date format" });
        }

        const hours = parsedDateTime.hour;

        // For night shift employees, handle cross-midnight scenarios
        if (isNightShift && hours < 12) {
          // If check-in time is before noon for night shift, it's likely next day check-in
          checkInDateTime = attendanceDate.plus({ days: 1 }).set({
            hour: parsedDateTime.hour,
            minute: parsedDateTime.minute,
            second: parsedDateTime.second,
            millisecond: parsedDateTime.millisecond
          });
        } else {
          // Combine attendance date with parsed time
          checkInDateTime = attendanceDate.set({
            hour: parsedDateTime.hour,
            minute: parsedDateTime.minute,
            second: parsedDateTime.second,
            millisecond: parsedDateTime.millisecond
          });
        }
      }

      if (!Time.isValidDateTime(checkInDateTime)) {
        return res.status(400).json({ success: false, message: "Invalid check-in time format" });
      }

      const checkInDate = Time.toJSDate(checkInDateTime);
      updatedFields.push({
        field: "checkIn",
        oldValue: attendance.checkIn ? Time.formatJSDateForFrontend(attendance.checkIn) : null,
        newValue: Time.formatForFrontend(checkInDateTime)
      });
      attendance.checkIn = checkInDate;
    }

    if (checkOut) {
      let checkOutDateTime;

      // Check if checkOut is just time (HH:MM format) or full ISO datetime
      if (checkOut.match(/^\d{2}:\d{2}$/)) {
        // If it's just time format (HH:MM), combine with attendance date
        const [hours, minutes] = checkOut.split(':').map(Number);

        // For night shift employees, handle cross-midnight scenarios
        if (isNightShift && hours < 12) {
          // If check-out time is before noon for night shift, it's likely next day check-out
          checkOutDateTime = attendanceDate.plus({ days: 1 }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        } else {
          checkOutDateTime = attendanceDate.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        }
      } else {
        // If it's full ISO datetime, parse it normally but preserve the date part
        const parsedDateTime = Time.fromISO(checkOut);
        if (!Time.isValidDateTime(parsedDateTime)) {
          return res.status(400).json({ success: false, message: "Invalid check-out date format" });
        }

        const hours = parsedDateTime.hour;

        // For night shift employees, handle cross-midnight scenarios
        if (isNightShift && hours < 12) {
          // If check-out time is before noon for night shift, it's likely next day check-out
          checkOutDateTime = attendanceDate.plus({ days: 1 }).set({
            hour: parsedDateTime.hour,
            minute: parsedDateTime.minute,
            second: parsedDateTime.second,
            millisecond: parsedDateTime.millisecond
          });
        } else {
          // Combine attendance date with parsed time
          checkOutDateTime = attendanceDate.set({
            hour: parsedDateTime.hour,
            minute: parsedDateTime.minute,
            second: parsedDateTime.second,
            millisecond: parsedDateTime.millisecond
          });
        }
      }

      if (!Time.isValidDateTime(checkOutDateTime)) {
        return res.status(400).json({ success: false, message: "Invalid check-out time format" });
      }

      const checkOutDate = Time.toJSDate(checkOutDateTime);
      updatedFields.push({
        field: "checkOut",
        oldValue: attendance.checkOut ? Time.formatJSDateForFrontend(attendance.checkOut) : null,
        newValue: Time.formatForFrontend(checkOutDateTime)
      });
      attendance.checkOut = checkOutDate;
    }

    if (status) {
      const oldStatus = attendance.status;
      updatedFields.push({
        field: "status",
        oldValue: oldStatus,
        newValue: status
      });
      attendance.status = status;
      attendance.isStatusUpdated = true;
    }
    if (lateReason) {
      const oldLateReason = attendance.lateReason;
      updatedFields.push({
        field: "lateReason",
        oldValue: oldLateReason || null,
        newValue: lateReason
      });
      attendance.lateReason = lateReason;
    }
    if (remarks) {
      const oldRemarks = attendance.remarks;
      updatedFields.push({
        field: "remarks",
        oldValue: oldRemarks || null,
        newValue: remarks
      });
      attendance.remarks = remarks;
    }
    if (updatedBy) {
      // Convert updatedFields array to a formatted string for frontend
      const changesString = updatedFields.map(change => {
        if (change.field === "checkIn" || change.field === "checkOut") {
          return `${change.field}: ${change.oldValue || 'Not set'} → ${change.newValue}`;
        } else {
          return `${change.field}: "${change.oldValue || 'Not set'}" → "${change.newValue}"`;
        }
      }).join(', ');

      attendance.updated.push({
        updatedBy,
        updatedAt: Time.now().toJSDate(),
        changes: changesString,
      });
    }

    const updatedAttendance = await attendance.save();

    return res.status(200).json({ success: true, data: updatedAttendance });
  } catch (error) {
    console.error("Error updating attendance record:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
}

// Controller to get detailed attendance report with status codes
const getDetailedAttendanceReport = async (req, res) => {
  try {
    const { departmentIds, employeeIds, monthkey, date } = req.query;

    // Handle date parameter and extract month/year for monthly report
    const now = Time.now();
    let targetYear, targetMonth, targetDate = null;

    if (date) {
      // Parse date and extract month/year for monthly report
      targetDate = Time.fromISO(date).startOf('day');
      if (!Time.isValidDateTime(targetDate)) {
        return res.status(400).json({ message: "Invalid date format. Please use ISO format (YYYY-MM-DD)" });
      }
      targetYear = targetDate.year;
      targetMonth = targetDate.month;
    } else if (monthkey) {
      // Parse YYYY-MM format
      const monthkeyMatch = monthkey.match(/^(\d{4})-(\d{2})$/);
      if (!monthkeyMatch) {
        return res.status(400).json({ message: "Invalid monthkey format. Use YYYY-MM format (e.g., 2025-07)" });
      }
      targetYear = parseInt(monthkeyMatch[1]);
      targetMonth = parseInt(monthkeyMatch[2]);

      // Validate month range
      if (targetMonth < 1 || targetMonth > 12) {
        return res.status(400).json({ message: "Invalid month. Month should be between 01-12" });
      }
    } else {
      // Default to current month
      targetYear = now.year;
      targetMonth = now.month;
    }

    // Create date range for the specified month
    const startOfMonth = Time.fromObject({ year: targetYear, month: targetMonth, day: 1 }).startOf('day');
    const endOfMonth = startOfMonth.endOf('month');

    const startJS = Time.toJSDate(startOfMonth);
    const endJS = Time.toJSDate(endOfMonth);

    // Build employee filter - exclude pending employees
    let empFilter = {
      role: { $ne: "Admin" },
      status: { $ne: "Pending" }
    };

    if (departmentIds && departmentIds.trim() !== "") {
      empFilter.department = { $in: departmentIds.split(",").map(id => id.trim()) };
    }

    if (employeeIds && employeeIds.trim() !== "") {
      empFilter._id = { $in: employeeIds.split(",").map(id => id.trim()) };
    }

    const employees = await Employee.find(empFilter, "_id firstName lastName designation department status startDate terminationDate")
      .populate("department", "name")
      .lean();

    if (!employees.length) {
      return res.status(200).json([]);
    }

    // Create employee-specific date ranges based on their employment status
    const employeeDateRanges = {};
    const validEmployees = [];

    employees.forEach(emp => {
      const empId = emp._id.toString();
      let empStart = startOfMonth;
      let empEnd = endOfMonth;

      // For terminated employees, limit the date range to their active period
      if ((emp.status === "Terminated" || emp.status === "Resigned") && emp.terminationDate) {
        const terminationDate = Time.fromJSDate(emp.terminationDate).startOf('day');
        empEnd = terminationDate < endOfMonth ? terminationDate : endOfMonth;
      }

      // If employee has a start date, don't include dates before they started
      if (emp.startDate) {
        const employeeStartDate = Time.fromJSDate(emp.startDate).startOf('day');
        empStart = employeeStartDate > startOfMonth ? employeeStartDate : startOfMonth;
      }

      // Only include employee if their employment period overlaps with requested range
      if (empStart <= empEnd) {
        employeeDateRanges[empId] = { start: empStart, end: empEnd };
        validEmployees.push(emp);
      }
    });

    if (!validEmployees.length) {
      return res.status(200).json([]);
    }

    const employeeIdSet = new Set(validEmployees.map((e) => e._id.toString()));

    // Get admin config for working hours and grace period
    const adminConfig = await AdminConfig.findOne({});
    if (!adminConfig?.workingHours?.start) {
      return res.status(500).json({ message: "Working hours not configured." });
    }

    const [workStartHour, workStartMinute] = adminConfig.workingHours.start.split(":").map(Number);
    const [nightWorkStartHour, nightWorkStartMinute] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
    const [graceHour, graceMinute] = adminConfig.workingHours.grace
      ? adminConfig.workingHours.grace.split(":").map(Number)
      : [workStartHour, workStartMinute];
    const [nightGraceHour, nightGraceMinute] = adminConfig.nightShiftWorkingHours.grace
      ? adminConfig.nightShiftWorkingHours.grace.split(":").map(Number)
      : [nightWorkStartHour, nightWorkStartMinute];

    // Fetch attendance records
    const attendanceRecords = await Attendance.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      date: { $gte: startJS, $lte: endJS },
    }).lean();

    // Fetch approved leave records
    const leaveRecords = await LeaveRequest.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      status: "approved",
      startDate: { $lte: endJS },
      endDate: { $gte: startJS },
    }).lean();

    // Fetch approved short leaves
    const shortLeaves = await ShortLeave.find({
      employeeId: { $in: Array.from(employeeIdSet).map(id => new mongoose.Types.ObjectId(id)) },
      status: "approved",
      date: { $gte: startJS, $lte: endJS }
    }).lean();

    // Fetch holidays and weekends
    const events = await Event.aggregate([
      { $match: { type: { $in: ["holiday", "weekend"] } } },
      {
        $addFields: {
          startDateParsed: { $dateFromString: { dateString: "$startDate" } },
          endDateParsed: { $dateFromString: { dateString: "$endDate" } }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: endJS },
          endDateParsed: { $gte: startJS }
        }
      }
    ]);

    // Create holiday and weekend date sets (needed for leave mapping)
    const holidayDates = new Set();
    const weekendDates = new Set();
    events.forEach(event => {
      let current = Time.fromJSDate(event.startDateParsed < startJS ? startJS : event.startDateParsed);
      const eventEnd = Time.fromJSDate(event.endDateParsed > endJS ? endJS : event.endDateParsed);
      while (current <= eventEnd) {
        const dateStr = current.toISODate();
        if (event.type === "holiday") holidayDates.add(dateStr);
        if (event.type === "weekend") weekendDates.add(dateStr);
        current = current.plus({ days: 1 });
      }
    });

    // Create lookup maps
    const attendanceMap = {};
    attendanceRecords.forEach((att) => {
      const dateStr = Time.fromJSDate(att.date).toISODate();
      const empIdStr = att.employeeId.toString();
      const key = `${empIdStr}|${dateStr}`;
      attendanceMap[key] = att;
    });

    const leaveMap = {};
    leaveRecords.forEach(leave => {
      let cur = Time.fromJSDate(leave.startDate).startOf("day");
      const leaveEnd = Time.fromJSDate(leave.endDate).endOf("day");

      // Get paid and unpaid leave days from the leave record
      const paidDays = leave.paidLeave || 0;
      const unpaidDays = leave.unpaidLeave || 0;

      let dayCounter = 0;

      while (cur <= leaveEnd) {
        const dateStr = cur.toISODate();
        const empIdStr = leave.employeeId.toString();
        const key = `${empIdStr}|${dateStr}`;

        // Check if this day is a working day (not holiday/weekend)
        const isHoliday = holidayDates.has(dateStr);
        const isWeekend = weekendDates.has(dateStr);

        // Only count working days for paid/unpaid calculation
        if (!isHoliday && !isWeekend) {
          dayCounter++;

          // Determine if this working day is paid or unpaid
          if (dayCounter <= paidDays) {
            leaveMap[key] = { ...leave, leaveType: "PL" }; // Paid Leave
          } else {
            leaveMap[key] = { ...leave, leaveType: "UL" }; // Unpaid Leave
          }
        } else {
          // For holidays/weekends during leave period, still mark as leave but don't count towards paid/unpaid
          leaveMap[key] = { ...leave, leaveType: "L" }; // Regular leave for non-working days
        }

        cur = cur.plus({ days: 1 });
      }
    });

    const shortLeaveMap = {};
    shortLeaves.forEach(sl => {
      const dateStr = Time.fromJSDate(sl.date).startOf('day').toISODate();
      const empIdStr = sl.employeeId.toString();
      const key = `${empIdStr}|${dateStr}`;
      shortLeaveMap[key] = {
        durationHours: sl.durationHours || 0,
        reason: sl.reason || "",
        startTime: sl.startTime || null
      };
    });

    // Process each employee
    const reportData = validEmployees.map((emp, index) => {
      const empIdStr = emp._id.toString();
      const empDateRange = employeeDateRanges[empIdStr];

      // Initialize counters
      let totalPresent = 0;
      let latePresent = 0;
      let halfOrEarlyLeave = 0;
      let weeklyHoliday = 0;
      let govtHoliday = 0;
      let paidLeave = 0;
      let unpaidLeave = 0;
      let absent = 0;

      const summary = [];
      const dateRange = Time.getDateRange(startOfMonth, endOfMonth);

      // Calculate total days in month
      const totalDays = dateRange.length;

      // Calculate extra days (days outside employment period)
      let extraDays = 0;

      for (const dt of dateRange) {
        const dateStr = dt.toISODate();
        const key = `${empIdStr}|${dateStr}`;

        // Check if date is outside employee's employment period
        if (dt < empDateRange.start || dt > empDateRange.end) {
          extraDays++;
          continue; // Skip dates outside employment period
        }

        // Check if this is a future date (after today)
        const today = Time.now().startOf('day');
        const isFutureDate = dt > today;

        let status = "A"; // Default to absent

        // For future dates, don't mark as absent - skip processing
        if (isFutureDate) {
          // Don't add to summary for future dates, or add with empty status
          summary.push({
            date: dateStr,
            status: "" // Empty status for future dates
          });
          continue;
        }

        // Check for holidays and weekends first
        if (holidayDates.has(dateStr)) {
          status = "GH"; // Government Holiday
          govtHoliday++;
        } else if (weekendDates.has(dateStr)) {
          status = "WH"; // Weekly Holiday
          weeklyHoliday++;
        } else if (leaveMap[key]) {
          // Use the leaveType from the mapped leave record
          const leaveRecord = leaveMap[key];
          status = leaveRecord.leaveType; // "PL", "UL", or "L"

          if (status === "PL") {
            paidLeave++;
          } else if (status === "UL") {
            unpaidLeave++;
          } else {
            // This is for holidays/weekends during leave (status = "L")
            // These are already counted as holidays/weekends above
          }
        } else if (attendanceMap[key]) {
          const att = attendanceMap[key];
          const shortLeaveInfo = shortLeaveMap[key];

          if (att.checkIn) {
            const checkInTime = Time.fromJSDate(att.checkIn);
            const isNightShift = att.employeeShift === "Night" || (att.employeeShift !== "Day" && emp.shift === "Night");
            const workHourStart = isNightShift ? adminConfig.nightShiftWorkingHours.start : adminConfig.workingHours.start;
            const workHourEnd = isNightShift ? adminConfig.nightShiftWorkingHours.end : adminConfig.workingHours.end;

            // Calculate adjusted grace cutoff if short leave exists at start of day
            let adjustedGraceHour = isNightShift ? nightGraceHour : graceHour;
            let adjustedGraceMinute = isNightShift ? nightGraceMinute : graceMinute;

            if (shortLeaveInfo && shortLeaveInfo.startTime && shortLeaveInfo.durationHours) {
              // For night shift, handle cross-midnight scenario properly
              let workStartTime, shortLeaveStartTime, shortLeaveEndTime;

              if (isNightShift) {
                const [startHour, startMinute] = workHourStart.split(":").map(Number);
                const [endHour, endMinute] = workHourEnd.split(":").map(Number);

                // Anchor the shift to the attendance day `dt`
                workStartTime = dt.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });

                let workEndCandidate = dt.set({ hour: endHour, minute: endMinute ?? 0, second: 0, millisecond: 0 });
                const crossesMidnight = workEndCandidate <= workStartTime;
                const workEndTime = crossesMidnight ? workEndCandidate.plus({ days: 1 }) : workEndCandidate;

                // Map short-leave into this window
                if (shortLeaveInfo?.startTime && shortLeaveInfo?.durationHours) {
                  const [slH, slM] = shortLeaveInfo.startTime.split(":").map(Number);

                  // Place SL on the same calendar day as shift start, then push to next day if it's after midnight
                  let slStart = dt.set({ hour: slH, minute: slM, second: 0, millisecond: 0 });
                  if (slStart < workStartTime) slStart = slStart.plus({ days: 1 });

                  shortLeaveStartTime = slStart;
                  shortLeaveEndTime = slStart.plus({ hours: Number(shortLeaveInfo.durationHours) });
                }
              } else {
                // Day shift (unchanged)
                workStartTime = Time.fromTimeString(workHourStart, dt);
                if (shortLeaveInfo?.startTime && shortLeaveInfo?.durationHours) {
                  shortLeaveStartTime = Time.fromTimeString(shortLeaveInfo.startTime, dt);
                  shortLeaveEndTime = shortLeaveStartTime.plus({ hours: Number(shortLeaveInfo.durationHours) });
                }
              }

              // Only extend grace if short leave starts at or before office start time
              if (shortLeaveStartTime && workStartTime && shortLeaveStartTime <= workStartTime) {
                if (shortLeaveEndTime) {
                  const graceCutoff = checkInTime.set({ hour: adjustedGraceHour, minute: adjustedGraceMinute, second: 0, millisecond: 0 });
                  // Use the later of grace cutoff or short leave end time
                  const finalGraceCutoff = shortLeaveEndTime > graceCutoff ? shortLeaveEndTime : graceCutoff;
                  adjustedGraceHour = finalGraceCutoff.hour;
                  adjustedGraceMinute = finalGraceCutoff.minute;
                }
              }
            }

            // Check if employee was late (after adjusted grace period) - handle night shift cross-midnight
            let isLate = false;
            if (isNightShift) {
              const checkInHour = checkInTime.hour;
              const checkInMinute = checkInTime.minute;
              const [startHour] = workHourStart.split(":").map(Number);

              // For night shift cross-midnight logic
              if (adjustedGraceHour > startHour) {
                // Grace time is same day as start time
                if (checkInHour >= startHour) {
                  // Check-in is same day as start time
                  isLate = checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute);
                } else {
                  // Check-in is next day (very late)
                  isLate = true;
                }
              } else {
                // Grace time spans to next day
                if (checkInHour >= startHour) {
                  // Check-in same day as start - not late yet
                  isLate = false;
                } else {
                  // Check-in next day
                  isLate = checkInHour > adjustedGraceHour || (checkInHour === adjustedGraceHour && checkInMinute > adjustedGraceMinute);
                }
              }
            } else {
              // Day shift logic
              isLate = checkInTime.hour > adjustedGraceHour || (checkInTime.hour === adjustedGraceHour && checkInTime.minute > adjustedGraceMinute);
            }

            // Check for early leave or half day - handle night shift properly
            let hasEarlyLeave = false;
            if (att.checkOut && att.checkIn) {
              const checkOutTime = Time.fromJSDate(att.checkOut);
              const [endHour] = workHourEnd.split(":").map(Number);

              if (isNightShift) {
                const [startHour] = workHourStart.split(":").map(Number);
                // For cross-midnight shifts
                if (endHour < startHour) {
                  // If checkout is same day as checkin but before expected end time next day
                  const checkInDay = checkInTime.startOf('day');
                  const checkOutDay = checkOutTime.startOf('day');

                  if (checkInDay.equals(checkOutDay)) {
                    // Same day checkout - this is early leave for night shift
                    hasEarlyLeave = true;
                  } else {
                    // Next day checkout - check if before expected end time
                    hasEarlyLeave = checkOutTime.hour < endHour;
                  }
                } else {
                  // Same day shift
                  hasEarlyLeave = checkOutTime.hour < endHour;
                }
              } else {
                // Day shift
                hasEarlyLeave = checkOutTime.hour < endHour;
              }
            }

            if (shortLeaveInfo && shortLeaveInfo.durationHours >= 4) {
              status = "HL"; // Half Day Leave (short leave >= 4 hours)
              halfOrEarlyLeave++;
              totalPresent++;
            } else if (hasEarlyLeave) {
              status = "EL"; // Early Leave
              halfOrEarlyLeave++;
              totalPresent++;
            } else if (isLate) {
              status = "LP"; // Late Present
              latePresent++;
              totalPresent++;
            } else {
              status = "P"; // Present
              totalPresent++;
            }
          } else {
            // Has attendance record but no check-in time
            status = "A"; // Absent
            absent++;
          }
        } else {
          // No attendance record
          status = "A"; // Absent
          absent++;
        }

        summary.push({
          date: dateStr,
          status: status
        });
      }

      return {
        sl: index + 1,
        name: `${emp.firstName} ${emp.lastName}`,
        designation: emp.designation || "N/A",
        totalDays: totalDays,
        extraDays: extraDays,
        totalPresent: totalPresent,
        latePresent: latePresent,
        halfOrEarlyLeave: halfOrEarlyLeave,
        weeklyHoliday: weeklyHoliday,
        govtHoliday: govtHoliday,
        paidLeave: paidLeave,
        unpaidLeave: unpaidLeave,
        absent: absent,
        summary: summary
      };
    });

    // If date parameter is provided, also generate daily summary
    let dailySummary = null;
    if (targetDate) {
      try {
        const targetDateJS = Time.toJSDate(targetDate);
        const tomorrow = Time.toJSDate(targetDate.plus({ days: 1 }));

        // Build department filter for daily summary
        const departmentFilter = {};
        if (departmentIds && departmentIds.trim() !== "") {
          departmentFilter.department = {
            $in: departmentIds.split(",").map(id => new mongoose.Types.ObjectId(id.trim()))
          };
        }

        // Get all employees (excluding admins and pending employees)
        const employeeFilter = {
          role: { $ne: "Admin" },
          status: { $ne: "Pending" },
          ...departmentFilter
        };

        // Get employee counts by role
        const employeeCounts = await Employee.aggregate([
          { $match: employeeFilter },
          {
            $group: {
              _id: "$role",
              count: { $sum: 1 }
            }
          }
        ]);

        // Transform to expected format
        const employeeCountByRole = {
          Employee: 0,
          Manager: 0,
          DepartmentHead: 0
        };

        employeeCounts.forEach(roleCount => {
          if (roleCount._id === "Employee") employeeCountByRole.Employee = roleCount.count;
          if (roleCount._id === "Manager") employeeCountByRole.Manager = roleCount.count;
          if (roleCount._id === "DepartmentHead") employeeCountByRole.DepartmentHead = roleCount.count;
        });

        // Total employees
        const totalEmployees = employeeCountByRole.Employee +
          employeeCountByRole.Manager +
          employeeCountByRole.DepartmentHead;

        // Get all employees who are active on the target date
        const activeEmployees = await Employee.find({
          ...employeeFilter,
          $or: [
            { terminationDate: { $exists: false } },
            { terminationDate: null },
            { terminationDate: { $gt: targetDateJS } }
          ],
          startDate: { $lte: targetDateJS }
        }).lean();

        const activeEmployeeIds = activeEmployees.map(emp => emp._id);

        // Check if the target date is a holiday or weekend
        const isHolidayOrWeekend = await Event.findOne({
          type: { $in: ["holiday", "weekend"] },
          $expr: {
            $and: [
              { $lte: [{ $dateFromString: { dateString: "$startDate" } }, targetDateJS] },
              { $gte: [{ $dateFromString: { dateString: "$endDate" } }, targetDateJS] }
            ]
          }
        });

        // Get attendance records for the day
        const dailyAttendanceRecords = await Attendance.find({
          employeeId: { $in: activeEmployeeIds },
          date: {
            $gte: targetDateJS,
            $lt: tomorrow
          }
        }).populate("employeeId", "firstName lastName email").lean();

        // Get leave records for the day
        const dailyLeaveRecords = await LeaveRequest.find({
          employeeId: { $in: activeEmployeeIds },
          status: "approved",
          startDate: { $lte: targetDateJS },
          endDate: { $gte: targetDateJS }
        }).populate("employeeId", "firstName lastName").lean();

        // Process attendance and calculate summary
        let presentCount = 0;
        let absentCount = 0;
        let onLeaveCount = 0;
        let resignedTodayCount = 0;
        let lateCount = 0;

        // Track employees who are present
        const presentEmployees = new Set();

        // Create attendance lookup map
        const dailyAttendanceMap = {};
        dailyAttendanceRecords.forEach(record => {
          dailyAttendanceMap[record.employeeId._id.toString()] = record;
          if (record.checkIn) {
            presentEmployees.add(record.employeeId._id.toString());
            presentCount++;
          }
        });

        // Check for terminated employees on this day
        const terminatedToday = await Employee.find({
          ...departmentFilter,
          terminationDate: {
            $gte: targetDateJS,
            $lt: tomorrow
          }
        }).lean();

        resignedTodayCount = terminatedToday.length;

        // Create leave lookup map
        const dailyLeaveMap = {};
        const employeesOnLeave = [];
        dailyLeaveRecords.forEach(leave => {
          const empId = leave.employeeId._id.toString();
          dailyLeaveMap[empId] = leave;

          if (!presentEmployees.has(empId)) {
            onLeaveCount++;
            employeesOnLeave.push({
              name: `${leave.employeeId.firstName} ${leave.employeeId.lastName}`,
              reason: leave.reason || "No reason provided"
            });
          }
        });

        // Identify late employees
        const lateEmployees = [];

        // Default work hours
        const [workStartHour, workStartMinute] = adminConfig.workingHours.start.split(":").map(Number);
        const [nightWorkStartHour, nightWorkStartMinute] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);

        // Grace period
        const [graceHour, graceMinute] = adminConfig.workingHours.grace
          ? adminConfig.workingHours.grace.split(":").map(Number)
          : [workStartHour, workStartMinute];
        const [nightGraceHour, nightGraceMinute] = adminConfig.nightShiftWorkingHours.grace
          ? adminConfig.nightShiftWorkingHours.grace.split(":").map(Number)
          : [nightWorkStartHour, nightWorkStartMinute];

        dailyAttendanceRecords.forEach(record => {
          if (record.checkIn) {
            const checkInTime = Time.fromJSDate(record.checkIn);
            const isNightShift = record.employeeShift === "Night";

            // Determine grace period based on shift
            let graceCutoffHour = isNightShift ? nightGraceHour : graceHour;
            let graceCutoffMinute = isNightShift ? nightGraceMinute : graceMinute;

            // Check if employee was late
            let isLate = false;

            if (isNightShift) {
              // Handle night shift late calculation (cross-midnight)
              const checkInHour = checkInTime.hour;
              const checkInMinute = checkInTime.minute;
              const [startHour] = (isNightShift ? adminConfig.nightShiftWorkingHours.start : adminConfig.workingHours.start).split(":").map(Number);

              // For night shift cross-midnight logic
              if (graceCutoffHour > startHour) {
                // Grace time is same day as start time
                if (checkInHour >= startHour) {
                  // Check-in is same day as start time
                  isLate = checkInHour > graceCutoffHour || (checkInHour === graceCutoffHour && checkInMinute > graceCutoffMinute);
                } else {
                  // Check-in is next day (very late)
                  isLate = true;
                }
              } else {
                // Grace time spans to next day
                if (checkInHour >= startHour) {
                  // Check-in same day as start - not late yet
                  isLate = false;
                } else {
                  // Check-in next day
                  isLate = checkInHour > graceCutoffHour || (checkInHour === graceCutoffHour && checkInMinute > graceCutoffMinute);
                }
              }
            } else {
              // Day shift late calculation
              isLate = checkInTime.hour > graceCutoffHour ||
                (checkInTime.hour === graceCutoffHour && checkInTime.minute > graceCutoffMinute);
            }

            if (isLate) {
              lateCount++;

              // Calculate late minutes
              let lateMinutes = 0;
              const targetTime = targetDate.set({
                hour: graceCutoffHour,
                minute: graceCutoffMinute,
                second: 0
              });

              // Calculate late duration in minutes
              if (isNightShift) {
                // Handle night shift calculation
                const hourDiff = checkInTime.hour - graceCutoffHour;
                const minuteDiff = checkInTime.minute - graceCutoffMinute;

                if (hourDiff >= 0) {
                  lateMinutes = (hourDiff * 60) + minuteDiff;
                } else {
                  // Cross-day calculation
                  lateMinutes = ((24 + hourDiff) * 60) + minuteDiff;
                }
              } else {
                // Standard day shift calculation
                const diffMillis = checkInTime.diff(targetTime).milliseconds;
                lateMinutes = Math.round(diffMillis / (1000 * 60));
              }

              // Format late time as HH:MM
              const lateHours = Math.floor(lateMinutes / 60);
              const lateRemainingMinutes = lateMinutes % 60;
              const lateTimeFormatted = `${lateHours.toString().padStart(2, '0')}:${lateRemainingMinutes.toString().padStart(2, '0')}`;

              lateEmployees.push({
                name: `${record.employeeId.firstName} ${record.employeeId.lastName}`,
                lateTime: lateTimeFormatted,
                reason: record.lateReason || "No reason provided"
              });
            }
          }
        });

        // Calculate absent employees (active employees - (present + on leave + resigned today))
        absentCount = activeEmployeeIds.length - presentCount - onLeaveCount - resignedTodayCount;

        // Ensure we don't have negative absent count
        absentCount = Math.max(0, absentCount);

        // Prepare the daily summary
        dailySummary = {
          date: targetDate.toISODate(),
          isHolidayOrWeekend: !!isHolidayOrWeekend,
          summary: {
            totalEmployees,
            employeeCountByRole,
            presentCount,
            onLeaveCount,
            resignedTodayCount,
            absentCount,
            lateCount
          },
          leaveDetails: employeesOnLeave,
          lateEmployees
        };

      } catch (dailyError) {
        console.error("Error generating daily summary:", dailyError);
        // Continue with monthly report even if daily summary fails
        dailySummary = {
          error: "Failed to generate daily summary: " + dailyError.message
        };
      }
    }

    // Prepare final response
    const response = {
      monthlyReport: reportData
    };

    // Add daily summary if date was provided
    if (dailySummary) {
      response.dailySummary = dailySummary;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error("Error generating detailed attendance report:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createAttendance,
  checkIn,
  checkOut,
  getAttendanceRecords,
  getAttendanceStats,
  getWorkStats,
  getSingleEmployeeWorkStats,
  getAttendanceByEmployeeID,
  deleteAttendanceRecord,
  getAttendanceSummary,
  getAttendanceById,
  updateAttendanceRecord,
  getDetailedAttendanceReport,
};
