const AdminConfig = require("../model/AdminConfigSchema");
const Event = require("../model/eventSchema");
const Time = require("../utils/time");

/**
 * Simple weekend events system following birthday scheduler pattern
 * Creates global weekend events for the next year based on admin config
 * Handles cleanup of old weekend events when configuration changes
 */
const createWeekendEvents = async () => {
  const today = Time.today(); // PST start of today
  const endDate = Time.add(today, { days: 365 }).endOf('day'); // PST 365 days later

  try {
    console.log(`🗓️ Running weekend events scheduler for next 365 days...`);

    // Get admin config to determine weekend days
    const adminConfig = await AdminConfig.findOne({}).lean();
    if (!adminConfig || !adminConfig.weekends || adminConfig.weekends.length === 0) {
      console.log("⚠️ No weekend configuration found, skipping weekend events creation");
      return;
    }

    const weekendDays = adminConfig.weekends; // e.g., ["Saturday", "Sunday"]
    console.log(`📅 Weekend days configured: ${weekendDays.join(", ")}`);

    // Generate weekend dates for the next year
    const weekendEvents = [];
    const dayNameToNumber = {
      "Sunday": 7,
      "Monday": 1,
      "Tuesday": 2,
      "Wednesday": 3,
      "Thursday": 4,
      "Friday": 5,
      "Saturday": 6
    };

    const weekendNumbers = weekendDays.map(day => dayNameToNumber[day]).filter(Boolean);
    
    let current = today;
    while (current <= endDate) {
      if (weekendNumbers.includes(current.weekday)) {
        weekendEvents.push({
          date: current.toFormat("yyyy-MM-dd"),
          dayName: current.toFormat("cccc"), // "Saturday", "Sunday", etc.
          startDate: current.startOf("day").toUTC().toISO(),
          endDate: current.set({ hour: 23, minute: 59, second: 59, millisecond: 999 }).toUTC().toISO()
        });
      }
      current = current.plus({ days: 1 });
    }

    console.log(`📊 Found ${weekendEvents.length} weekend dates to process`);

    // Get existing weekend events within the same date range
    const existingEvents = await Event.find({
      type: "weekend",
      startDate: {
        $gte: today.startOf("day").toUTC().toISO(),
        $lte: endDate.toUTC().toISO()
      }
    }).lean();

    // Create sets for comparison
    const validWeekendDates = new Set(weekendEvents.map(ev => ev.date));
    const existingWeekendDates = new Set(
      existingEvents.map(ev => Time.fromISO(ev.startDate).toFormat("yyyy-MM-dd"))
    );

    // Clean up old weekend events that are no longer valid
    const invalidEvents = existingEvents.filter(ev => {
      const eventDate = Time.fromISO(ev.startDate).toFormat("yyyy-MM-dd");
      return !validWeekendDates.has(eventDate);
    });

    if (invalidEvents.length > 0) {
      console.log(`🧹 Cleaning up ${invalidEvents.length} invalid weekend events...`);
      await Event.deleteMany({
        _id: { $in: invalidEvents.map(ev => ev._id) }
      });
      console.log(`✅ Removed ${invalidEvents.length} outdated weekend events`);
    }

    let createdCount = 0;
    for (const { date, dayName, startDate, endDate } of weekendEvents) {
      if (!existingWeekendDates.has(date)) {
        // Create Weekend Event (same pattern as birthday scheduler)
        await Event.create({
          title: `Weekend - ${dayName}`,
          description: `${dayName} weekend for all employees`,
          type: "weekend",
          startDate,
          endDate,
          allDay: true,
          location: "N/A",
          attendees: [],
          priority: "low",
          status: "confirmed",
          isPrivate: false,
          targetType: "all",
          targetValues: [],
          createdBy: adminConfig.createdBy,
          createdByRole: "Admin",
          metadata: {
            attachments: [],
            notifications: []
          }
        });

        createdCount++;
        // console.log(`✅ Created weekend event for ${dayName} on ${date}`);
      }
    }

    console.log(`🎯 Weekend events scheduler completed: ${createdCount} new events created, ${invalidEvents.length} old events removed`);

  } catch (error) {
    console.error("❌ Weekend Events Scheduler Error:", error.message);
  }
};

module.exports = createWeekendEvents;
