const FoodRecord = require("../model/foodSchema");
const mongoose = require("mongoose");
const { Types } = mongoose;
const Employee = require("../model/employeeSchema");
const {employeeStatus, employeeEmails} = require("../constant/foodEmployeeExclude");

function normalizeDateToMidnight(d) {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt;
}

// CREATE Food Record
const createFoodRecord = async (req, res) => {
  try {
    const { date, totalFood, mealRate, entries, mealType, guests, createdBy } =
      req.body;

    // Validate required fields
    if (!date || !totalFood || !mealRate || !mealType) {
      return res.status(400).json({
        message:
          "Missing required fields: date, totalFood, mealRate, and mealType are required",
      });
    }

    // Validate mealType enum
    const validMealTypes = [
      "breakfast",
      "lunch",
      "dinner",
      "evening_snacks",
      "midnight_snacks",
    ];
    if (!validMealTypes.includes(mealType)) {
      return res.status(400).json({
        message: `Invalid mealType. Must be one of: ${validMealTypes.join(
          ", "
        )}`,
      });
    }

    const cost = mealRate * totalFood;

    // Normalize date to midnight UTC
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    // Check for duplicate (date + mealType) at application level
    const existingRecord = await FoodRecord.findOne({
      date: normalizedDate,
      mealType: mealType,
    });

    if (existingRecord) {
      return res.status(400).json({
        message: `A ${mealType} record already exists for ${normalizedDate.toDateString()}`,
        existingRecord: {
          id: existingRecord._id,
          date: existingRecord.date,
          mealType: existingRecord.mealType,
        },
      });
    }

    // Create new record
    const newRecord = await FoodRecord.create({
      date: normalizedDate,
      totalFood,
      mealRate,
      mealType,
      cost,
      entries: entries || [],
      guests: guests || [],
      createdBy,
    });

    res.status(201).json({
      message: "Food record created successfully",
      data: newRecord,
    });
  } catch (err) {
    console.error("Error creating food record:", err);

    // Handle MongoDB duplicate key error (database level constraint)
    if (err.code === 11000) {
      res.status(400).json({
        message:
          "Duplicate record: A food record already exists for this date and meal type",
        details:
          "This should not happen with application-level checking. Please check your database indexes.",
      });
    }
    // Handle validation errors
    else if (err.name === "ValidationError") {
      const errors = Object.values(err.errors).map((error) => error.message);
      res.status(400).json({
        message: "Validation failed",
        errors: errors,
      });
    }
    // Handle cast errors (invalid ObjectId, Date, etc.)
    else if (err.name === "CastError") {
      res.status(400).json({
        message: `Invalid ${err.path}: ${err.value}`,
      });
    }
    // Handle all other errors
    else {
      res.status(500).json({
        message: "Internal server error",
        error:
          process.env.NODE_ENV === "development"
            ? err.message
            : "Something went wrong",
      });
    }
  }
};

async function getEmployeesForFood(req, res) {
  try {
    // Create filter to exclude onLeave employees
    const filter = {
      status: { $nin: employeeStatus }, // Exclude status employees
      email: { $nin: employeeEmails }, // Exclude specific emails
    };

    const employees = await Employee.find(filter).select(
      "_id firstName lastName email photoUrl"
    );

    // Transform to the desired format
    const employeesForFood = employees.map((emp) => ({
      employeeId: emp._id,
      email: emp.email,
      firstName: emp.firstName,
      lastName: emp.lastName,
      photoUrl: emp.photoUrl,
      foodStatus: "utilized", // Default status
    }));

    res.status(200).json(employeesForFood);
  } catch (err) {
    console.error("Error fetching employees for food:", err);
    res.status(500).json({
      detail: "Internal Server Error",
      error: err.message,
    });
  }
}

const getAllFoodRecords = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const mealType = req.query.mealType;

    // Build the filter
    const filter = {};
    if (startDate && endDate) {
      filter.date = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      filter.date = { $gte: startDate };
    } else if (endDate) {
      filter.date = { $lte: endDate };
    }

    if (mealType) {
      filter.mealType = mealType;
    }

    // Count total documents matching filter
    const total = await FoodRecord.countDocuments(filter);

    // Fetch paginated records
    const records = await FoodRecord.find(filter)
      .sort({ date: -1 }) // optional: latest first
      .skip((page - 1) * limit)
      .limit(limit)
      .select("_id date totalFood mealRate cost entries mealType guests")
      .lean();

    const result = records.map((r) => ({
      _id: r._id,
      date: r.date,
      totalFood: r.totalFood,
      mealRate: r.mealRate,
      cost: r.cost,
      mealType: r.mealType,
      guests: r.guests?.length || 0,
      entriesCount: r.entries?.length || 0,
      wastedCount:
        r.entries?.filter((e) => e.foodStatus === "wasted").length || 0,
      wastedEntries: r.entries
        ?.filter((e) => e.foodStatus === "wasted")
        .map((e) => ({
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email,
        })),
    }));

    res.status(200).json({
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching food records:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getFoodRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await FoodRecord.findById(id)
      .populate("entries.employeeId", "firstName lastName email")
      .lean();
    if (!record) {
      return res.status(404).json({ message: "Food record not found" });
    }
    res.status(200).json(record);
  } catch (error) {
    console.error("Error fetching food record by ID:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// UPDATE Food Record
// const updateFoodRecord = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const {
//       date,
//       totalFood,
//       mealRate,
//       cost,
//       mealType,
//       entries,
//       guests,
//       createdBy,
//     } = req.body;

//     // console.log("data come into payload for update", req.body);

//     const record = await FoodRecord.findById(id);
//     if (!record) {
//       return res.status(404).json({ message: "Food record not found" });
//     }

//     if (date) {
//       record.date = normalizeDateToMidnight(date);
//     }
//     if (totalFood !== undefined) record.totalFood = totalFood;
//     if (mealRate !== undefined) record.mealRate = mealRate;
//     if (cost !== undefined) record.cost = cost;
//     if (entries !== undefined) record.entries = entries;
//     if (guests !== undefined) record.guests = guests;
//     if (mealType !== undefined) record.mealType = mealType;
//     // Only update createdBy if provided
//     if (createdBy !== undefined)
//       record.createdBy = new Types.ObjectId(createdBy);

//     // console.log("Updated record:", record);

//     await record.save();

//     res
//       .status(200)
//       .json({ message: "Food record updated successfully", record });
//   } catch (error) {
//     console.error("Error updating food record:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

const updateFoodRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date,
      totalFood,
      mealRate,
      cost,
      mealType,
      entries,
      guests,
      createdBy,
    } = req.body;

    // console.log("data come into payload for update", req.body);

    // First, check for potential duplicate BEFORE updating
    if (date || mealType) {
      const checkDate = date ? normalizeDateToMidnight(date) : undefined;
      const checkMealType = mealType || undefined;
      
      const duplicateCondition = {
        _id: { $ne: new Types.ObjectId(id) } // Exclude current record
      };
      
      if (checkDate) duplicateCondition.date = checkDate;
      if (checkMealType) duplicateCondition.mealType = checkMealType;

      const existingRecord = await FoodRecord.findOne(duplicateCondition);

      if (existingRecord) {
        return res.status(400).json({
          message: `A food record already exists for this date (${checkDate}) and meal type (${checkMealType})`,
          existingRecord: {
            id: existingRecord._id,
            date: existingRecord.date,
            mealType: existingRecord.mealType,
          },
        });
      }
    }

    // Use findOneAndUpdate instead of save() to avoid unique index validation issues
    const updateData = {};
    if (date !== undefined) updateData.date = normalizeDateToMidnight(date);
    if (totalFood !== undefined) updateData.totalFood = totalFood;
    if (mealRate !== undefined) updateData.mealRate = mealRate;
    if (cost !== undefined) updateData.cost = cost;
    if (entries !== undefined) updateData.entries = entries;
    if (guests !== undefined) updateData.guests = guests;
    if (mealType !== undefined) updateData.mealType = mealType;
    if (createdBy !== undefined) updateData.createdBy = new Types.ObjectId(createdBy);

    const updatedRecord = await FoodRecord.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true, // Return the updated document
        runValidators: true // Run schema validation
      }
    );

    if (!updatedRecord) {
      return res.status(404).json({ message: "Food record not found" });
    }

    res
      .status(200)
      .json({ message: "Food record updated successfully", record: updatedRecord });
  } catch (error) {
    console.error("Error updating food record:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate record error: A food record already exists for this date and meal type",
        error: error.keyValue
      });
    }
    
    res.status(500).json({ message: "Internal server error" });
  }
};

async function getFoodRecordByDate(req, res) {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date required" });
    const normalized = normalizeDateToMidnight(date);
    const record = await FoodRecord.findOne({ date: normalized })
      .populate("entries.employeeId", "name")
      .lean();
    if (!record) return res.status(404).json({ error: "not found" });
    return res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function getFoodStats(req, res) {
  try {
    let { startDate, endDate, mealType } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "startDate and endDate are required (YYYY-MM-DD)" });
    }

    // Parse dates in UTC
    const from = new Date(`${startDate}T00:00:00.000Z`);
    const to = new Date(`${endDate}T23:59:59.999Z`);

    // Build query object
    const query = {
      date: { $gte: from, $lte: to },
    };

    // Add mealType filter if provided
    if (mealType) {
      const validMealTypes = [
        "breakfast",
        "lunch",
        "dinner",
        "evening_snacks",
        "midnight_snacks",
      ];
      if (!validMealTypes.includes(mealType)) {
        return res.status(400).json({
          error: `Invalid mealType. Must be one of: ${validMealTypes.join(
            ", "
          )}`,
        });
      }
      query.mealType = mealType;
    }

    const records = await FoodRecord.find(query).lean();

    let totalCost = 0;
    let totalFood = 0;
    let utilizedCount = 0;
    let wastedCount = 0;
    let notNeedCount = 0;
    let wastedCost = 0;

    // For wasted-by-employee tracking
    const wastedMap = new Map(); // Tracks wasted count
    const wastedAmountMap = new Map(); // NEW: Tracks wasted amount

    for (const record of records) {
      totalCost += record.cost || 0;
      totalFood += record.totalFood || 0;
      const mealRate = record.mealRate || 0;

      for (const entry of record.entries || []) {
        if (entry.foodStatus === "utilized") utilizedCount++;
        if (entry.foodStatus === "wasted") {
          wastedCount++;
          wastedCost += mealRate;
          
          if (entry.employeeId?._id) {
            const idStr = String(entry.employeeId._id);
            
            // Track wasted count
            wastedMap.set(idStr, (wastedMap.get(idStr) || 0) + 1);
            
            // NEW: Track wasted amount
            wastedAmountMap.set(idStr, (wastedAmountMap.get(idStr) || 0) + mealRate);
          }
        }
        if (entry.foodStatus === "not_need") notNeedCount++;
      }
    }

    // Fetch employee details
    const wastedList = [];
    if (wastedMap.size > 0) {
      const ids = Array.from(wastedMap.keys()).map(
        (id) => new Types.ObjectId(id)
      );
      const employees = await Employee.find({ _id: { $in: ids } })
        .select("_id firstName lastName email photoUrl")
        .lean();

      const empMap = new Map(
        employees.map((e) => [
          String(e._id),
          {
            firstName: e.firstName,
            lastName: e.lastName || "",
            email: e.email || "",
            photoUrl: e.photoUrl || ""
          },
        ])
      );

      for (const [employeeId, count] of wastedMap) {
        const employeeInfo = empMap.get(employeeId) || {
          firstName: "Unknown",
          lastName: "",
          email: "",
          photoUrl: ""
        };

        // NEW: Get wasted amount for this employee
        const wastedAmount = wastedAmountMap.get(employeeId) || 0;

        wastedList.push({
          employeeId,
          name: `${employeeInfo.firstName} ${employeeInfo.lastName}`.trim(),
          firstName: employeeInfo.firstName,
          lastName: employeeInfo.lastName,
          email: employeeInfo.email,
          photoUrl: employeeInfo.photoUrl,
          wastedCount: count,
          wastedAmount: parseFloat(wastedAmount.toFixed(2)), // NEW: Add wasted amount
        });
      }

      wastedList.sort((a, b) => b.wastedCount - a.wastedCount);
    }

    totalCost = parseFloat(totalCost.toFixed(2));
    wastedCost = parseFloat(wastedCost.toFixed(2));

    return res.json({
      totalCost,
      totalFood,
      utilizedCount,
      wastedCount,
      wastedCost,
      notNeedCount,
      daysCount: records.length,
      wastedByEmployee: wastedList,
      // Include filter info in response
      filters: {
        startDate,
        endDate,
        mealType: mealType || "all",
      },
    });
  } catch (err) {
    console.error("Error in getFoodStats:", err);
    res.status(500).json({ error: err.message });
  }
}

const deleteFoodRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await FoodRecord.findById(id);
    if (!record) {
      return res.status(404).json({ message: "Food record not found" });
    }

    await FoodRecord.findByIdAndDelete(id);

    res.status(200).json({ message: "Food record deleted successfully" });
  } catch (error) {
    console.error("Error deleting food record:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createFoodRecord,
  getAllFoodRecords,
  updateFoodRecord,
  getFoodRecordByDate,
  getFoodStats,
  deleteFoodRecord,
  getEmployeesForFood,
  getFoodRecordById,
};
