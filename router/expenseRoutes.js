const express = require("express");
const router = express.Router();
const {
    bulkCreateExpenses,
    createExpense,
    getExpenses,
    getSingleExpense,
    getExpenseSummary,
    getExpenseCategories,
    getMonthWiseExpenses,
    getFinanceDashboard,
    updateExpense,
    deleteExpense
} = require("../controller/expenseController");
const multer = require("multer");

const upload = multer({ dest: "uploads/" }); // basic local file storage

// ✅ Bulk create expenses
router.post("/bulk", bulkCreateExpenses);

// ✅ Create a new expense
router.post("/", createExpense);

// ✅ Get expense summary
router.get("/summary", getExpenseSummary);

// ✅ Get finance dashboard
router.get("/finance-dashboard", getFinanceDashboard);

// ✅ Get expense categories
router.get("/categories", getExpenseCategories);

// ✅ Get month-wise expenses
router.get("/month-wise", getMonthWiseExpenses);

// ✅ Get all expenses
router.get("/", getExpenses);

// ✅ Update expense
router.patch("/:id", updateExpense);

// ✅ Delete expense
router.delete("/:id", deleteExpense);

// ✅ Get single expense by ID
router.get("/:id", getSingleExpense);

module.exports = router;