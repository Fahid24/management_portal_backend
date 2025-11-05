const createWeekendEvents = require("../utils/weekendEventManager");

/**
 * Weekend Events Scheduler - runs daily to create weekend events for the next year
 * Follows the same pattern as birthdayScheduler.js
 */
const runWeekendScheduler = async () => {
  try {
    await createWeekendEvents();
  } catch (error) {
    console.error("❌ Weekend Scheduler Error:", error.message);
  }
};

module.exports = runWeekendScheduler;
