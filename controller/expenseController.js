const Expense = require("../model/expenseSchema");
const Employee = require("../model/employeeSchema");
const ClientIncome = require("../model/ClientIncome");
const FoodRecord = require("../model/foodSchema");
const Time = require("../utils/time");
const mongoose = require("mongoose");

// ✅ Create a new expense
async function createExpense(req, res) {
    try {
        const { title, category, amount, date, proofUrl, createdBy } = req.body;

        if (!createdBy) {
            return res.status(400).json({ success: false, error: "CreatedBy is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(createdBy)) {
            return res.status(400).json({ success: false, error: "Invalid CreatedBy ID" });
        }

        const employee = await Employee.findById(createdBy);
        if (!employee) {
            return res.status(400).json({ success: false, error: "Invalid CreatedBy ID" });
        }

        let formatDate = null;
        if (!title) {
            return res.status(400).json({ success: false, error: "Title is required" });
        }

        if (!category) {
            return res.status(400).json({ success: false, error: "Category is required" });
        }

        if (amount < 0) {
            return res.status(400).json({ success: false, error: "Amount must be positive" });
        }

        if (date) {
            formatDate = Time.toJSDate(Time.fromISO(date));
        }

        // monthKey & yearKey auto-populated by schema pre-save
        const expense = new Expense({
            title,
            category,
            amount,
            date: formatDate ? formatDate : Time.toJSDate(Time.now()),
            proofUrl,
            createdBy,
            history: [
                {
                    updatedBy: createdBy,
                    changes: "Created expense",
                    date: Time.toJSDate(Time.now()),
                },
            ],
        });

        await expense.save();
        res.status(201).json({ success: true, expense });
    } catch (err) {
        console.error("createExpense error:", err);
        res.status(500).json({ success: false, error: "Failed to create expense" });
    }
};

// ✅ Bulk create expenses
async function bulkCreateExpenses(req, res) {
    try {
        const { expenses, createdBy } = req.body;

        if (!createdBy) {
            return res.status(400).json({ success: false, error: "CreatedBy is required" });
        }

        if (!mongoose.Types.ObjectId.isValid(createdBy)) {
            return res.status(400).json({ success: false, error: "Invalid CreatedBy ID" });
        }

        const employee = await Employee.findById(createdBy);
        if (!employee) {
            return res.status(400).json({ success: false, error: "Invalid CreatedBy ID" });
        }

        if (!Array.isArray(expenses) || expenses.length === 0) {
            return res.status(400).json({ success: false, error: "At least one expense is required" });
        }

        const createdExpenses = [];

        for (const exp of expenses) {
            if (!exp.title || !exp.category || exp.amount == null) {
                return res.status(400).json({ success: false, error: "Each expense must have title, category, and amount" });
            }

            if (exp.amount < 0) {
                return res.status(400).json({ success: false, error: "Amount must be positive" });
            }

            // Use provided date, otherwise default to first day of given monthKey
            let expenseDate;
            if (exp.date) {
                expenseDate = Time.toJSDate(Time.fromISO(exp.date));
            } else {
                expenseDate = Time.toJSDate(Time.now());
            }

            const newExpense = new Expense({
                title: exp.title,
                category: exp.category,
                amount: exp.amount,
                date: expenseDate,
                proofUrl: exp.proofUrl || null,
                createdBy,
                history: [
                    {
                        updatedBy: createdBy,
                        changes: `Created in bulk insert`,
                        date: Time.toJSDate(Time.now()),
                    },
                ],
            });

            createdExpenses.push(newExpense);
        }

        await Expense.insertMany(createdExpenses);

        res.status(201).json({ success: true, count: createdExpenses.length, expenses: createdExpenses });
    } catch (err) {
        console.error("bulkCreateExpenses error:", err);
        res.status(500).json({ success: false, error: "Failed to create bulk expenses" });
    }
}

// ✅ Get all expenses with optional filters and pagination
async function getExpenses(req, res) {
    try {
        const { start, end, category, page, limit } = req.query;

        // Pagination setup
        const pageNum = parseInt(page) > 0 ? parseInt(page) : 1;
        const limitNum = parseInt(limit) > 0 ? parseInt(limit) : 10;
        const skip = (pageNum - 1) * limitNum;

        const query = {};

        if (start || end) {
            query.date = {};
            if (start) query.date.$gte = Time.toJSDate(Time.fromISO(start));
            if (end) query.date.$lte = Time.toJSDate(Time.fromISO(end));
        }
        if (category) query.category = category;

        // Count total documents for pagination
        const total = await Expense.countDocuments(query);

        // Find expenses with pagination
        const expenses = await Expense.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('createdBy', 'firstName lastName email department designation role photoUrl');

        // Calculate total pages
        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            expenses,
            pagination: {
                currentPage: pageNum,
                totalPages: totalPages,
                totalCount: total,
                limit: limitNum
            }
        });
    } catch (err) {
        console.error("getExpenses error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch expenses" });
    }
};

// ✅ Get single expense by ID
async function getSingleExpense(req, res) {
    try {
        const id = req.params.id;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid Expense ID" });
        }

        const expense = await Expense.findById(id).populate('createdBy', 'firstName lastName email department designation role photoUrl');
        if (!expense) return res.status(404).json({ success: false, error: "Expense not found" });

        res.json({ success: true, expense });
    } catch (error) {
        console.error("getSingleExpense error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch expense" });
    }
}

// ✅ Update expense and add to history
async function updateExpense(req, res) {
    try {
        const { id } = req.params;
        const { updates, updatedBy } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid Expense ID" });
        }

        if (!updatedBy || !mongoose.Types.ObjectId.isValid(updatedBy)) {
            return res.status(400).json({ success: false, error: "Invalid UpdatedBy ID" });
        }

        const employee = await Employee.findById(updatedBy);
        if (!employee) {
            return res.status(400).json({ success: false, error: "Invalid UpdatedBy ID" });
        }

        const expense = await Expense.findById(id);
        if (!expense) return res.status(404).json({ success: false, error: "Expense not found" });

        const changeLog = [];

        for (const key in updates) {
            if (key === "date") {
                // Convert new date to JS Date
                const newDateJS = Time.toJSDate(Time.fromISO(updates[key]));
                const oldDateTimeStamp = expense.date.getTime();
                const newDateTimeStamp = newDateJS.getTime();

                if (oldDateTimeStamp !== newDateTimeStamp) {
                    // Log change
                    const oldDateFormatted = Time.formatJSDateForFrontend(expense.date, false);
                    const newDateFormatted = Time.formatJSDateForFrontend(newDateJS, false);
                    changeLog.push(`${key}: ${oldDateFormatted} → ${newDateFormatted}`);

                    // Update expense date
                    expense.date = newDateJS;

                    // ✅ Recalculate monthKey & yearKey
                    const dt = Time.fromJSDate(newDateJS);
                    expense.monthKey = dt.toFormat("yyyy-MM");
                    expense.yearKey = dt.toFormat("yyyy");
                }
            } else {
                if (expense[key] !== updates[key]) {
                    changeLog.push(`${key}: ${expense[key]} → ${updates[key]}`);
                    expense[key] = updates[key];
                }
            }
        }

        if (changeLog.length > 0) {
            expense.history.push({
                updatedBy,
                changes: changeLog.join(", "),
                date: Time.toJSDate(Time.now()),
            });
        }

        await expense.save();
        res.json({ success: true, expense });
    } catch (err) {
        console.error("updateExpense error:", err);
        res.status(500).json({ success: false, error: "Failed to update expense" });
    }
}

// ✅ Delete expense (hard delete)
async function deleteExpense(req, res) {
    try {
        const { id } = req.params;
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: "Invalid Expense ID" });
        }
        const expense = await Expense.findByIdAndDelete(id);
        if (!expense) return res.status(404).json({ success: false, error: "Expense not found" });

        res.json({ success: true, message: "Expense deleted successfully" });
    } catch (err) {
        console.error("deleteExpense error:", err);
        res.status(500).json({ success: false, error: "Failed to delete expense" });
    }
};

// ✅ Dashboard summary (extended)
async function getExpenseSummary(req, res) {
    try {
        const { start, end } = req.query;
        const match = {};

        if (start && end) {
            match.date = {};
            if (start) match.date.$gte = Time.toJSDate(Time.fromISO(start));
            if (end) match.date.$lte = Time.toJSDate(Time.fromISO(end));
        }

        // 1. Total expense
        const totalExpense = await Expense.aggregate([
            { $match: match },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        // 2. Average expense
        const averageExpense = await Expense.aggregate([
            { $match: match },
            { $group: { _id: null, avg: { $avg: "$amount" } } }
        ]);

        // 3. Highest single expense
        const highestExpense = await Expense.find(match)
            .sort({ amount: -1 })
            .limit(1)
            .select("title category amount date");

        // 4. Latest 5 expenses
        const latestExpenses = await Expense.find(match)
            .sort({ createdAt: -1 })
            .limit(5)
            .select("title category amount date proofUrl");

        // 5. Yearly totals
        const yearly = await Expense.aggregate([
            { $match: match },
            { $group: { _id: "$yearKey", total: { $sum: "$amount" } } },
            { $sort: { _id: 1 } }
        ]);

        // 6. Monthly totals
        const monthly = await Expense.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { year: "$yearKey", month: "$monthKey" },
                    total: { $sum: "$amount" },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        // 7. Category ratio
        const categoryRatio = await Expense.aggregate([
            { $match: match },
            { $group: { _id: "$category", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
        ]);

        // 8. Top 5 categories
        const topCategories = await Expense.aggregate([
            { $match: match },
            { $group: { _id: "$category", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
        ]);

        res.json({
            success: true,
            totalExpense: totalExpense[0]?.total || 0,
            averageExpense: averageExpense[0]?.avg || 0,
            highestExpense: highestExpense[0] || null,
            latestExpenses,
            yearly,
            monthly,
            categoryRatio,
            topCategories,
        });
    } catch (err) {
        console.error("getExpenseSummary error:", err);
        res.status(500).json({ success: false, error: "Failed to get summary" });
    }
}

// ✅ Get all unique categories
async function getExpenseCategories(req, res) {
    try {
        const categories = await Expense.distinct("category");
        res.json({ success: true, categories });
    } catch (err) {
        console.error("getExpenseCategories error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch categories" });
    }
};

// ✅ Get month-wise expenses
async function getMonthWiseExpenses(req, res) {
    try {
        const { start, end } = req.query;
        const match = {};

        // optional date range filter
        if (start && end) {
            match.date = {};
            if (start) match.date.$gte = Time.toJSDate(Time.fromISO(start));
            if (end) match.date.$lte = Time.toJSDate(Time.fromISO(end));
        }

        // 1. Aggregate month-wise totals
        const monthlyTotals = await Expense.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { monthKey: "$monthKey", yearKey: "$yearKey" },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.yearKey": 1, "_id.monthKey": 1 } }
        ]);

        // 2. For each month, fetch details
        const results = [];
        for (const month of monthlyTotals) {
            const { monthKey, yearKey } = month._id;

            const details = await Expense.find({
                ...match,
                monthKey,
                yearKey
            }).select("title category amount date proofUrl createdBy");

            results.push({
                monthKey,
                yearKey,
                total: month.total,
                details
            });
        }

        res.json({ success: true, data: results });
    } catch (err) {
        console.error("getMonthWiseExpenses error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch month wise expenses" });
    }
}

// ✅ Finance Dashboard - Comprehensive Financial Overview
async function getFinanceDashboard(req, res) {
    try {
        const now = Time.now();
        const currentMonthStart = Time.toJSDate(now.startOf('month'));
        const currentMonthEnd = Time.toJSDate(now.endOf('month'));

        const lastMonthStart = Time.toJSDate(now.minus({ months: 1 }).startOf('month'));
        const lastMonthEnd = Time.toJSDate(now.minus({ months: 1 }).endOf('month'));

        const last7DaysStart = Time.toJSDate(now.minus({ days: 6 }).startOf('day'));
        const todayEnd = Time.toJSDate(now.endOf('day'));

        // ===================
        // 1. CURRENT MONTH SUMMARY
        // ===================
        const currentMonthExpenses = await Expense.aggregate([
            { $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        const currentMonthFoodExpenses = await FoodRecord.aggregate([
            { $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$cost" }, count: { $sum: 1 } } }
        ]);

        const currentMonthIncome = await ClientIncome.aggregate([
            { $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$receivedAmount" }, count: { $sum: 1 } } }
        ]);

        // ===================
        // 2. LAST MONTH SUMMARY
        // ===================
        const lastMonthExpenses = await Expense.aggregate([
            { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        const lastMonthFoodExpenses = await FoodRecord.aggregate([
            { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$cost" }, count: { $sum: 1 } } }
        ]);

        const lastMonthIncome = await ClientIncome.aggregate([
            { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
            { $group: { _id: null, total: { $sum: "$receivedAmount" }, count: { $sum: 1 } } }
        ]);

        // ===================
        // 3. LAST 7 DAYS TREND
        // ===================
        const last7DaysData = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = Time.toJSDate(now.minus({ days: i }).startOf('day'));
            const dayEnd = Time.toJSDate(now.minus({ days: i }).endOf('day'));

            const dayExpenses = await Expense.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const dayFoodExpenses = await FoodRecord.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$cost" } } }
            ]);

            const dayIncome = await ClientIncome.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$receivedAmount" } } }
            ]);

            last7DaysData.push({
                date: Time.format(now.minus({ days: i }), 'yyyy-MM-dd'),
                dayName: Time.format(now.minus({ days: i }), 'cccc'),
                income: dayIncome[0]?.total || 0,
                expenses: (dayExpenses[0]?.total || 0) + (dayFoodExpenses[0]?.total || 0),
                generalExpenses: dayExpenses[0]?.total || 0,
                foodExpenses: dayFoodExpenses[0]?.total || 0,
                profit: (dayIncome[0]?.total || 0) - ((dayExpenses[0]?.total || 0) + (dayFoodExpenses[0]?.total || 0))
            });
        }

        // ===================
        // 4. LAST MONTH DAY-BY-DAY COMPARISON
        // ===================
        const lastMonthDayByDay = [];
        const lastMonth = now.minus({ months: 1 });
        const daysInLastMonth = lastMonth.daysInMonth;

        for (let day = 1; day <= daysInLastMonth; day++) {
            const dayStart = Time.toJSDate(lastMonth.set({ day }).startOf('day'));
            const dayEnd = Time.toJSDate(lastMonth.set({ day }).endOf('day'));

            const dayExpenses = await Expense.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const dayFoodExpenses = await FoodRecord.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$cost" } } }
            ]);

            const dayIncome = await ClientIncome.aggregate([
                { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$receivedAmount" } } }
            ]);

            const dayData = lastMonth.set({ day });
            lastMonthDayByDay.push({
                day: day,
                date: Time.format(dayData, 'yyyy-MM-dd'),
                dayName: Time.format(dayData, 'cccc'),
                income: dayIncome[0]?.total || 0,
                expenses: (dayExpenses[0]?.total || 0) + (dayFoodExpenses[0]?.total || 0),
                generalExpenses: dayExpenses[0]?.total || 0,
                foodExpenses: dayFoodExpenses[0]?.total || 0,
                profit: (dayIncome[0]?.total || 0) - ((dayExpenses[0]?.total || 0) + (dayFoodExpenses[0]?.total || 0))
            });
        }

        // ===================
        // 5. OVERALL TOTALS (ALL TIME)
        // ===================
        const totalExpenses = await Expense.aggregate([
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        const totalFoodExpenses = await FoodRecord.aggregate([
            { $group: { _id: null, total: { $sum: "$cost" }, count: { $sum: 1 } } }
        ]);

        const totalIncome = await ClientIncome.aggregate([
            { $group: { _id: null, total: { $sum: "$receivedAmount" }, count: { $sum: 1 } } }
        ]);

        // ===================
        // 6. CATEGORY WISE BREAKDOWN (Current Month)
        // ===================
        const currentMonthExpensesByCategory = await Expense.aggregate([
            { $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
            { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]);

        const currentMonthFoodByMealType = await FoodRecord.aggregate([
            { $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } } },
            { $group: { _id: "$mealType", total: { $sum: "$cost" }, count: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]);

        // ===================
        // 7. MONTHLY COMPARISON DATA (Last 6 Months)
        // ===================
        const monthlyComparison = [];
        for (let i = 5; i >= 0; i--) {
            const monthStart = Time.toJSDate(now.minus({ months: i }).startOf('month'));
            const monthEnd = Time.toJSDate(now.minus({ months: i }).endOf('month'));

            const monthExpenses = await Expense.aggregate([
                { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const monthFoodExpenses = await FoodRecord.aggregate([
                { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
                { $group: { _id: null, total: { $sum: "$cost" } } }
            ]);

            const monthIncome = await ClientIncome.aggregate([
                { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
                { $group: { _id: null, total: { $sum: "$receivedAmount" } } }
            ]);

            const monthData = now.minus({ months: i });
            monthlyComparison.push({
                month: Time.format(monthData, 'yyyy-MM'),
                monthName: Time.format(monthData, 'MMMM yyyy'),
                income: monthIncome[0]?.total || 0,
                expenses: (monthExpenses[0]?.total || 0) + (monthFoodExpenses[0]?.total || 0),
                generalExpenses: monthExpenses[0]?.total || 0,
                foodExpenses: monthFoodExpenses[0]?.total || 0,
                profit: (monthIncome[0]?.total || 0) - ((monthExpenses[0]?.total || 0) + (monthFoodExpenses[0]?.total || 0))
            });
        }

        // ===================
        // 8. CALCULATE SUMMARY METRICS
        // ===================
        const currentExpenseTotal = (currentMonthExpenses[0]?.total || 0) + (currentMonthFoodExpenses[0]?.total || 0);
        const lastExpenseTotal = (lastMonthExpenses[0]?.total || 0) + (lastMonthFoodExpenses[0]?.total || 0);
        const currentIncomeTotal = currentMonthIncome[0]?.total || 0;
        const lastIncomeTotal = lastMonthIncome[0]?.total || 0;

        const currentProfit = currentIncomeTotal - currentExpenseTotal;
        const lastMonthProfit = lastIncomeTotal - lastExpenseTotal;
        const overallProfit = (totalIncome[0]?.total || 0) - ((totalExpenses[0]?.total || 0) + (totalFoodExpenses[0]?.total || 0));

        // Percentage changes
        const expenseChange = lastExpenseTotal ? ((currentExpenseTotal - lastExpenseTotal) / lastExpenseTotal * 100) : 0;
        const incomeChange = lastIncomeTotal ? ((currentIncomeTotal - lastIncomeTotal) / lastIncomeTotal * 100) : 0;
        const profitChange = lastMonthProfit ? ((currentProfit - lastMonthProfit) / Math.abs(lastMonthProfit) * 100) : 0;

        // ===================
        // 9. RESPONSE STRUCTURE
        // ===================
        res.json({
            success: true,
            data: {
                summary: {
                    currentMonth: {
                        income: currentIncomeTotal,
                        expenses: currentExpenseTotal,
                        generalExpenses: currentMonthExpenses[0]?.total || 0,
                        foodExpenses: currentMonthFoodExpenses[0]?.total || 0,
                        profit: currentProfit,
                        month: Time.format(now, 'MMMM yyyy')
                    },
                    lastMonth: {
                        income: lastIncomeTotal,
                        expenses: lastExpenseTotal,
                        generalExpenses: lastMonthExpenses[0]?.total || 0,
                        foodExpenses: lastMonthFoodExpenses[0]?.total || 0,
                        profit: lastMonthProfit,
                        month: Time.format(now.minus({ months: 1 }), 'MMMM yyyy')
                    },
                    overall: {
                        income: totalIncome[0]?.total || 0,
                        expenses: (totalExpenses[0]?.total || 0) + (totalFoodExpenses[0]?.total || 0),
                        generalExpenses: totalExpenses[0]?.total || 0,
                        foodExpenses: totalFoodExpenses[0]?.total || 0,
                        profit: overallProfit
                    },
                    changes: {
                        expenseChange: Number(expenseChange.toFixed(2)),
                        incomeChange: Number(incomeChange.toFixed(2)),
                        profitChange: Number(profitChange.toFixed(2))
                    }
                },
                trends: {
                    last7Days: last7DaysData,
                    lastMonthDayByDay: lastMonthDayByDay,
                    monthlyComparison: monthlyComparison
                },
                breakdown: {
                    currentMonthExpensesByCategory,
                    currentMonthFoodByMealType
                },
                metrics: {
                    averageDailyIncome: Number((currentIncomeTotal / now.day).toFixed(2)),
                    averageDailyExpenses: Number((currentExpenseTotal / now.day).toFixed(2)),
                    profitMargin: currentIncomeTotal ? Number(((currentProfit / currentIncomeTotal) * 100).toFixed(2)) : 0,
                    expenseRatio: {
                        general: currentExpenseTotal ? Number(((currentMonthExpenses[0]?.total || 0) / currentExpenseTotal * 100).toFixed(2)) : 0,
                        food: currentExpenseTotal ? Number(((currentMonthFoodExpenses[0]?.total || 0) / currentExpenseTotal * 100).toFixed(2)) : 0
                    }
                }
            }
        });

    } catch (err) {
        console.error("getFinanceDashboard error:", err);
        res.status(500).json({ success: false, error: "Failed to fetch finance dashboard data" });
    }
}

module.exports = {
    createExpense,
    bulkCreateExpenses,
    getExpenses,
    getSingleExpense,
    updateExpense,
    deleteExpense,
    getExpenseSummary,
    getExpenseCategories,
    getMonthWiseExpenses,
    getFinanceDashboard,
};
