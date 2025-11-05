const express = require("express");
const router = express.Router();
const {
  addConsumableStock,
  useConsumable,
  getConsumableInventory,
  getInventoryStats,
  getProductPriceStats,
} = require("../controller/inventoryController");

// Add stock (purchase/receive)
router.post("/add/:typeId", addConsumableStock);

// Use consumable items
router.post("/use/:typeId", useConsumable);

// Get consumable inventory
router.get("/consumables", getConsumableInventory);

// Get inventory statistics
router.get("/stats", getInventoryStats);

// Get product price statistics with filtering
router.get("/price-stats", getProductPriceStats);

module.exports = router;
