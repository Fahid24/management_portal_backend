const Employee = require("../model/employeeSchema");
const Attendance = require("../model/attendenceSchema");
const AdminConfig = require("../model/AdminConfigSchema");
const Time = require("../utils/time");

const runAutoCheckoutScheduler = async (processAllRecords = false) => {
  let query = {};
  let dateInfo = "";

  if (processAllRecords) {
    // Process all incomplete attendance records
    query = {
      checkIn: { $exists: true, $ne: null },
      checkOut: { $exists: false }
    };
    dateInfo = "all dates";
    console.log(`🔄 Running auto checkout scheduler for ALL incomplete records`);
  } else {
    // Get yesterday's date to process incomplete attendance records (default behavior)
    const yesterday = Time.today().minus({ days: 1 });
    const yesterdayJS = Time.toJSDate(yesterday);

    query = {
      date: yesterdayJS,
      checkIn: { $exists: true, $ne: null },
      checkOut: { $exists: false }
    };
    dateInfo = yesterday.toISODate();
    console.log(`🔄 Running auto checkout scheduler for date: ${dateInfo}`);
  }

  try {
    // Get admin config to determine work end time
    const adminConfig = await AdminConfig.findOne({});
    if (!adminConfig?.workingHours?.end) {
      console.warn("⚠️ Auto checkout skipped: Working hours end time not configured in admin config");
      return;
    }

    const workEndTime = adminConfig.workingHours.end; // e.g., "18:00"
    console.log(`📋 Work end time configured as: ${workEndTime}`);

    // Find all attendance records that have checkIn but no checkOut
    const incompleteAttendances = await Attendance.find(query).populate("employeeId", "firstName lastName email shift");

    if (incompleteAttendances.length === 0) {
      console.log("✅ No incomplete attendance records found for auto checkout");
      return;
    }

    console.log(`🔍 Found ${incompleteAttendances.length} incomplete attendance records to process`);


    let processedCount = 0;
    let errorCount = 0;
    let nightShiftProcessedCount = 0;
    let dayShiftProcessedCount = 0;

    for (const attendance of incompleteAttendances) {
      try {
        let autoCheckoutTime;
        let shiftType = attendance.employeeShift === "Night" ? "Night" : "Day";
        let workEndHour, workEndMinute;

        // Skip night shift attendances for yesterday if not processing all records
        if (!processAllRecords && shiftType === "Night") {
          const attendanceDate = Time.fromJSDate(attendance.date);
          const yesterday = Time.today().minus({ days: 1 }).startOf('day');
          if (attendanceDate.hasSame(yesterday, 'day')) {
            const employeeName = `${attendance.employeeId.firstName} ${attendance.employeeId.lastName}`;
            console.log(`⏭️ Skipping night shift employee ${employeeName} for yesterday - manual checkout required`);
            continue;
          }
        }

        if (shiftType === "Night" && adminConfig.nightShiftWorkingHours?.end) {
          // Night shift: use night shift end time
          [workEndHour, workEndMinute] = adminConfig.nightShiftWorkingHours.end.split(":").map(Number);
        } else {
          // Day shift: use day shift end time
          [workEndHour, workEndMinute] = adminConfig.workingHours.end.split(":").map(Number);
        }

        if (processAllRecords) {
          // For all records, use the same date as the attendance record
          const attendanceDate = Time.fromJSDate(attendance.date);
          if (shiftType === "Night" && adminConfig.nightShiftWorkingHours?.start && adminConfig.nightShiftWorkingHours?.end) {
            // If night shift crosses midnight, auto checkout should be on next day
            const [startHour] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
            if (workEndHour < startHour) {
              autoCheckoutTime = attendanceDate.plus({ days: 1 }).set({
                hour: workEndHour,
                minute: workEndMinute,
                second: 0,
                millisecond: 0
              });
            } else {
              autoCheckoutTime = attendanceDate.set({
                hour: workEndHour,
                minute: workEndMinute,
                second: 0,
                millisecond: 0
              });
            }
          } else {
            autoCheckoutTime = attendanceDate.set({
              hour: workEndHour,
              minute: workEndMinute,
              second: 0,
              millisecond: 0
            });
          }
        } else {
          // For yesterday's records, use yesterday at the configured work end time
          const attendanceDate = Time.fromJSDate(attendance.date);
          if (shiftType === "Night" && adminConfig.nightShiftWorkingHours?.start && adminConfig.nightShiftWorkingHours?.end) {
            const [startHour] = adminConfig.nightShiftWorkingHours.start.split(":").map(Number);
            if (workEndHour < startHour) {
              autoCheckoutTime = attendanceDate.plus({ days: 1 }).set({
                hour: workEndHour,
                minute: workEndMinute,
                second: 0,
                millisecond: 0
              });
            } else {
              autoCheckoutTime = attendanceDate.set({
                hour: workEndHour,
                minute: workEndMinute,
                second: 0,
                millisecond: 0
              });
            }
          } else {
            autoCheckoutTime = attendanceDate.set({
              hour: workEndHour,
              minute: workEndMinute,
              second: 0,
              millisecond: 0
            });
          }
        }

        // Only auto checkout if current time is past the scheduled end time
        if (Time.now() > autoCheckoutTime) {
          attendance.checkOut = Time.toJSDate(autoCheckoutTime);
          attendance.checkOutLocation = {
            from: "auto",
            latitude: 0,
            longitude: 0,
            locationName: "Auto Checkout - System Generated"
          };
          await attendance.save();
          const employeeName = `${attendance.employeeId.firstName} ${attendance.employeeId.lastName}`;
          const checkoutDate = Time.fromJSDate(attendance.date).toISODate();
          console.log(`✅ Auto checkout completed for ${employeeName} on ${checkoutDate} at ${workEndHour}:${workEndMinute} (${shiftType} shift)`);
          if (shiftType === "Night") nightShiftProcessedCount++;
          else dayShiftProcessedCount++;
          processedCount++;
        } else {
          // Not yet time for auto checkout
          const employeeName = `${attendance.employeeId.firstName} ${attendance.employeeId.lastName}`;
          console.log(`⏭️ Skipping ${shiftType} shift employee ${employeeName} - not yet time for auto checkout`);
        }
      } catch (error) {
        console.error(`❌ Failed to auto checkout for employee ${attendance.employeeId?.firstName || 'Unknown'}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`🎯 Auto checkout completed for ${dateInfo}: ${processedCount} successful, ${errorCount} failed, ${nightShiftProcessedCount} night shift, ${dayShiftProcessedCount} day shift`);

  } catch (error) {
    console.error("❌ Auto Checkout Scheduler Error:", error.message);
  }
};

module.exports = runAutoCheckoutScheduler;
