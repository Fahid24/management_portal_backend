const mongoose = require("mongoose");
const Inventory = require("../model/inventorySchema");
const Type = require("../model/typeSchema");
const Requisition = require("../model/requisitionSchema");
const Vendor = require("../model/vendorSchema");
const Category = require("../model/categorySchema");
const Product = require("../model/productSchema");
const Time = require("../utils/time");

/**
 * Add stock to inventory (for consumables)
 */
async function addConsumableStock(req, res) {
  try {
    const { typeId } = req.params;
    const { quantity, userId, requisitionId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(typeId)) {
      return res.status(400).json({ error: "Invalid type ID" });
    }
    if (quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    let requisition = null;
    if (requisitionId) {
      requisition = await Requisition.findOne({ requisitionID: requisitionId });
      if (!requisition) {
        return res.status(404).json({ error: "Requisition not found" });
      }
    }

    let inventory = await Inventory.findOne({ type: typeId });

    if (!inventory) {
      inventory = new Inventory({
        type: typeId,
        quantity,
        history: [{ action: "IN", quantity, timestamp: Time.toJSDate(Time.now()), requisitionId: requisition ? requisition._id : null, user: userId }]
      });
    } else {
      inventory.quantity += quantity;
      inventory.history.push({ action: "IN", quantity, timestamp: Time.toJSDate(Time.now()), requisitionId: requisition ? requisition._id : null, user: userId });
    }

    await inventory.save();
    await inventory.populate("type");

    res.status(200).json({
      success: true,
      message: `${quantity} items added to inventory`,
      data: inventory,
    });
  } catch (err) {
    console.error("❌ addConsumableStock error:", err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Use consumables (decrease available stock)
 */
async function useConsumable(req, res) {
  try {
    const { typeId } = req.params;
    const { quantity, userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(typeId)) {
      return res.status(400).json({ error: "Invalid type ID" });
    }
    if (quantity <= 0) {
      return res.status(400).json({ error: "Quantity must be greater than 0" });
    }

    const inventory = await Inventory.findOne({ type: typeId });
    if (!inventory) {
      return res.status(404).json({ error: "Inventory not found for this type" });
    }

    if (inventory.quantity < quantity) {
      return res.status(400).json({ error: "Not enough stock available" });
    }

    inventory.quantity -= quantity;
    inventory.usedQuantity += quantity;
    inventory.history.push({ action: "USED", quantity, timestamp: Time.toJSDate(Time.now()), user: userId });

    await inventory.save();
    await inventory.populate("type");

    res.status(200).json({
      success: true,
      message: `${quantity} items used`,
      data: inventory,
    });
  } catch (err) {
    console.error("❌ useConsumable error:", err);
    res.status(500).json({ error: err.message });
  }
}

/** 
 * Get Consumable Inventory
 */
async function getConsumableInventory(req, res) {
  try {
    let { page = 1, limit = 10, search = "", status = "" } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    // 🔹 Step 1: find all consumable types (with optional filtering by status and search)
    const typeFilter = {
      trackingMode: "CONSUMABLE",
      ...(status ? { status } : {}),
      ...(search ? { name: { $regex: search, $options: "i" } } : {}),
    };

    const consumableTypes = await Type.find(typeFilter).select("_id name");
    const consumableTypeIds = consumableTypes.map((t) => t._id);

    // 🔹 Step 2: build query
    const query = { type: { $in: consumableTypeIds } };

    // 🔹 Step 3: get total count for pagination
    const totalDocs = await Inventory.countDocuments(query);

    // 🔹 Step 4: fetch paginated inventory
    const consumableInventory = await Inventory.find(query)
      .populate("type")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();


    // 🔹 Step 5: build pagination object
    const pagination = {
      currentPage: pageNum,
      totalCount: totalDocs,
      totalPages: Math.ceil(totalDocs / limitNum),
      limit: limitNum,
    };

    // 🔹 Step 6: return response
    res.status(200).json({
      success: true,
      pagination,
      data: consumableInventory,
    });
  } catch (err) {
    console.error("❌ getConsumableInventory error:", err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * Get inventory statistics
 */
async function getInventoryStats(req, res) {
  try {
    const [
      totalVendors,
      totalCategories,
      totalTypes,
      assetTypes,
      consumableTypes,
      totalRequisitions,
      pendingRequisitions,
      approvedRequisitions,
      totalInventoryItems,
      recentAssignedAssetProducts,
      recentAddedAssetProducts,
      recentAddedConsumableProducts,
      recentRequisitionsRaw,
      assetProductStats,
      assetInventoryStats,
      consumableInventoryStats,
      lowStockConsumables,
      productsFromRequisition,
      productsFromManualEntry,
      activeVendors,
      activeTypes,
      activeCategories,
      categoryStats,
      typeStats,
      vendorStatsRaw,
      totalCostStats
    ] = await Promise.all([
      Vendor.countDocuments(),
      Category.countDocuments(),
      Type.countDocuments(),
      Type.countDocuments({ trackingMode: "ASSET" }),
      Type.countDocuments({ trackingMode: "CONSUMABLE" }),
      Requisition.countDocuments(),
      Requisition.countDocuments({ status: "Requested" }), // Fixed: Use correct enum value
      Requisition.countDocuments({ status: "Approved" }),
      Inventory.countDocuments(),

      // Recent assigned asset products
      Product.find({ status: "ASSIGNED" })
        .populate({ path: "type", match: { trackingMode: "ASSET" }, select: "name trackingMode" })
        .populate("currentOwner", "firstName lastName")
        .populate("requisitionId", "requisitionID")
        .sort({ updatedAt: -1 })
        .limit(5),

      // Recent added asset products
      Product.find()
        .populate({ path: "type", match: { trackingMode: "ASSET" }, select: "name trackingMode" })
        .sort({ createdAt: -1 })
        .limit(5),

      // Recent added consumable products (via inventory)
      Inventory.find()
        .populate({ path: "type", match: { trackingMode: "CONSUMABLE" }, select: "name trackingMode" })
        .sort({ updatedAt: -1 })
        .limit(5),

      // Recent requisitions
      Requisition.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("requestedBy", "firstName lastName")
        .populate("items.type", "name trackingMode")
        .populate("items.vendor", "name"),

      // Asset product status breakdown
      Product.aggregate([
        { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
        { $unwind: "$typeDetails" },
        { $match: { "typeDetails.trackingMode": "ASSET" } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),

      // Asset inventory stats
      Inventory.aggregate([
        { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
        { $unwind: "$typeDetails" },
        { $match: { "typeDetails.trackingMode": "ASSET" } },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: "$quantity" },
            usedQuantity: { $sum: "$usedQuantity" },
            unUseableQuantity: { $sum: "$unUseableQuantity" },
            underMaintenanceQuantity: { $sum: "$underMaintenanceQuantity" },
            availableQuantity: { $sum: { $subtract: ["$quantity", { $add: ["$usedQuantity", "$unUseableQuantity", "$underMaintenanceQuantity"] }] } }
          }
        }
      ]),

      // Consumable inventory stats
      Inventory.aggregate([
        { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
        { $unwind: "$typeDetails" },
        { $match: { "typeDetails.trackingMode": "CONSUMABLE" } },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: "$quantity" },
            usedQuantity: { $sum: "$usedQuantity" },
            availableQuantity: { $sum: { $subtract: ["$quantity", "$usedQuantity"] } }
          }
        }
      ]),

      // Low stock consumables (configurable threshold - less than 10 items)
      Inventory.aggregate([
        { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
        { $unwind: "$typeDetails" },
        {
          $addFields: {
            availableQuantity: { $subtract: ["$quantity", "$usedQuantity"] }
          }
        },
        {
          $match: {
            "typeDetails.trackingMode": "CONSUMABLE",
            "availableQuantity": { $lt: 10, $gte: 0 } // Available quantity less than 10 but not negative
          }
        },
        {
          $project: {
            typeName: "$typeDetails.name",
            availableQuantity: 1,
            totalQuantity: "$quantity",
            usedQuantity: "$usedQuantity",
            alertLevel: {
              $cond: {
                if: { $eq: ["$availableQuantity", 0] },
                then: "critical",
                else: { $cond: { if: { $lte: ["$availableQuantity", 5] }, then: "high", else: "medium" } }
              }
            }
          }
        },
        { $sort: { availableQuantity: 1 } }
      ]),

      // Products from requisitions
      Product.countDocuments({ origin: "Requisition" }),

      // Products added manually
      Product.countDocuments({ origin: "Manual Entry" }),

      // Active vendors, types, categories
      Vendor.find({ status: "Active" }).select("name contactPerson contactEmail contactPhone"),
      Type.find({ status: "Active" }).select("name trackingMode categoryId"),
      Category.find({ status: "Active" }).select("name description"),

      // Category stats - Fixed to include both Products and Inventory items
      Promise.all([
        // Asset products by category
        Product.aggregate([
          { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
          { $unwind: "$typeDetails" },
          { $match: { "typeDetails.trackingMode": "ASSET" } },
          { $lookup: { from: "categories", localField: "typeDetails.categoryId", foreignField: "_id", as: "categoryDetails" } },
          { $unwind: "$categoryDetails" },
          {
            $group: {
              _id: "$categoryDetails._id",
              categoryName: { $first: "$categoryDetails.name" },
              assetProductCount: { $sum: 1 }
            }
          }
        ]),
        // Consumable inventory by category
        Inventory.aggregate([
          { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
          { $unwind: "$typeDetails" },
          { $match: { "typeDetails.trackingMode": "CONSUMABLE" } },
          { $lookup: { from: "categories", localField: "typeDetails.categoryId", foreignField: "_id", as: "categoryDetails" } },
          { $unwind: "$categoryDetails" },
          {
            $group: {
              _id: "$categoryDetails._id",
              categoryName: { $first: "$categoryDetails.name" },
              consumableInventoryCount: { $sum: 1 }
            }
          }
        ])
      ]).then(([assetsByCategory, consumablesByCategory]) => {
        // Merge the results
        const categoryMap = new Map();

        assetsByCategory.forEach(item => {
          categoryMap.set(item._id.toString(), {
            categoryName: item.categoryName,
            assetProductCount: item.assetProductCount,
            consumableInventoryCount: 0
          });
        });

        consumablesByCategory.forEach(item => {
          const existing = categoryMap.get(item._id.toString());
          if (existing) {
            existing.consumableInventoryCount = item.consumableInventoryCount;
          } else {
            categoryMap.set(item._id.toString(), {
              categoryName: item.categoryName,
              assetProductCount: 0,
              consumableInventoryCount: item.consumableInventoryCount
            });
          }
        });

        return Array.from(categoryMap.values()).map(item => ({
          categoryName: item.categoryName,
          assetProductCount: item.assetProductCount,
          consumableInventoryCount: item.consumableInventoryCount,
          totalItems: item.assetProductCount + item.consumableInventoryCount
        }));
      }),

      // Type stats - Fixed to include both Products and Inventory items
      Promise.all([
        // Asset products by type
        Product.aggregate([
          { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
          { $unwind: "$typeDetails" },
          { $match: { "typeDetails.trackingMode": "ASSET" } },
          { $lookup: { from: "categories", localField: "typeDetails.categoryId", foreignField: "_id", as: "categoryDetails" } },
          { $unwind: "$categoryDetails" },
          {
            $group: {
              _id: "$typeDetails._id",
              typeName: { $first: "$typeDetails.name" },
              categoryName: { $first: "$categoryDetails.name" },
              trackingMode: { $first: "$typeDetails.trackingMode" },
              assetProductCount: { $sum: 1 }
            }
          }
        ]),
        // Consumable inventory by type
        Inventory.aggregate([
          { $lookup: { from: "types", localField: "type", foreignField: "_id", as: "typeDetails" } },
          { $unwind: "$typeDetails" },
          { $match: { "typeDetails.trackingMode": "CONSUMABLE" } },
          { $lookup: { from: "categories", localField: "typeDetails.categoryId", foreignField: "_id", as: "categoryDetails" } },
          { $unwind: "$categoryDetails" },
          {
            $group: {
              _id: "$typeDetails._id",
              typeName: { $first: "$typeDetails.name" },
              categoryName: { $first: "$categoryDetails.name" },
              trackingMode: { $first: "$typeDetails.trackingMode" },
              totalQuantity: { $sum: "$quantity" }
            }
          }
        ])
      ]).then(([assetsByType, consumablesByType]) => {
        const allTypes = [
          ...assetsByType.map(item => ({
            typeName: item.typeName,
            categoryName: item.categoryName,
            trackingMode: item.trackingMode,
            count: item.assetProductCount,
            countType: 'products'
          })),
          ...consumablesByType.map(item => ({
            typeName: item.typeName,
            categoryName: item.categoryName,
            trackingMode: item.trackingMode,
            count: item.totalQuantity,
            countType: 'quantity'
          }))
        ];
        return allTypes;
      }),

      // Vendor stats - Fixed logic to properly count products supplied by each vendor
      Requisition.aggregate([
        { $match: { status: "Approved" } },
        { $unwind: "$items" },
        { $lookup: { from: "vendors", localField: "items.vendor", foreignField: "_id", as: "vendorDetails" } },
        { $unwind: "$vendorDetails" },
        { $lookup: { from: "types", localField: "items.type", foreignField: "_id", as: "typeDetails" } },
        { $unwind: "$typeDetails" },
        {
          $group: {
            _id: "$vendorDetails._id",
            vendorName: { $first: "$vendorDetails.name" },
            assetItems: { $sum: { $cond: [{ $eq: ["$typeDetails.trackingMode", "ASSET"] }, "$items.quantityApproved", 0] } },
            consumableItems: { $sum: { $cond: [{ $eq: ["$typeDetails.trackingMode", "CONSUMABLE"] }, "$items.quantityApproved", 0] } },
            totalCost: { $sum: "$items.approvedCost" }
          }
        },
        {
          $project: {
            _id: 0,
            vendorName: 1,
            assetItems: 1,
            consumableItems: 1,
            totalItems: { $add: ["$assetItems", "$consumableItems"] },
            totalCost: 1
          }
        },
        { $sort: { totalItems: -1 } }
      ]),

      // Total cost analysis
      Requisition.aggregate([
        {
          $group: {
            _id: null,
            totalEstimatedCost: { $sum: "$totalEstimatedCost" },
            totalApprovedCost: { $sum: "$totalApprovedCost" },
            averageRequisitionCost: { $avg: "$totalEstimatedCost" }
          }
        }
      ])
    ]);

    // Assign vendor ranks
    const vendorStats = vendorStatsRaw.map((v, idx) => ({ ...v, rank: idx + 1 }));

    // Convert asset product stats to object format
    const assetStatusBreakdown = {};
    assetProductStats.forEach(stat => {
      assetStatusBreakdown[stat._id] = stat.count;
    });

    // Ensure all statuses are represented
    const allStatuses = ["AVAILABLE", "ASSIGNED", "UNUSABLE", "MAINTENANCE"];
    allStatuses.forEach(status => {
      if (!assetStatusBreakdown[status]) {
        assetStatusBreakdown[status] = 0;
      }
    });

    // ===== Split requisitions by trackingMode =====
    const recentAssetRequisitions = [];
    const recentConsumableRequisitions = [];
    recentRequisitionsRaw.forEach(req => {
      const assetItems = req.items.filter(i => i.type?.trackingMode === "ASSET");
      const consumableItems = req.items.filter(i => i.type?.trackingMode === "CONSUMABLE");
      if (assetItems.length) {
        recentAssetRequisitions.push({
          requisitionID: req.requisitionID,
          requestedBy: req.requestedBy,
          createdAt: req.createdAt,
          status: req.status,
          items: assetItems
        });
      }
      if (consumableItems.length) {
        recentConsumableRequisitions.push({
          requisitionID: req.requisitionID,
          requestedBy: req.requestedBy,
          createdAt: req.createdAt,
          status: req.status,
          items: consumableItems
        });
      }
    });

    // Calculate critical alerts count
    const criticalAlerts = lowStockConsumables.filter(item => item.alertLevel === 'critical').length;
    const highAlerts = lowStockConsumables.filter(item => item.alertLevel === 'high').length;
    const mediumAlerts = lowStockConsumables.filter(item => item.alertLevel === 'medium').length;

    // Calculate efficiency metrics
    const assetUtilizationRate = assetInventoryStats[0] ?
      ((assetInventoryStats[0].usedQuantity / assetInventoryStats[0].totalQuantity) * 100).toFixed(2) : 0;

    const consumableUtilizationRate = consumableInventoryStats[0] ?
      ((consumableInventoryStats[0].usedQuantity / consumableInventoryStats[0].totalQuantity) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      overview: {
        vendors: totalVendors,
        categories: totalCategories,
        types: { total: totalTypes, assetTypes, consumableTypes },
        requisitions: {
          total: totalRequisitions,
          pending: pendingRequisitions,
          approved: approvedRequisitions,
          approvalRate: totalRequisitions > 0 ? ((approvedRequisitions / totalRequisitions) * 100).toFixed(2) : 0
        },
        inventoryItems: totalInventoryItems,
        productOrigins: { fromRequisition: productsFromRequisition, manualEntry: productsFromManualEntry }
      },
      recent: {
        assignedAssetProducts: recentAssignedAssetProducts.filter(p => p.type), // Remove null type matches
        addedAssetProducts: recentAddedAssetProducts.filter(p => p.type),
        addedConsumableInventory: recentAddedConsumableProducts.filter(i => i.type),
        assetRequisitions: recentAssetRequisitions,
        consumableRequisitions: recentConsumableRequisitions
      },
      assetStatusBreakdown,
      inventorySummary: {
        assets: {
          ...assetInventoryStats[0] || {
            totalQuantity: 0,
            usedQuantity: 0,
            unUseableQuantity: 0,
            underMaintenanceQuantity: 0,
            availableQuantity: 0
          },
          utilizationRate: assetUtilizationRate
        },
        consumables: {
          ...consumableInventoryStats[0] || {
            totalQuantity: 0,
            usedQuantity: 0,
            availableQuantity: 0
          },
          utilizationRate: consumableUtilizationRate
        }
      },
      alerts: {
        lowStockConsumables: lowStockConsumables,
        lowStockCount: lowStockConsumables.length,
        criticalCount: criticalAlerts,
        highPriorityCount: highAlerts,
        mediumPriorityCount: mediumAlerts,
        summary: {
          total: lowStockConsumables.length,
          critical: criticalAlerts,
          high: highAlerts,
          medium: mediumAlerts
        }
      },
      financials: totalCostStats[0] || {
        totalEstimatedCost: 0,
        totalApprovedCost: 0,
        averageRequisitionCost: 0
      },
      activeLists: { vendors: activeVendors, types: activeTypes, categories: activeCategories },
      categoryStats,
      typeStats,
      vendorStats
    });
  } catch (error) {
    console.error("Error in getInventoryDashboard:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/**
 * Get product price statistics with filtering and cost analysis
 */
async function getProductPriceStats(req, res) {
  try {
    const {
      startDate,
      endDate,
      typeIds,
      categoryIds,
      trackingMode,
    } = req.query;

    // FIXED: Enhanced input validation
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide both startDate and endDate"
      });
    }

    // FIXED: Validate date format
    let analysisStartDate, analysisEndDate;
    try {
      analysisStartDate = Time.fromISO(startDate).startOf('day');
      analysisEndDate = Time.fromISO(endDate).endOf('day');

      if (!analysisStartDate.isValid || !analysisEndDate.isValid) {
        throw new Error("Invalid date format");
      }

      if (analysisStartDate > analysisEndDate) {
        return res.status(400).json({
          success: false,
          message: "Start date cannot be after end date"
        });
      }
    } catch (dateError) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please use ISO format (YYYY-MM-DD)"
      });
    }

    // Parse date range based on period
    let dateFilter = {
      $gte: Time.toJSDate(analysisStartDate),
      $lte: Time.toJSDate(analysisEndDate)
    };

    // Build type filter
    let typeFilter = {};
    if (typeIds) {
      try {
        const typeIdArray = Array.isArray(typeIds) ? typeIds : typeIds.split(',');
        // FIXED: Validate ObjectId format
        const validTypeIds = typeIdArray.map(id => {
          if (!mongoose.Types.ObjectId.isValid(id.trim())) {
            throw new Error(`Invalid type ID format: ${id}`);
          }
          return new mongoose.Types.ObjectId(id.trim());
        });
        typeFilter._id = { $in: validTypeIds };
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Invalid type IDs: ${error.message}`
        });
      }
    }
    if (categoryIds) {
      try {
        const categoryIdArray = Array.isArray(categoryIds) ? categoryIds : categoryIds.split(',');
        // FIXED: Validate ObjectId format
        const validCategoryIds = categoryIdArray.map(id => {
          if (!mongoose.Types.ObjectId.isValid(id.trim())) {
            throw new Error(`Invalid category ID format: ${id}`);
          }
          return new mongoose.Types.ObjectId(id.trim());
        });
        typeFilter.categoryId = { $in: validCategoryIds };
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Invalid category IDs: ${error.message}`
        });
      }
    }
    if (trackingMode) {
      // FIXED: Validate trackingMode values
      const validTrackingModes = ['ASSET', 'CONSUMABLE'];
      if (!validTrackingModes.includes(trackingMode.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid tracking mode. Must be one of: ${validTrackingModes.join(', ')}`
        });
      }
      typeFilter.trackingMode = trackingMode.toUpperCase();
    }

    // Get filtered types
    const types = await Type.find(typeFilter).lean();
    const typeIds_filtered = types.map(t => t._id);

    if (typeIds_filtered.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No types found matching the criteria",
        data: {
          summary: { 
            totalSpent: 0, 
            totalUsedValue: 0, 
            totalWasteValue: 0,
            totalUnusableValue: 0,
            totalMaintenanceValue: 0,
            totalTypes: 0,
            totalCategories: 0,
            averageEfficiencyScore: 0,
            highRiskItems: 0,
            criticalStockoutItems: 0,
            topPerformingItems: 0,
            underperformingItems: 0,
            overallUtilizationRate: 0,
            overallWastageRate: 0,
            overallROI: 0
          },
          typeBreakdown: [],
          categoryBreakdown: [],
          timeline: [],
          staticPeriodStats: {
            last30Days: { period: "Last 30 Days", dailyBreakdown: [], totalSpent: 0, totalQuantity: 0, purchaseCount: 0, averageSpendingPerDay: "0.00" },
            lastMonth: { period: "Last Month", dailyBreakdown: [], totalSpent: 0, totalQuantity: 0, purchaseCount: 0, averageSpendingPerDay: "0.00" }
          },
          businessInsights: {
            riskAnalysis: { highRiskItems: [], stockoutRisks: [], priceVolatileItems: [] },
            performanceAnalysis: { topPerformers: [], underperformers: [], mostEfficient: [], leastEfficient: [] },
            utilizationAnalysis: { highUtilization: [], lowUtilization: [], highWastage: [] },
            recommendations: { immediate: [], shortTerm: [], longTerm: [] }
          },
          dateRange: {
            start: analysisStartDate?.toISODate() || startDate,
            end: analysisEndDate?.toISODate() || endDate
          }
        }
      });
    }

    // 1. Calculate purchases cost from requisitions
    const purchasesData = await Requisition.aggregate([
      { $match: { status: "Approved", createdAt: dateFilter } },
      { $unwind: "$items" },
      { $match: { "items.type": { $in: typeIds_filtered } } },
      {
        $lookup: {
          from: "types",
          localField: "items.type",
          foreignField: "_id",
          as: "typeDetails"
        }
      },
      { $unwind: "$typeDetails" },
      {
        $lookup: {
          from: "categories",
          localField: "typeDetails.categoryId",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },
      {
        $group: {
          _id: {
            typeId: "$items.type",
            typeName: "$typeDetails.name",
            trackingMode: "$typeDetails.trackingMode",
            categoryName: "$categoryDetails.name"
          },
          totalSpent: { $sum: "$items.approvedCost" },
          totalQuantityPurchased: { $sum: "$items.quantityApproved" },
          totalAddedToInventory: { $sum: { $ifNull: ["$items.addedToInventory", 0] } }, // Track what's actually added
          // FIXED: Safe division with conditional to prevent division by zero
          averageUnitCost: {
            $avg: {
              $cond: [
                { $gt: ["$items.quantityApproved", 0] },
                { $divide: ["$items.approvedCost", "$items.quantityApproved"] },
                0
              ]
            }
          },
          purchaseCount: { $sum: 1 },
          minUnitCost: { $min: { $divide: ["$items.approvedCost", { $max: ["$items.quantityApproved", 1] }] } },
          maxUnitCost: { $max: { $divide: ["$items.approvedCost", { $max: ["$items.quantityApproved", 1] }] } },
          purchaseDates: { $push: "$createdAt" }
        }
      }
    ]);

    // 2. Calculate usage value from product history (for assets)
    const assetUsageData = await Product.aggregate([
      { $match: { type: { $in: typeIds_filtered } } },
      {
        $lookup: {
          from: "types",
          localField: "type", 
          foreignField: "_id",
          as: "typeDetails"
        }
      },
      { $unwind: "$typeDetails" },
      { $match: { "typeDetails.trackingMode": "ASSET" } }, // FIXED: Only ASSET types
      {
        $addFields: {
          relevantHistory: {
            $filter: {
              input: { $ifNull: ["$history", []] }, // FIXED: Handle null/undefined history
              cond: {
                $and: [
                  { $gte: ["$$this.timestamp", dateFilter.$gte] },
                  { $lte: ["$$this.timestamp", dateFilter.$lte] },
                  { $in: ["$$this.action", ["ASSIGNED", "UNUSABLE", "MAINTENANCE"]] }
                ]
              }
            }
          }
        }
      },
      { $match: { "relevantHistory.0": { $exists: true } } }, // FIXED: Only proceed if there's relevant history
      { $unwind: "$relevantHistory" },
      {
        $lookup: {
          from: "types",
          localField: "type",
          foreignField: "_id",
          as: "typeDetails"
        }
      },
      { $unwind: "$typeDetails" },
      {
        $lookup: {
          from: "categories",
          localField: "typeDetails.categoryId",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },
      {
        $group: {
          _id: {
            typeId: "$type",
            typeName: "$typeDetails.name",
            trackingMode: "$typeDetails.trackingMode",
            categoryName: "$categoryDetails.name",
            action: "$relevantHistory.action"
          },
          count: { $sum: 1 },
          totalValue: { $sum: { $ifNull: ["$price", 0] } }, // FIXED: Handle null price
          averageValue: { $avg: { $ifNull: ["$price", 0] } }
        }
      }
    ]);

    // 3. Calculate consumable usage from inventory history (CONSUMABLE workflow)
    const consumableUsageData = await Inventory.aggregate([
      { $match: { type: { $in: typeIds_filtered } } },
      {
        $lookup: {
          from: "types",
          localField: "type",
          foreignField: "_id",
          as: "typeDetails"
        }
      },
      { $unwind: "$typeDetails" },
      { $match: { "typeDetails.trackingMode": "CONSUMABLE" } }, // FIXED: Only CONSUMABLE types
      {
        $lookup: {
          from: "categories",
          localField: "typeDetails.categoryId",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },
      {
        $addFields: {
          relevantHistory: {
            $filter: {
              input: { $ifNull: ["$history", []] }, // FIXED: Handle null/undefined history
              cond: {
                $and: [
                  { $gte: ["$$this.timestamp", dateFilter.$gte] },
                  { $lte: ["$$this.timestamp", dateFilter.$lte] },
                  { $eq: ["$$this.action", "Used"] }
                ]
              }
            }
          }
        }
      },
      {
        $group: {
          _id: {
            typeId: "$type",
            typeName: "$typeDetails.name",
            trackingMode: "$typeDetails.trackingMode",
            categoryName: "$categoryDetails.name"
          },
          // Current inventory status (for CONSUMABLE items)
          totalCurrentQuantity: { $sum: "$quantity" },
          totalCurrentUsedQuantity: { $sum: "$usedQuantity" },
          totalCurrentAvailableQuantity: { $sum: { $subtract: ["$quantity", "$usedQuantity"] } },

          // Historical usage in date range
          totalUsedInPeriod: {
            $sum: {
              $reduce: {
                input: "$relevantHistory",
                initialValue: 0,
                in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] }
              }
            }
          },
          usageTransactionsInPeriod: {
            $sum: { $size: { $ifNull: ["$relevantHistory", []] } }
          },
          averageUsagePerTransaction: {
            $avg: {
              $map: {
                input: "$relevantHistory",
                as: "hist",
                in: { $ifNull: ["$$hist.quantity", 0] }
              }
            }
          }
        }
      }
    ]);

    // 4. Create comprehensive statistics map
    const statsMap = new Map();

    // FIXED: Initialize with all types first to ensure complete coverage
    types.forEach(type => {
      statsMap.set(type._id.toString(), {
        typeId: type._id,
        typeName: type.name,
        trackingMode: type.trackingMode,
        categoryName: '', // Will be filled from data
        totalSpent: 0,
        totalQuantityPurchased: 0,
        averageUnitCost: 0,
        minUnitCost: 0,
        maxUnitCost: 0,
        purchaseCount: 0,
        assignedValue: 0,
        assignedCount: 0,
        unusableValue: 0,
        unusableCount: 0,
        maintenanceValue: 0,
        maintenanceCount: 0,
        // CONSUMABLE-specific fields
        totalCurrentQuantity: 0,
        totalCurrentUsedQuantity: 0,
        totalCurrentAvailableQuantity: 0,
        consumableUsedValue: 0,
        consumableUsedQuantity: 0,
        usageTransactionsInPeriod: 0,
        averageUsagePerTransaction: 0,
        inventoryTurnoverRate: 0,
        // Common fields
        priceVolatility: 0,
        lastPurchaseDate: null,
        daysSinceLastPurchase: 0
      });
    });

    // Initialize with purchase data
    purchasesData.forEach(item => {
      const key = item._id.typeId.toString();
      const stats = statsMap.get(key);
      if (stats) {
        Object.assign(stats, {
          categoryName: item._id.categoryName,
          totalSpent: item.totalSpent || 0,
          totalQuantityPurchased: item.totalQuantityPurchased || 0,
          averageUnitCost: item.averageUnitCost || 0,
          minUnitCost: item.minUnitCost || 0,
          maxUnitCost: item.maxUnitCost || 0,
          purchaseCount: item.purchaseCount || 0,
          priceVolatility: item.maxUnitCost && item.minUnitCost && item.averageUnitCost ?
            (((item.maxUnitCost - item.minUnitCost) / item.averageUnitCost) * 100).toFixed(2) : 0,
          lastPurchaseDate: item.purchaseDates ?
            new Date(Math.max(...item.purchaseDates.map(d => new Date(d)))) : null
        });

        // Calculate days since last purchase
        if (stats.lastPurchaseDate) {
          const daysDiff = Time.now().diff(Time.fromJSDate(stats.lastPurchaseDate), 'days').days;
          stats.daysSinceLastPurchase = Math.floor(daysDiff);
        }
      }
    });

    // Add asset usage data
    assetUsageData.forEach(item => {
      const key = item._id.typeId.toString();
      const stats = statsMap.get(key);
      if (stats) {
        if (!stats.categoryName) stats.categoryName = item._id.categoryName;

        if (item._id.action === "ASSIGNED") {
          stats.assignedValue = item.totalValue || 0;
          stats.assignedCount = item.count || 0;
        } else if (item._id.action === "UNUSABLE") {
          stats.unusableValue = item.totalValue || 0;
          stats.unusableCount = item.count || 0;
        } else if (item._id.action === "MAINTENANCE") {
          stats.maintenanceValue = item.totalValue || 0;
          stats.maintenanceCount = item.count || 0;
        }
      }
    });

    // Add consumable usage data
    consumableUsageData.forEach(item => {
      const key = item._id.typeId.toString();
      const stats = statsMap.get(key);
      if (stats) {
        if (!stats.categoryName) stats.categoryName = item._id.categoryName;

        // CONSUMABLE-specific inventory status
        stats.totalCurrentQuantity = item.totalCurrentQuantity || 0;
        stats.totalCurrentUsedQuantity = item.totalCurrentUsedQuantity || 0;
        stats.totalCurrentAvailableQuantity = item.totalCurrentAvailableQuantity || 0;

        // Usage in the selected period
        stats.consumableUsedQuantity = item.totalUsedInPeriod || 0;
        stats.usageTransactionsInPeriod = item.usageTransactionsInPeriod || 0;
        stats.averageUsagePerTransaction = item.averageUsagePerTransaction || 0;

        // Calculate value using average unit cost (for CONSUMABLE items)
        stats.consumableUsedValue = (stats.averageUnitCost || 0) * stats.consumableUsedQuantity;

        // CONSUMABLE-specific turnover rate
        stats.inventoryTurnoverRate = stats.totalCurrentQuantity > 0 ?
          ((stats.consumableUsedQuantity / stats.totalCurrentQuantity) * 100).toFixed(2) : 0;
      }
    });

    // 5. Generate summary and breakdowns with enhanced business metrics
    const typeBreakdown = Array.from(statsMap.values()).map(stats => {
      const totalUsedValue = stats.assignedValue + stats.consumableUsedValue;
      const utilizationRate = stats.totalSpent > 0 ?
        ((totalUsedValue / stats.totalSpent) * 100).toFixed(2) : 0;
      const wastageRate = stats.totalSpent > 0 ?
        ((stats.unusableValue / stats.totalSpent) * 100).toFixed(2) : 0;

      // Enhanced Business Intelligence Metrics
      const roi = stats.totalSpent > 0 ?
        (((totalUsedValue - stats.totalSpent) / stats.totalSpent) * 100).toFixed(2) : 0;

      // Calculate inventory turnover based on tracking mode
      let inventoryTurnover = 0;
      if (stats.trackingMode === 'CONSUMABLE') {
        // For CONSUMABLE: use inventory turnover rate (already calculated)
        inventoryTurnover = stats.inventoryTurnoverRate || 0;
      } else if (stats.trackingMode === 'ASSET') {
        // For ASSET: calculate based on assignments vs purchases
        inventoryTurnover = stats.totalQuantityPurchased > 0 && stats.assignedCount > 0 ?
          ((stats.assignedCount / stats.totalQuantityPurchased) * 100).toFixed(2) : 0;
      }

      const riskLevel = calculateRiskLevel({
        wastageRate: parseFloat(wastageRate),
        priceVolatility: parseFloat(stats.priceVolatility),
        daysSinceLastPurchase: stats.daysSinceLastPurchase,
        utilizationRate: parseFloat(utilizationRate)
      });

      const performanceGrade = calculatePerformanceGrade(
        parseFloat(utilizationRate),
        parseFloat(wastageRate),
        parseFloat(roi)
      );

      return {
        ...stats,
        totalUsedValue: parseFloat(totalUsedValue.toFixed(2)),
        totalUnusableValue: parseFloat(stats.unusableValue.toFixed(2)), // FIXED: Add missing property
        utilizationRate: parseFloat(utilizationRate),
        wastageRate: parseFloat(wastageRate),
        roi: parseFloat(roi),
        inventoryTurnover: parseFloat(inventoryTurnover),
        priceVolatility: parseFloat(stats.priceVolatility),
        // Ensure all decimal fields have 2 decimal places
        averageUnitCost: parseFloat((stats.averageUnitCost || 0).toFixed(2)),
        averageUsagePerTransaction: parseFloat((stats.averageUsagePerTransaction || 0).toFixed(2)),
        consumableUsedValue: parseFloat((stats.consumableUsedValue || 0).toFixed(2)),
        assignedValue: parseFloat((stats.assignedValue || 0).toFixed(2)),
        unusableValue: parseFloat((stats.unusableValue || 0).toFixed(2)),
        maintenanceValue: parseFloat((stats.maintenanceValue || 0).toFixed(2)),
        totalSpent: parseFloat((stats.totalSpent || 0).toFixed(2)),
        riskLevel,
        performanceGrade
      };
    });

    // Category breakdown
    const categoryMap = new Map();
    typeBreakdown.forEach(type => {
      const existing = categoryMap.get(type.categoryName) || {
        categoryName: type.categoryName,
        totalSpent: 0,
        totalUsedValue: 0,
        totalUnusableValue: 0,
        typeCount: 0
      };

      existing.totalSpent += type.totalSpent;
      existing.totalUsedValue += type.totalUsedValue;
      existing.totalUnusableValue += type.totalUnusableValue;
      existing.typeCount++;

      categoryMap.set(type.categoryName, existing);
    });

    const categoryBreakdown = Array.from(categoryMap.values()).map(cat => ({
      ...cat,
      totalSpent: parseFloat((cat.totalSpent || 0).toFixed(2)),
      totalUsedValue: parseFloat((cat.totalUsedValue || 0).toFixed(2)),
      totalUnusableValue: parseFloat((cat.totalUnusableValue || 0).toFixed(2)),
      utilizationRate: parseFloat(cat.totalSpent > 0 ?
        ((cat.totalUsedValue / cat.totalSpent) * 100).toFixed(2) : "0.00"),
      wastageRate: parseFloat(cat.totalSpent > 0 ?
        ((cat.totalUnusableValue / cat.totalSpent) * 100).toFixed(2) : "0.00")
    }));

    // Overall summary
    const summary = {
      totalSpent: parseFloat(typeBreakdown.reduce((sum, type) => sum + type.totalSpent, 0).toFixed(2)),
      totalUsedValue: parseFloat(typeBreakdown.reduce((sum, type) => sum + type.totalUsedValue, 0).toFixed(2)),
      totalUnusableValue: parseFloat(typeBreakdown.reduce((sum, type) => sum + type.totalUnusableValue, 0).toFixed(2)),
      totalMaintenanceValue: parseFloat(typeBreakdown.reduce((sum, type) => sum + type.maintenanceValue, 0).toFixed(2)),
      totalTypes: typeBreakdown.length,
      totalCategories: categoryBreakdown.length
    };

    summary.overallUtilizationRate = parseFloat(summary.totalSpent > 0 ?
      ((summary.totalUsedValue / summary.totalSpent) * 100).toFixed(2) : "0.00");
    summary.overallWastageRate = parseFloat(summary.totalSpent > 0 ?
      ((summary.totalUnusableValue / summary.totalSpent) * 100).toFixed(2) : "0.00");

    // 6. Generate timeline data (weekly breakdown)
    const timeline = [];
    let current = analysisStartDate.startOf('week');
    const end = analysisEndDate.endOf('week');

    while (current <= end) {
      const weekEnd = current.endOf('week');
      const weekData = {
        period: current.toISODate(),
        weekStart: current.toISODate(),
        weekEnd: weekEnd.toISODate(),
        spent: 0,
        used: 0,
        unusable: 0
      };

      // Calculate weekly spending from requisitions
      const weeklyPurchases = await Requisition.aggregate([
        {
          $match: {
            status: "Approved",
            createdAt: {
              $gte: Time.toJSDate(current),
              $lte: Time.toJSDate(weekEnd)
            }
          }
        },
        { $unwind: "$items" },
        { $match: { "items.type": { $in: typeIds_filtered } } },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: "$items.approvedCost" }
          }
        }
      ]);

      if (weeklyPurchases.length > 0) {
        weekData.spent = weeklyPurchases[0].totalSpent || 0;
      }

      timeline.push(weekData);
      current = current.plus({ weeks: 1 });
    }

    // 7. Calculate static last 30 days and last month stats (not affected by date filter)
    const now = Time.now();
    const last30DaysStart = now.minus({ days: 30 }).startOf('day');
    const lastMonthStart = now.minus({ months: 1 }).startOf('month');
    const lastMonthEnd = now.minus({ months: 1 }).endOf('month');

    // FIXED: Single aggregation for last 30 days with daily grouping
    const last30DaysData = await Requisition.aggregate([
      {
        $match: {
          status: "Approved",
          createdAt: {
            $gte: Time.toJSDate(last30DaysStart),
            $lte: Time.toJSDate(now)
          }
        }
      },
      { $unwind: "$items" },
      { $match: { "items.type": { $in: typeIds_filtered } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          totalSpent: { $sum: "$items.approvedCost" },
          totalQuantity: { $sum: "$items.quantityApproved" },
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    // FIXED: Single aggregation for last month with daily grouping
    const lastMonthData = await Requisition.aggregate([
      {
        $match: {
          status: "Approved",
          createdAt: {
            $gte: Time.toJSDate(lastMonthStart),
            $lte: Time.toJSDate(lastMonthEnd)
          }
        }
      },
      { $unwind: "$items" },
      { $match: { "items.type": { $in: typeIds_filtered } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
          },
          totalSpent: { $sum: "$items.approvedCost" },
          totalQuantity: { $sum: "$items.quantityApproved" },
          purchaseCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.date": 1 } }
    ]);

    // Fill missing dates with zero values for complete daily breakdown
    function fillMissingDates(data, startDate, endDate) {
      const dataMap = new Map(data.map(d => [d._id.date, d]));
      const result = [];
      let current = startDate;

      while (current <= endDate) {
        const dateStr = current.toISODate();
        const dayData = dataMap.get(dateStr) || {
          _id: { date: dateStr },
          totalSpent: 0,
          totalQuantity: 0,
          purchaseCount: 0
        };

        result.push({
          date: dateStr,
          dayName: current.toFormat('EEEE'),
          totalSpent: parseFloat((dayData.totalSpent || 0).toFixed(2)),
          totalQuantity: parseFloat((dayData.totalQuantity || 0).toFixed(2)),
          purchaseCount: dayData.purchaseCount
        });

        current = current.plus({ days: 1 });
      }

      return result;
    }

    // Calculate totals for summary
    function calculateTotals(data) {
      const totals = data.reduce((acc, item) => ({
        totalSpent: acc.totalSpent + item.totalSpent,
        totalQuantity: acc.totalQuantity + item.totalQuantity,
        purchaseCount: acc.purchaseCount + item.purchaseCount
      }), { totalSpent: 0, totalQuantity: 0, purchaseCount: 0 });

      return {
        totalSpent: parseFloat(totals.totalSpent.toFixed(2)),
        totalQuantity: parseFloat(totals.totalQuantity.toFixed(2)),
        purchaseCount: totals.purchaseCount
      };
    }

    const last30DaysDaily = fillMissingDates(last30DaysData, last30DaysStart, now);
    const lastMonthDaily = fillMissingDates(lastMonthData, lastMonthStart, lastMonthEnd);
    const last30DaysTotals = calculateTotals(last30DaysData);
    const lastMonthTotals = calculateTotals(lastMonthData);

    // Static period stats object with daily breakdown
    const staticPeriodStats = {
      last30Days: {
        period: "Last 30 Days",
        startDate: last30DaysStart.toISODate(),
        endDate: now.toISODate(),
        totalSpent: last30DaysTotals.totalSpent,
        totalQuantity: last30DaysTotals.totalQuantity,
        purchaseCount: last30DaysTotals.purchaseCount,
        averageSpendingPerDay: parseFloat((last30DaysTotals.totalSpent / 30).toFixed(2)),
        dailyBreakdown: last30DaysDaily
      },
      lastMonth: {
        period: "Last Month",
        startDate: lastMonthStart.toISODate(),
        endDate: lastMonthEnd.toISODate(),
        totalSpent: lastMonthTotals.totalSpent,
        totalQuantity: lastMonthTotals.totalQuantity,
        purchaseCount: lastMonthTotals.purchaseCount,
        averageSpendingPerDay: parseFloat((lastMonthTotals.totalSpent / lastMonthStart.daysInMonth).toFixed(2)),
        dailyBreakdown: lastMonthDaily
      }
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        typeBreakdown: typeBreakdown.sort((a, b) => b.totalSpent - a.totalSpent),
        categoryBreakdown: categoryBreakdown.sort((a, b) => b.totalSpent - a.totalSpent),
        timeline,
        staticPeriodStats,
        dateRange: {
          start: analysisStartDate.toISODate(),
          end: analysisEndDate.toISODate()
        }
      }
    });

  } catch (error) {
    console.error("Error in getProductPriceStats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
}

// Helper functions for business intelligence calculations
function calculateRiskLevel(stats) {
  let riskScore = 0;

  // High wastage risk
  if (stats.wastageRate > 20) riskScore += 3;
  else if (stats.wastageRate > 10) riskScore += 2;
  else if (stats.wastageRate > 5) riskScore += 1;

  // Price volatility risk
  if (stats.priceVolatility > 30) riskScore += 2;
  else if (stats.priceVolatility > 15) riskScore += 1;

  // Stale inventory risk
  if (stats.daysSinceLastPurchase > 180) riskScore += 2;
  else if (stats.daysSinceLastPurchase > 90) riskScore += 1;

  // Low utilization risk
  if (stats.utilizationRate < 30) riskScore += 2;
  else if (stats.utilizationRate < 50) riskScore += 1;

  if (riskScore >= 6) return 'HIGH';
  if (riskScore >= 3) return 'MEDIUM';
  return 'LOW';
}

function calculatePerformanceGrade(utilization, wastage, roi) {
  let score = 0;

  // Utilization scoring (40% weight)
  if (utilization >= 80) score += 40;
  else if (utilization >= 60) score += 30;
  else if (utilization >= 40) score += 20;
  else score += 10;

  // Wastage scoring (30% weight)
  if (wastage <= 5) score += 30;
  else if (wastage <= 10) score += 20;
  else if (wastage <= 20) score += 10;
  else score += 0;

  // ROI scoring (30% weight)
  if (roi >= 20) score += 30;
  else if (roi >= 10) score += 20;
  else if (roi >= 0) score += 15;
  else score += 0;

  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Get Available types to add Inventory with quantity details
 */
async function getAvailableTypes(req, res) {
  try {
    // Get all approved requisitions with their items
    const approvedRequisitions = await Requisition.find({ status: "Approved" })
      .populate('items.type', 'name trackingMode categoryId')
      .populate('items.vendor', 'name')
      .populate('items.approvedVendor', 'name')
      .lean();

    // Create a map to aggregate quantities by type
    const typeQuantityMap = new Map();

    // Process each requisition and its items
    approvedRequisitions.forEach(requisition => {
      requisition.items.forEach(item => {
        if (item.type && item.quantityApproved > 0) {
          const typeId = item.type._id.toString();

          if (typeQuantityMap.has(typeId)) {
            // Add to existing type entry
            const existing = typeQuantityMap.get(typeId);
            existing.totalApprovedQuantity += item.quantityApproved;
            existing.totalAddedToInventory += item.addedToInventory || 0;
          } else {
            // Create new type entry
            typeQuantityMap.set(typeId, {
              typeId: item.type._id,
              typeName: item.type.name,
              trackingMode: item.type.trackingMode,
              categoryId: item.type.categoryId,
              totalApprovedQuantity: item.quantityApproved,
              totalAddedToInventory: item.addedToInventory || 0
            });
          }
        }
      });
    });

    // Convert map to array and calculate remaining quantities
    const availableTypes = Array.from(typeQuantityMap.values())
      .map(typeData => {
        const remainingQuantity = typeData.totalApprovedQuantity - typeData.totalAddedToInventory;

        return {
          value: typeData.typeId,
          label: typeData.typeName,
          trackingMode: typeData.trackingMode,
          categoryId: typeData.categoryId,
          totalApprovedQuantity: typeData.totalApprovedQuantity,
          totalAddedToInventory: typeData.totalAddedToInventory,
          remainingQuantity: remainingQuantity,
          canAdd: remainingQuantity > 0,
          displayText: `${typeData.typeName} (${remainingQuantity} available)`
        };
      })
      .filter(type => type.canAdd) // Only return types that can still be added
      .sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically

    res.status(200).json({
      success: true,
      data: availableTypes
    });
  } catch (error) {
    console.error("Error in getAvailableTypes:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
}


module.exports = {
  addConsumableStock,
  useConsumable,
  getConsumableInventory,
  getInventoryStats,
  getProductPriceStats,
  getAvailableTypes,
};
