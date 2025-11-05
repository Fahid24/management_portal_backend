// utils/time.js

const { DateTime, Settings } = require("luxon");

// Set the default timezone to PST (handles DST too)
Settings.defaultZone = "Asia/Dhaka";

const Time = {
  // Get current time in PST
  now: () => DateTime.now(),

  // Get start of today (00:00:00) in PST
  today: () => DateTime.now().startOf("day"),

  // Get end of today (23:59:59.999) in PST
  endOfToday: () => DateTime.now().endOf("day"),

  // Convert Luxon DateTime to native JS Date (for MongoDB)
  toJSDate: (dt) => dt.toJSDate(),

  // Convert native JS Date (from Mongo) to Luxon DateTime
  fromJSDate: (date) => DateTime.fromJSDate(date),

  // Parse ISO string (e.g., from frontend or API)
  fromISO: (isoString) => DateTime.fromISO(isoString),

  // Create DateTime from object (e.g., { year: 2024, month: 1, day: 1 })
  fromObject: (obj) => DateTime.fromObject(obj),

  // Convert Luxon DateTime to ISO string (e.g., for API responses)
  toISODate: (dt) => dt.toISODate(),

  // Format Luxon DateTime into readable string
  format: (dt, fmt = "yyyy-MM-dd HH:mm:ss") => dt.toFormat(fmt),

  // Get difference between two dates (in days, hours, etc.)
  diff: (dt1, dt2, units = ["days"]) => dt1.diff(dt2, units),

  // Add time (e.g., { days: 1 }, { weeks: 2 })
  add: (dt, durationObj) => dt.plus(durationObj),

  // Subtract time
  subtract: (dt, durationObj) => dt.minus(durationObj),

  // Check if dt1 is before dt2
  isBefore: (dt1, dt2) => dt1 < dt2,

  // Check if dt1 is after dt2
  isAfter: (dt1, dt2) => dt1 > dt2,

  // Get a range of dates (e.g., month view)
  getDateRange: (start, end, unit = "days") => {
    const range = [];
    let current = start.startOf(unit);
    while (current <= end) {
      range.push(current);
      current = current.plus({ [unit]: 1 });
    }
    return range;
  },

  // Get date range from ISO strings (e.g., for filtering)
  getDateRangeFromISO: (startISO, endISO) => {
    const start = DateTime.fromISO(startISO).startOf("day");
    const end = DateTime.fromISO(endISO).endOf("day");
    return { start, end };
  },

  // Validate if a date is in the correct format
  isValidDateTime: (dt) => dt && dt.isValid,

  // Frontend-friendly formatting functions
  formatForFrontend: (dt, includeTime = true) => {
    if (!dt || !dt.isValid) return null;
    if (includeTime) {
      return dt.toFormat("MMM dd, yyyy 'at' hh:mm a"); // e.g., "Jan 15, 2025 at 09:30 AM"
    } else {
      return dt.toFormat("MMM dd, yyyy"); // e.g., "Jan 15, 2025"
    }
  },

  // Format JS Date for frontend display
  formatJSDateForFrontend: (jsDate, includeTime = true) => {
    if (!jsDate) return null;
    const dt = DateTime.fromJSDate(jsDate);
    return Time.formatForFrontend(dt, includeTime);
  },

  // Format ISO string for frontend display
  formatISOForFrontend: (isoString, includeTime = true) => {
    if (!isoString) return null;
    const dt = DateTime.fromISO(isoString);
    return Time.formatForFrontend(dt, includeTime);
  },

  // Parse time string (HH:mm) and create DateTime for today with that time
  fromTimeString: (timeString, baseDate = null) => {
    if (!timeString) return null;
    const [hour, minute] = timeString.split(':').map(Number);
    const base = baseDate || Time.today();
    return base.set({ hour, minute, second: 0, millisecond: 0 });
  },

  // Calculate short leave end time given start time and duration
  getShortLeaveEndTime: (startTime, durationHours, baseDate = null) => {
    if (!startTime || !durationHours) return null;
    const startDateTime = Time.fromTimeString(startTime, baseDate);
    if (!startDateTime) return null;
    return startDateTime.plus({ hours: durationHours });
  },
};

module.exports = Time;
