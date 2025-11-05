const cron = require('node-cron');
const FoodRecord = require('../model/foodSchema');
const Employee = require("../model/employeeSchema");
const Event = require('../model/eventSchema');
const AdminConfig = require('../model/AdminConfigSchema');
const Time = require('../utils/time');
const createWeekendEvents = require('../utils/weekendEventManager');
const { employeeStatus, employeeEmails } = require("../constant/foodEmployeeExclude");

// Helper function to get meal rates from admin config
async function getMealRatesFromConfig() {
  try {
    const config = await AdminConfig.findOne();
    if (config && config.mealRates) {
      return config.mealRates;
    }
    // Fallback to default rates if config not found
    return MEAL_RATES;
  } catch (error) {
    console.error('Error fetching meal rates from config:', error);
    return MEAL_RATES;
  }
}

// Helper function to get default guests from admin config
async function getDefaultGuestsFromConfig() {
  try {
    const config = await AdminConfig.findOne();
    if (config && config.guest && Array.isArray(config.guest)) {
      return config.guest;
    }
    return [];
  } catch (error) {
    console.error('Error fetching default guests from config:', error);
    return [];
  }
}

// Fallback meal rate configuration (if admin config not available)
const MEAL_RATES = {
  breakfast: 50,
  lunch: 130,
  evening_snacks: 5,
  dinner: 100,
  midnight_snacks: 50
};

// 1. Off Day Check Function
async function isOffDay() {
  try {
    const today = Time.today();
    const todayJS = Time.toJSDate(today);
    
    const onOffDay = await Event.aggregate([
      {
        $match: {
          type: { $in: ["holiday", "weekend"] },
        }
      },
      {
        $addFields: {
          startDateParsed: { 
            $dateFromString: { 
              dateString: "$startDate"
            } 
          },
          endDateParsed: { 
            $dateFromString: { 
              dateString: "$endDate"
            } 
          }
        }
      },
      {
        $match: {
          startDateParsed: { $lte: todayJS },
          endDateParsed: { $gte: todayJS }
        }
      },
      {
        $limit: 1
      }
    ]);

    return onOffDay.length > 0;
  } catch (error) {
    console.error('Error checking for off days:', error);
    return false;
  }
}


// 2. Employee Data Fetching

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

    return employeesForFood;

  } catch (err) {
    console.error("Error fetching employees for food:", err);
  }
}

// 3. Create Food Record for Specific Meal Type
async function createFoodRecordForMealType(mealType) {
  try {
    // Check if today is an off day
    const offDay = await isOffDay();
    if (offDay) {
      console.log(`Skipping ${mealType} record creation: Today is an off day`);
      return { success: false, reason: 'off_day' };
    }
    
    const today = Time.today();
    const todayJS = Time.toJSDate(today);

    // Normalize date to midnight UTC
    const normalizedDate = new Date(new Date().toISOString().split("T")[0]);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    const employees = await getEmployeesForFood();
    
    if (employees.length === 0) {
      console.log(`No employees found for ${mealType} record creation`);
      return { success: false, reason: 'no_employees' };
    }
    
    // Get meal rates from admin config
    const mealRates = await getMealRatesFromConfig();
    const mealRate = mealRates[mealType] || 100;
    
    // Get default guests from admin config
    const defaultGuests = await getDefaultGuestsFromConfig();
    
    // Check if record already exists
    const existingRecord = await FoodRecord.findOne({
      date: normalizedDate,
      mealType: mealType,
    });

    console.log("existing record", existingRecord);
    
    if (existingRecord) {
      console.log(`Record already exists for ${mealType} on ${Time.format(today, 'yyyy-MM-dd')}`);
      return { success: false, reason: 'already_exists', record: existingRecord };
    }
    
    // Create the food record
    const foodRecord = new FoodRecord({
      date: normalizedDate,
      totalFood: employees.length + defaultGuests.length,
      mealRate: mealRate,
      mealType: mealType,
      cost: (employees.length + defaultGuests.length) * mealRate,
      entries: employees,
      guests: defaultGuests,
      isAutoGenerated: true,
      createdAt: Time.toJSDate(Time.now()),
    });
    
    await foodRecord.save();
    console.log(`Created ${mealType} record for ${Time.format(today, 'yyyy-MM-dd')} with ${employees.length} employees + ${defaultGuests.length} guests (Rate: ${mealRate})`);
    
    return { success: true, record: foodRecord };
  } catch (error) {
    console.error(`Error creating ${mealType} record:`, error);
    return { success: false, reason: 'error', error: error.message };
  }
}


// 5. Start All Cron Jobs
async function startAllCronJobs() {
  console.log('Starting all food cron jobs...');

  // Get current meal rates for logging
  const currentRates = await getMealRatesFromConfig();
  
  // Lunch - Run at 1:30 PM Bangladesh time (after lunch)
  cron.schedule('30 10 * * *', async () => {
    console.log(`[${Time.format(Time.now(), 'yyyy-MM-dd HH:mm:ss')}] Running lunch record creation`);
    const result = await createFoodRecordForMealType('lunch');
    console.log(`Lunch record creation: ${result.success ? 'Success' : 'Failed - ' + result.reason}`);
  }, {
    timezone: "Asia/Dhaka"
  });
  
  // Evening Snacks - Run at 5:00 PM Bangladesh time
  cron.schedule('0 17 * * *', async () => {
    console.log(`[${Time.format(Time.now(), 'yyyy-MM-dd HH:mm:ss')}] Running evening snacks record creation`);
    const result = await createFoodRecordForMealType('evening_snacks');
    console.log(`Evening snacks record creation: ${result.success ? 'Success' : 'Failed - ' + result.reason}`);
  }, {
    timezone: "Asia/Dhaka"
  });
  
  // Breakfast - Run at 9:30 AM Bangladesh time (after breakfast)
  cron.schedule('30 9 * * *', async () => {
    console.log(`[${Time.format(Time.now(), 'yyyy-MM-dd HH:mm:ss')}] Running breakfast record creation`);
    const result = await createFoodRecordForMealType('breakfast');
    console.log(`Breakfast record creation: ${result.success ? 'Success' : 'Failed - ' + result.reason}`);
  }, {
    timezone: "Asia/Dhaka"
  });
  
  // Dinner - Run at 8:30 PM Bangladesh time (after dinner)
  cron.schedule('30 20 * * *', async () => {
    console.log(`[${Time.format(Time.now(), 'yyyy-MM-dd HH:mm:ss')}] Running dinner record creation`);
    const result = await createFoodRecordForMealType('dinner');
    console.log(`Dinner record creation: ${result.success ? 'Success' : 'Failed - ' + result.reason}`);
  }, {
    timezone: "Asia/Dhaka"
  });
  
  // Midnight Snacks - Run at 11:30 PM Bangladesh time
  cron.schedule('30 23 * * *', async () => {
    console.log(`[${Time.format(Time.now(), 'yyyy-MM-dd HH:mm:ss')}] Running midnight snacks record creation`);
    const result = await createFoodRecordForMealType('midnight_snacks');
    console.log(`Midnight snacks record creation: ${result.success ? 'Success' : 'Failed - ' + result.reason}`);
  }, {
    timezone: "Asia/Dhaka"
  });
  
  // Monthly weekend events update (1st of each month at 12:00 AM)
  cron.schedule('0 0 1 * *', () => {
    console.log('Running monthly weekend events update');
    createWeekendEvents();
  }, {
    timezone: "Asia/Dhaka"
  });
  
  console.log('All food cron jobs started successfully');
  console.log('Meal schedule with rates (from Admin Config):');
  console.log(`- Breakfast: 9:30 AM (Rate: ${currentRates.breakfast})`);
  console.log(`- Lunch: 1:30 PM (Rate: ${currentRates.lunch})`);
  console.log(`- Evening Snacks: 5:00 PM (Rate: ${currentRates.evening_snacks})`);
  console.log(`- Dinner: 8:30 PM (Rate: ${currentRates.dinner})`);
  console.log(`- Midnight Snacks: 11:30 PM (Rate: ${currentRates.midnight_snacks})`);
}

// Export for testing and manual execution
module.exports = {
  startAllCronJobs,
  createFoodRecordForMealType,
  isOffDay,
  MEAL_RATES
};