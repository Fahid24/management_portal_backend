const AdminConfig = require("../model/AdminConfigSchema");
const Employee = require("../model/employeeSchema");
const Time = require("../utils/time");
const createWeekendEvents = require("../utils/weekendEventManager");

// Helper to validate KPI weights = 100
function isValidKPIWeights(weights) {
  const total = Object.values(weights).reduce(
    (sum, val) => sum + (val || 0),
    0
  );
  return total === 100;
}

// Helper to update employee storage limits from admin config
async function updateEmployeeStorageLimits(maxStorage) {
  try {
    console.log("📦 Updating employee storage limits...");

    // Update all employees where mannualStorageSet is false
    const result = await Employee.updateMany(
      {
        $or: [
          { mannualStorageSet: false },
          { mannualStorageSet: { $exists: false } }
        ]
      },
      {
        $set: {
          "storageLimit.value": maxStorage.value,
          "storageLimit.unit": maxStorage.unit,
          "mannualStorageSet": false
        }
      }
    );

    console.log(`✅ Updated storage limits for ${result.modifiedCount} employees`);
    return result.modifiedCount;
  } catch (error) {
    console.error("⚠️ Failed to update employee storage limits:", error.message);
    throw error;
  }
}

// @desc   Get Admin Config (full object)
// @route  GET /api/admin/config
const getAdminConfig = async (req, res) => {
  try {
    const config = await AdminConfig.findOne({})
      .populate("createdBy", "-password -__v")
      .populate("updated.updatedBy", "-password -__v");
    if (!config) {
      return res.status(404).json({ message: "Admin configuration not found" });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc   Check if setup is complete
// @route  GET /api/admin/config/status
const checkSetupStatus = async (req, res) => {
  try {
    const exists = await AdminConfig.exists({});
    res.json({ setupComplete: !!exists });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// @desc   Create config (once only)
// @route  POST /api/admin/config/setup
const createAdminConfig = async (req, res) => {
  try {
    const existing = await AdminConfig.findOne();
    if (existing) {
      return res
        .status(400)
        .json({ message: "System setup already completed" });
    }

    const {
      leaveLimitPerPeriod,
      leavePeriodUnit,
      casualLeaveLimit,
      annualLeaveLimit,
      medicalLeaveLimit,
      workingHours,
      nightShiftWorkingHours,
      maxStorage,
      kpiWeights,
      createdBy,
      weekends,
      mealRates,
      guest,
    } = req.body;

    // Validate required fields
    if (
      !workingHours?.start ||
      !workingHours?.end ||
      !nightShiftWorkingHours?.start ||
      !nightShiftWorkingHours?.end ||
      !kpiWeights ||
      !createdBy ||
      !casualLeaveLimit ||
      !annualLeaveLimit ||
      !medicalLeaveLimit ||
      typeof casualLeaveLimit?.value !== "number" ||
      typeof annualLeaveLimit?.value !== "number" ||
      typeof medicalLeaveLimit?.value !== "number"
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate working hours format
    const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/; // "HH:mm"
    if (
      !timeRegex.test(workingHours.start) ||
      !timeRegex.test(workingHours.end) ||
      !timeRegex.test(nightShiftWorkingHours.start) ||
      !timeRegex.test(nightShiftWorkingHours.end)
    ) {
      return res
        .status(400)
        .json({ message: "Working hours must be in HH:mm format" });
    }

    // Use today's date with workingHours.start and end
    const today = Time.today();
    const start = Time.fromISO(`${today.toISODate()}T${workingHours.start}`);
    const end = Time.fromISO(`${today.toISODate()}T${workingHours.end}`);

    // Validate that end is after start for day shift
    if (!Time.isAfter(end, start)) {
      return res
        .status(400)
        .json({ message: "Day shift end time must be after start time" });
    }

    // Validate and calculate night shift hours (handles cross-midnight scenarios)
    const nightShiftStart = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.start}`);
    let nightShiftEnd = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.end}`);

    // If night shift end is before start, it crosses midnight (e.g., 22:00 to 06:00)
    if (Time.isBefore(nightShiftEnd, nightShiftStart)) {
      nightShiftEnd = nightShiftEnd.plus({ days: 1 });
    }

    // Calculate work hours per shift
    const workHourPerDay = Math.round(Time.diff(end, start, ["hours"]).hours * 100) / 100;
    const workHourPerNight = Math.round(Time.diff(nightShiftEnd, nightShiftStart, ["hours"]).hours * 100) / 100;

    // Validate grace period is within working hours for both shifts
    if (workingHours.grace) {
      const grace = Time.fromISO(`${today.toISODate()}T${workingHours.grace}`);
      if (Time.isBefore(grace, start) || Time.isAfter(grace, end)) {
        return res
          .status(400)
          .json({ message: "Day shift grace period must be within working hours" });
      }
    }

    if (nightShiftWorkingHours.grace) {
      const nightGrace = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.grace}`);
      // For night shift grace, handle cross-midnight scenario
      if (Time.isBefore(nightShiftEnd, nightShiftStart)) {
        // Night shift crosses midnight
        if (!(Time.isAfter(nightGrace, nightShiftStart) || Time.isBefore(nightGrace, nightShiftEnd.minus({ days: 1 })))) {
          return res
            .status(400)
            .json({ message: "Night shift grace period must be within working hours" });
        }
      } else {
        // Normal night shift (doesn't cross midnight)
        if (Time.isBefore(nightGrace, nightShiftStart) || Time.isAfter(nightGrace, nightShiftEnd)) {
          return res
            .status(400)
            .json({ message: "Night shift grace period must be within working hours" });
        }
      }
    }

    // Validate KPI weights
    if (!isValidKPIWeights(kpiWeights)) {
      return res.status(400).json({ message: "KPI Weights must total 100%" });
    }

    // Validate weekends (if provided)
    const validDays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    if (
      weekends &&
      (!Array.isArray(weekends) ||
        !weekends.every((day) => validDays.includes(day)))
    ) {
      return res.status(400).json({
        message: "Invalid weekends. Days must be valid weekday names.",
      });
    }

    // Validate maxStorage
    if (maxStorage?.value != null && typeof maxStorage.value !== "number") {
      return res
        .status(400)
        .json({ message: "Storage value must be a number" });
    }
    if (maxStorage?.unit && !["KB", "MB", "GB"].includes(maxStorage.unit)) {
      return res
        .status(400)
        .json({ message: "Storage unit must be KB, MB, or GB" });
    }

    // Prepare maxStorage object
    const finalMaxStorage = maxStorage ? {
      value: maxStorage.value ?? 800,
      unit: maxStorage.unit ?? "MB"
    } : { value: 800, unit: "MB" };

    // Prepare mealRates object with defaults
    const finalMealRates = mealRates ? {
      breakfast: mealRates.breakfast ?? 50,
      lunch: mealRates.lunch ?? 130,
      dinner: mealRates.dinner ?? 100,
      evening_snacks: mealRates.evening_snacks ?? 5,
      midnight_snacks: mealRates.midnight_snacks ?? 50,
    } : {
      breakfast: 50,
      lunch: 130,
      dinner: 100,
      evening_snacks: 5,
      midnight_snacks: 50,
    };

    // Prepare default guests if not provided
    const finalGuests = guest && Array.isArray(guest) ? guest : [];

    // Create the configuration object
    const config = new AdminConfig({
      leaveLimitPerPeriod,
      leavePeriodUnit,
      casualLeaveLimit,
      annualLeaveLimit,
      medicalLeaveLimit,
      workingHours,
      nightShiftWorkingHours,
      weekends: weekends || ["Saturday"], // Default to Saturday if not provided
      workHourPerDay,
      workHourPerNight,
      maxStorage: finalMaxStorage,
      mealRates: finalMealRates,
      guest: finalGuests,
      kpiWeights,
      createdBy,
      confirmation: true, // Default to true for initial setup
      createdAt: Time.toJSDate(Time.now()),
    });

    // Save the configuration to the database
    await config.save();

    // Update employee storage limits for all employees (since this is initial setup)
    let employeeStorageUpdated = 0;
    try {
      employeeStorageUpdated = await updateEmployeeStorageLimits(finalMaxStorage);
    } catch (storageError) {
      console.error("⚠️ Failed to update employee storage limits:", storageError.message);
      // Continue anyway - config was saved successfully
    }

    // Create weekend events for all employees (simple approach like birthday scheduler)
    try {
      console.log("🗓️ Creating weekend events...");
      await createWeekendEvents();
      console.log("✅ Weekend events created successfully");
    } catch (weekendError) {
      console.error(
        "⚠️ Failed to create weekend events:",
        weekendError.message
      );
      // Continue anyway - config was saved successfully
    }

    res.status(201).json({
      message: "Admin configuration setup complete",
      weekendEventsCreated: true,
      employeeStorageUpdated: employeeStorageUpdated,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// OPTIONAL: Update config later if needed
// @route  PUT /api/admin/config/update
const updateAdminConfig = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) {
      return res.status(404).json({ message: "Admin configuration not found" });
    }

    const {
      leaveLimitPerPeriod,
      leavePeriodUnit,
      casualLeaveLimit,
      annualLeaveLimit,
      medicalLeaveLimit,
      weekends,
      workingHours,
      nightShiftWorkingHours,
      maxStorage,
      kpiWeights,
      mealRates,
      guest,
      updatedBy, // <-- this must be passed from frontend or extracted from req.user
    } = req.body;

    // Validate casualLeaveLimit
    if (
      casualLeaveLimit?.value != null &&
      typeof casualLeaveLimit?.value !== "number"
    ) {
      return res
        .status(400)
        .json({ message: "Casual Leave Limit value must be a number" });
    }

    // Validate annualLeaveLimit
    if (
      annualLeaveLimit?.value != null &&
      typeof annualLeaveLimit?.value !== "number"
    ) {
      return res
        .status(400)
        .json({ message: "Annual Leave Limit value must be a number" });
    }

    // Validate medicalLeaveLimit
    if (
      medicalLeaveLimit?.value != null &&
      typeof medicalLeaveLimit?.value !== "number"
    ) {
      return res
        .status(400)
        .json({ message: "Medical Leave Limit value must be a number" });
    }

    // Validate working hours format and update workHourPerDay
    if (workingHours?.start && workingHours?.end) {
      const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
      if (
        !timeRegex.test(workingHours.start) ||
        !timeRegex.test(workingHours.end)
      ) {
        return res
          .status(400)
          .json({ message: "Day shift working hours must be in HH:mm format" });
      }

      const today = Time.today();
      const start = Time.fromISO(`${today.toISODate()}T${workingHours.start}`);
      const end = Time.fromISO(`${today.toISODate()}T${workingHours.end}`);

      if (!Time.isAfter(end, start)) {
        return res
          .status(400)
          .json({ message: "Day shift end time must be after start time" });
      }

      // Validate grace period if provided
      if (workingHours.grace) {
        const grace = Time.fromISO(`${today.toISODate()}T${workingHours.grace}`);
        if (Time.isBefore(grace, start) || Time.isAfter(grace, end)) {
          return res
            .status(400)
            .json({ message: "Day shift grace period must be within working hours" });
        }
      }

      const workHourPerDay =
        Math.round(Time.diff(end, start, ["hours"]).hours * 100) / 100;
      config.workingHours = workingHours;
      config.workHourPerDay = workHourPerDay;
    }

    // Validate night shift working hours format and update workHourPerNight
    if (nightShiftWorkingHours?.start && nightShiftWorkingHours?.end) {
      const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
      if (
        !timeRegex.test(nightShiftWorkingHours.start) ||
        !timeRegex.test(nightShiftWorkingHours.end)
      ) {
        return res
          .status(400)
          .json({ message: "Night shift working hours must be in HH:mm format" });
      }

      const today = Time.today();
      const nightShiftStart = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.start}`);
      let nightShiftEnd = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.end}`);

      // If night shift end is before start, it crosses midnight (e.g., 22:00 to 06:00)
      if (Time.isBefore(nightShiftEnd, nightShiftStart)) {
        nightShiftEnd = nightShiftEnd.plus({ days: 1 });
      }

      // Validate grace period if provided
      if (nightShiftWorkingHours.grace) {
        const nightGrace = Time.fromISO(`${today.toISODate()}T${nightShiftWorkingHours.grace}`);
        // For night shift grace, handle cross-midnight scenario
        if (Time.isBefore(nightShiftEnd, nightShiftStart)) {
          // Night shift crosses midnight
          if (!(Time.isAfter(nightGrace, nightShiftStart) || Time.isBefore(nightGrace, nightShiftEnd.minus({ days: 1 })))) {
            return res
              .status(400)
              .json({ message: "Night shift grace period must be within working hours" });
          }
        } else {
          // Normal night shift (doesn't cross midnight)
          if (Time.isBefore(nightGrace, nightShiftStart) || Time.isAfter(nightGrace, nightShiftEnd)) {
            return res
              .status(400)
              .json({ message: "Night shift grace period must be within working hours" });
          }
        }
      }

      const workHourPerNight =
        Math.round(Time.diff(nightShiftEnd, nightShiftStart, ["hours"]).hours * 100) / 100;
      config.nightShiftWorkingHours = nightShiftWorkingHours;
      config.workHourPerNight = workHourPerNight;
    }

    // Validate and apply weekends
    const validDays = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    let weekendEventsUpdated = false;
    let weekendsChanged = false;

    if (weekends) {
      if (
        !Array.isArray(weekends) ||
        !weekends.every((day) => validDays.includes(day))
      ) {
        return res.status(400).json({
          message: "Invalid weekends. Days must be valid weekday names.",
        });
      }

      // Store old weekends for comparison
      const oldWeekends = config.weekends || [];
      config.weekends = weekends;

      // Check if weekends actually changed
      weekendsChanged =
        JSON.stringify(oldWeekends.sort()) !== JSON.stringify(weekends.sort());
    }
    // Validation of Storage Unit ... Handel It dynamically.
    if (maxStorage?.value != null && typeof maxStorage.value !== "number") {
      return res
        .status(400)
        .json({ message: "Storage value must be a number" });
    }
    if (maxStorage?.unit && !["KB", "MB", "GB"].includes(maxStorage.unit)) {
      return res
        .status(400)
        .json({ message: "Storage unit must be KB, MB, or GB" });
    }

    // Validate KPI weights if provided
    if (kpiWeights && !isValidKPIWeights(kpiWeights)) {
      return res.status(400).json({ message: "KPI Weights must total 100%" });
    }

    // Validate and apply maxStorage
    let storageChanged = false;
    let employeeStorageUpdated = 0;
    if (maxStorage) {
      const newStorageConfig = {
        value: maxStorage.value ?? config.maxStorage?.value ?? 800,
        unit: maxStorage.unit ?? config.maxStorage?.unit ?? "MB",
      };

      // Check if storage actually changed
      const oldStorage = config.maxStorage || { value: 800, unit: "MB" };
      storageChanged =
        oldStorage.value !== newStorageConfig.value ||
        oldStorage.unit !== newStorageConfig.unit;

      config.maxStorage = newStorageConfig;
    }

    // Apply updates
    if (leaveLimitPerPeriod != null)
      config.leaveLimitPerPeriod = leaveLimitPerPeriod;
    if (leavePeriodUnit) config.leavePeriodUnit = leavePeriodUnit;
    if (casualLeaveLimit) config.casualLeaveLimit = casualLeaveLimit;
    if (annualLeaveLimit) config.annualLeaveLimit = annualLeaveLimit;
    if (medicalLeaveLimit) config.medicalLeaveLimit = medicalLeaveLimit;
    if (kpiWeights) config.kpiWeights = kpiWeights;
    if (maxStorage != null) config.maxStorage = maxStorage;
    if (mealRates) {
      config.mealRates = {
        breakfast: mealRates.breakfast ?? config.mealRates?.breakfast ?? 50,
        lunch: mealRates.lunch ?? config.mealRates?.lunch ?? 130,
        dinner: mealRates.dinner ?? config.mealRates?.dinner ?? 100,
        evening_snacks: mealRates.evening_snacks ?? config.mealRates?.evening_snacks ?? 5,
        midnight_snacks: mealRates.midnight_snacks ?? config.mealRates?.midnight_snacks ?? 50,
      };
    }
    if (guest && Array.isArray(guest)) config.guest = guest;

    // Track update history
    if (updatedBy) {
      config.updated.push({
        updatedBy,
        updatedAt: Time.toJSDate(Time.now()),
      });
    }

    // Save the config FIRST
    await config.save();

    // Update employee storage limits if storage config changed
    if (storageChanged) {
      try {
        employeeStorageUpdated = await updateEmployeeStorageLimits(config.maxStorage);
      } catch (storageError) {
        console.error("⚠️ Failed to update employee storage limits:", storageError.message);
        // Continue anyway - config was saved successfully
      }
    }

    // THEN update weekend events (after config is saved with new weekends)
    if (weekendsChanged) {
      try {
        console.log(
          "🗓️ Weekend configuration changed, updating weekend events..."
        );
        await createWeekendEvents(); // Now reads the updated weekend config
        console.log("✅ Weekend events updated successfully");
        weekendEventsUpdated = true;
      } catch (weekendError) {
        console.error(
          "⚠️ Failed to update weekend events:",
          weekendError.message
        );
        // Config is already saved, just warn about events
      }
    }
    res.json({
      message: "Admin configuration updated successfully",
      weekendEventsUpdated: weekendEventsUpdated,
      employeeStorageUpdated: employeeStorageUpdated,
      storageChanged: storageChanged,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  getAdminConfig,
  checkSetupStatus,
  createAdminConfig,
  updateAdminConfig,
};
