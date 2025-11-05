const mongoose = require("mongoose");
const Product = require("../model/productSchema");
const Employee = require("../model/employeeSchema");
const Requisition = require("../model/requisitionSchema");
const Inventory = require("../model/inventorySchema");
const Type = require("../model/typeSchema");
const Time = require("../utils/time");

// Create a new product
async function createProduct(req, res) {
  try {
    const { name, description, type, price, documents, requisitionId, actionBy } = req.body;

    // Validate required fields
    if (!name || !type || !actionBy || !price) {
      return res.status(400).json({
        error: "Name, type, actionBy, and price are required fields"
      });
    }

    if (price < 0) {
      return res.status(400).json({ error: "Price must be a positive number" });
    }

    // Validate type ObjectId
    if (!mongoose.Types.ObjectId.isValid(type)) {
      return res.status(400).json({ error: "Invalid type ID" });
    }

    const typeData = await Type.findById(type);
    if (!typeData) {
      return res.status(404).json({ error: "Type not found" });
    }

    if (!mongoose.Types.ObjectId.isValid(actionBy)) {
      return res.status(400).json({ error: "Invalid ActionBy ID" });
    }

    const actionByData = await Employee.findById(actionBy);
    if (!actionByData) {
      return res.status(404).json({ error: "ActionBy not found" });
    }

    let requisition = null;
    let itemData = null;
    if (requisitionId) {
      requisition = await Requisition.findOne({ requisitionID: requisitionId });
      if (!requisition) {
        return res.status(404).json({ error: "Requisition not found" });
      }
      if (requisition.status !== "Approved") {
        return res.status(400).json({ error: "Requisition must be approved" });
      }

      itemData = requisition.items.find(item => item.type?.toString() === type?.toString());
      if (!itemData) {
        return res.status(400).json({ error: "Type not found in requisition items" });
      }
      const addableQuantity = itemData.quantityApproved - itemData.addedToInventory;
      if (itemData.addedToInventory + 1 > itemData.quantityApproved) {
        return res.status(400).json({ error: `Cannot add more items than approved quantity. You able to add ${addableQuantity > 0 ? addableQuantity : 0} only.` });
      }
    }

    // Create new product
    const product = new Product({
      name,
      description,
      type,
      price,
      documents: documents || [],
      requisitionId: requisition ? requisition._id : null,
      origin: requisitionId ? "Requisition" : "Manual Entry",
      currentOwner: null,
      history: []
    });

    await product.save();

    // Update inventory
    const inventory = await Inventory.findOne({ type });
    if (inventory) {
      inventory.history.push({
        action: "IN",
        quantity: 1,
        timestamp: Time.toJSDate(Time.now()),
        requisitionId: requisition ? requisition._id : null,
        user: actionByData._id
      });
      inventory.products.push(product._id);
      inventory.quantity += 1;
      await inventory.save();
    } else {
      const newInventory = new Inventory({
        type,
        products: [product._id],
        quantity: 1,
        history: [
          {
            action: "IN",
            quantity: 1,
            timestamp: Time.toJSDate(Time.now()),
            requisitionId: requisition ? requisition._id : null,
            user: actionByData._id
          }
        ]
      });
      await newInventory.save();
    }

    if (itemData) {
      itemData.addedToInventory += 1;
      await requisition.save();
    }

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product
    });
  } catch (error) {
    console.error("❌ Create product error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Create Bulk Products
async function createBulkProducts(req, res) {
  try {
    const { type, quantity, requisitionId, products, actionBy } = req.body;

    if (!type) {
      return res.status(400).json({ error: "Type is required" });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "Valid quantity is required" });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Product details are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(type)) {
      return res.status(400).json({ error: "Invalid type ID" });
    }

    const typeData = await Type.findById(type);
    if (!typeData) {
      return res.status(404).json({ error: "Type not found" });
    }

    if (!mongoose.Types.ObjectId.isValid(actionBy)) {
      return res.status(400).json({ error: "Invalid ActionBy ID" });
    }

    const actionByData = await Employee.findById(actionBy);
    if (!actionByData) {
      return res.status(404).json({ error: "ActionBy not found" });
    }

    let requisition = null;
    let itemData = null;
    if (requisitionId) {
      requisition = await Requisition.findOne({ requisitionID: requisitionId });
      if (!requisition) {
        return res.status(404).json({ error: "Requisition not found" });
      }
      if (requisition.status !== "Approved") {
        return res.status(400).json({ error: "Requisition must be approved" });
      }
      itemData = requisition.items.find(item => item.type?.toString() === type?.toString());
      if (!itemData) {
        return res.status(400).json({ error: "Type not found in requisition items" });
      }
      const addableQuantity = itemData.quantityApproved - itemData.addedToInventory;
      if (quantity > addableQuantity) {
        return res.status(400).json({ error: `Cannot add more items than approved quantity. You able to add ${addableQuantity > 0 ? addableQuantity : 0} only.` });
      }
    }

    if (quantity !== products.length) {
      return res.status(400).json({ error: "Quantity must match the number of products" });
    }

    for (const product of products) {
      if (!product.name) {
        return res.status(400).json({ error: "Name is a required field for all products" });
      }
      if (!product.price) {
        return res.status(400).json({ error: "Price is a required field for all products" });
      }
      if (product.price < 0) {
        return res.status(400).json({ error: "Price must be a positive number" });
      }
    }

    // Create products in bulk
    const createdProducts = [];
    for (const product of products) {
      const newProduct = new Product({
        ...product,
        type,
        status: "AVAILABLE",
        currentOwner: null,
        requisitionId: requisition ? requisition._id : null,
        origin: requisition ? "Requisition" : "Manual Entry",
        history: []
      });
      await newProduct.save(); // this will trigger pre("save") and generate productId
      createdProducts.push(newProduct);
    }

    const inventory = await Inventory.findOne({ type });
    const productsId = createdProducts.map(p => p._id);
    const productCount = createdProducts.length;
    if (inventory) {
      inventory.history.push({
        action: "IN",
        quantity: productCount,
        timestamp: Time.toJSDate(Time.now()),
        requisitionId: requisition ? requisition._id : null,
        user: actionByData._id
      });
      inventory.products.push(...productsId);
      inventory.quantity += productCount;
      await inventory.save();
    } else {
      const newInventory = new Inventory({
        type,
        products: productsId,
        quantity: productCount,
        history: [
          {
            action: "IN",
            quantity: productCount,
            timestamp: Time.toJSDate(Time.now()),
            requisitionId: requisition ? requisition._id : null,
            user: actionByData._id
          }
        ]
      });
      await newInventory.save();
    }

    if (itemData) {
      itemData.addedToInventory += quantity;
      await requisition.save();
    }

    res.status(201).json({
      success: true,
      message: "Products created successfully",
      data: createdProducts
    });
  } catch (error) {
    console.error("❌ Create bulk products error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get all products with optional filters and pagination
async function getProducts(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      type,
      search,
      requisitionId,
      currentOwner
    } = req.query;

    // Build filter object
    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (type && mongoose.Types.ObjectId.isValid(type)) {
      filter.type = type;
    }

    if (currentOwner && mongoose.Types.ObjectId.isValid(currentOwner)) {
      filter.currentOwner = currentOwner;
    }

    if (requisitionId && mongoose.Types.ObjectId.isValid(requisitionId)) {
      filter.requisitionId = requisitionId;
    }

    // Add search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { productId: { $regex: search, $options: 'i' } },
      ];
    }

    // Parse pagination params
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    // Execute queries in parallel
    const [totalDocs, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .populate('type', 'name description')
        .populate('currentOwner', 'firstName lastName email role designation photoUrl')
        .populate('history.employeeId', 'firstName lastName email')
        .populate('history.handOverBy', 'firstName lastName email')
        .populate('history.returnBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    // Build pagination object
    const pagination = {
      currentPage: pageNum,
      totalCount: totalDocs,
      totalPages: Math.ceil(totalDocs / limitNum),
      limit: limitNum,
    };

    res.status(200).json({
      success: true,
      data: products,
      pagination
    });
  } catch (error) {
    console.error("❌ Get products error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Get single product by ID
async function getProductById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(id)
      .populate("type", "name description")
      .populate(
        "currentOwner",
        "firstName lastName email role department photoUrl designation"
      )
      .populate("history.employeeId", "firstName lastName email role")
      .populate("history.handOverBy", "firstName lastName email")
      .populate("history.returnBy", "firstName lastName email");

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error("❌ Get product by ID error:", error);
    res.status(500).json({ error: error.message });
  }
}

// Update product
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const { name, description, price, documents, status, currentOwner, actionBy } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (price && price < 0) {
      return res.status(400).json({ error: "Price must be a positive number" });
    }

    const prevStatus = product.status;
    const nextStatus = status || prevStatus;
    const typeId = product.type;

    const isValidObjId = (v) => mongoose.Types.ObjectId.isValid(v);
    const prevOwnerId = product.currentOwner ? product.currentOwner.toString() : null;

    // Assigning requires a valid currentOwner
    if (prevStatus !== "ASSIGNED" && nextStatus === "ASSIGNED") {
      if (!currentOwner || !isValidObjId(currentOwner)) {
        return res.status(400).json({ error: "currentOwner (valid Employee ObjectId) is required when assigning a product" });
      }
    }

    // Example guard: cannot assign unusable product
    if (prevStatus === "UNUSABLE" && nextStatus === "ASSIGNED") {
      return res.status(400).json({ error: "Cannot assign an UNUSABLE product. Change it to AVAILABLE or MAINTENANCE first." });
    }

    // --- Basic field updates ---
    if (name) product.name = name;
    if (description) product.description = description;
    if (Array.isArray(documents)) product.documents = documents;
    if (price) product.price = price;

    // Handle currentOwner based on status transitions
    if (prevStatus !== nextStatus) {
      if (nextStatus === "ASSIGNED") {
        product.currentOwner = currentOwner; // validated above
      } else if (prevStatus === "ASSIGNED") {
        product.currentOwner = null; // leaving ASSIGNED clears owner
      }
    } else {
      // Reassignment: status stays ASSIGNED but owner changes
      if (nextStatus === "ASSIGNED" && currentOwner && isValidObjId(currentOwner)) {
        const nextOwnerId = currentOwner.toString();
        if (!prevOwnerId || prevOwnerId !== nextOwnerId) {
          product.currentOwner = currentOwner;
        }
      }
    }

    if (status) product.status = status;

    // Save product first so owner/status reflect latest
    await product.save();

    // --- Inventory counters and history ---
    let inventory = await Inventory.findOne({ type: typeId });
    if (!inventory) {
      inventory = new Inventory({
        type: typeId,
        quantity: 0,
        usedQuantity: 0,
        unUseableQuantity: 0,
        underMaintenanceQuantity: 0,
        history: [],
        products: []
      });
    }

    let usedDelta = 0;
    let unusableDelta = 0;
    let maintenanceDelta = 0;
    let historyAction = null; // "IN" | "OUT" | "DISBURST"

    const AVAILABLE = "AVAILABLE";
    const ASSIGNED = "ASSIGNED";
    const UNUSABLE = "UNUSABLE";
    const MAINTENANCE = "MAINTENANCE";

    if (prevStatus !== nextStatus) {
      // AVAILABLE <-> ASSIGNED
      if (prevStatus === AVAILABLE && nextStatus === ASSIGNED) {
        usedDelta += 1; historyAction = "OUT";
      }
      if (prevStatus === ASSIGNED && nextStatus === AVAILABLE) {
        usedDelta -= 1; historyAction = "IN";
      }

      // AVAILABLE <-> MAINTENANCE
      if (prevStatus === AVAILABLE && nextStatus === MAINTENANCE) {
        maintenanceDelta += 1; historyAction = "OUT";
      }
      if (prevStatus === MAINTENANCE && nextStatus === AVAILABLE) {
        maintenanceDelta -= 1; historyAction = "IN";
      }

      // ASSIGNED -> MAINTENANCE
      if (prevStatus === ASSIGNED && nextStatus === MAINTENANCE) {
        usedDelta -= 1; maintenanceDelta += 1;
        // optional: historyAction = "OUT";
      }

      // MAINTENANCE -> ASSIGNED
      if (prevStatus === MAINTENANCE && nextStatus === ASSIGNED) {
        maintenanceDelta -= 1; usedDelta += 1; historyAction = "OUT";
      }

      // -> UNUSABLE
      if (nextStatus === UNUSABLE) {
        if (prevStatus === ASSIGNED) usedDelta -= 1;
        if (prevStatus === MAINTENANCE) maintenanceDelta -= 1;
        unusableDelta += 1; historyAction = "DISBURST";
      }

      // UNUSABLE -> AVAILABLE
      if (prevStatus === UNUSABLE && nextStatus === AVAILABLE) {
        unusableDelta -= 1; historyAction = "IN";
      }
    }

    // Apply inventory deltas with lower bounds
    if (usedDelta) {
      inventory.usedQuantity = Math.max(0, (inventory.usedQuantity || 0) + usedDelta);
    }
    if (unusableDelta) {
      inventory.unUseableQuantity = Math.max(0, (inventory.unUseableQuantity || 0) + unusableDelta);
    }
    if (maintenanceDelta) {
      inventory.underMaintenanceQuantity = Math.max(0, (inventory.underMaintenanceQuantity || 0) + maintenanceDelta);
    }

    // Inventory history
    if (historyAction) {
      inventory.history.push({
        action: historyAction,
        quantity: 1,
        timestamp: Time.toJSDate(Time.now()),
        user: isValidObjId(actionBy) ? actionBy : undefined
      });
    }

    await inventory.save();

    // --- Sync Employee.assets (assign / unassign / reassign) ---
    const newOwnerId = product.currentOwner ? product.currentOwner.toString() : null;

    // Reassign: ASSIGNED -> ASSIGNED with different owner
    if (prevStatus === ASSIGNED && nextStatus === ASSIGNED && prevOwnerId && newOwnerId && prevOwnerId !== newOwnerId) {
      await Employee.updateOne({ _id: prevOwnerId }, { $pull: { assets: product._id } });
      await Employee.updateOne({ _id: newOwnerId }, { $addToSet: { assets: product._id } });
    }

    // To ASSIGNED from non-ASSIGNED: add to new owner's assets
    if (prevStatus !== ASSIGNED && nextStatus === ASSIGNED && newOwnerId) {
      await Employee.updateOne({ _id: newOwnerId }, { $addToSet: { assets: product._id } });
    }

    // Leaving ASSIGNED: remove from previous owner's assets
    if (prevStatus === ASSIGNED && nextStatus !== ASSIGNED && prevOwnerId) {
      await Employee.updateOne({ _id: prevOwnerId }, { $pull: { assets: product._id } });
    }

    const populated = await Product.findById(product._id)
      .populate("type", "name description")
      .populate(
        "currentOwner",
        "firstName lastName email role designation photoUrl"
      );

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: populated
    });
  } catch (error) {
    console.error("❌ Update product error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Delete product
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;
    // Prefer authenticated user, else accept explicit actionBy in body
    const actionBy = req.query.actionBy;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    if (!actionBy || !mongoose.Types.ObjectId.isValid(actionBy)) {
      return res.status(400).json({ error: "actionBy (Employee ObjectId) is required" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Block delete if assigned
    if (product.status === "ASSIGNED" && product.currentOwner) {
      return res.status(400).json({ error: "Cannot delete a product that is currently assigned to an employee" });
    }

    // Adjust inventory
    const inventory = await Inventory.findOne({ type: product.type });
    if (inventory) {
      // total stock down by 1
      inventory.quantity = Math.max(0, (inventory.quantity || 0) - 1);
      // remove product ref
      inventory.products = (inventory.products || []).filter(
        (pId) => pId.toString() !== product._id.toString()
      );

      // counters by status
      if (product.status === "UNUSABLE") {
        inventory.unUseableQuantity = Math.max(0, (inventory.unUseableQuantity || 0) - 1);
      } else if (product.status === "MAINTENANCE") {
        inventory.underMaintenanceQuantity = Math.max(0, (inventory.underMaintenanceQuantity || 0) - 1);
      } else if (product.status === "ASSIGNED") {
        inventory.usedQuantity = Math.max(0, (inventory.usedQuantity || 0) - 1);
      }

      // history with required user
      inventory.history.push({
        action: "DELETED",
        quantity: 1,
        timestamp: new Date(),
        user: actionBy
      });

      await inventory.save();
    }

    // Remove this product from any employee’s assets (including currentOwner)
    await Employee.updateMany({ assets: product._id }, { $pull: { assets: product._id } });

    await Product.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete product error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Hand over product to employee
async function handOverProduct(req, res) {
  try {
    const { id } = req.params;
    const { employeeId, handOverBy } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ error: "Invalid employee ID" });
    }
    if (handOverBy && !mongoose.Types.ObjectId.isValid(handOverBy)) {
      return res.status(400).json({ error: "Invalid handover by ID" });
    }

    // Find product
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Guard: disallow handing over if already assigned
    if (product.status === "ASSIGNED" && product.currentOwner) {
      return res.status(400).json({ error: "Product is already assigned to an employee" });
    }

    // Guard: disallow unusable
    if (product.status === "UNUSABLE") {
      return res.status(400).json({ error: "Cannot hand over an UNUSABLE product" });
    }

    // Guard: optional — if under maintenance, force return to AVAILABLE first
    if (product.status === "MAINTENANCE") {
      return res.status(400).json({ error: "Product is under maintenance. Mark it AVAILABLE before handover." });
    }

    // Verify employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // Update product owner & status
    product.currentOwner = employeeId;
    product.status = "ASSIGNED";

    // Product handover history
    product.history.push({
      employeeId,
      handoverDate: Time.toJSDate(Time.now()),
      handOverBy: handOverBy || null,
      returnDate: null,
      returnBy: null
    });

    await product.save();

    // Sync Employee.assets
    await Employee.updateOne(
      { _id: employeeId },
      { $addToSet: { assets: product._id } }
    );

    // Inventory updates
    let inventory = await Inventory.findOne({ type: product.type });
    if (!inventory) {
      inventory = new Inventory({
        type: product.type,
        quantity: 0,
        usedQuantity: 0,
        unUseableQuantity: 0,
        underMaintenanceQuantity: 0,
        history: [],
        products: []
      });
    }

    // Ensure ref list contains product
    if (!inventory.products?.some(pId => pId.toString() === product._id.toString())) {
      inventory.products.push(product._id);
    }

    // If it was AVAILABLE → ASSIGNED: used += 1
    // (We already blocked MAINTENANCE/UNUSABLE above)
    inventory.usedQuantity = Math.max(0, (inventory.usedQuantity || 0) + 1);

    // Add inventory history entry
    inventory.history.push({
      action: "DISBURST",
      quantity: 1,
      timestamp: Time.toJSDate(Time.now()),
      user: handOverBy && mongoose.Types.ObjectId.isValid(handOverBy) ? handOverBy : undefined
    });

    await inventory.save();

    // Populate for response
    await product.populate([
      { path: "type", select: "name description" },
      { path: "currentOwner", select: "firstName lastName email role" },
      { path: "history.employeeId", select: "firstName lastName email" },
      { path: "history.handOverBy", select: "firstName lastName email" }
    ]);

    return res.status(200).json({
      success: true,
      message: "Product handed over successfully",
      data: product
    });
  } catch (error) {
    console.error("❌ Hand over product error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Return product from employee
async function returnProduct(req, res) {
  try {
    const { id } = req.params;
    const { returnBy } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    if (returnBy && !mongoose.Types.ObjectId.isValid(returnBy)) {
      return res.status(400).json({ error: "Invalid returnBy ID" });
    }

    // Load product
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Must be assigned to return
    if (product.status !== "ASSIGNED" || !product.currentOwner) {
      return res.status(400).json({ error: "Product is not currently assigned to an employee" });
    }

    const prevOwnerId = product.currentOwner.toString();

    // Close the latest open history entry (if present)
    const last = product.history?.[product.history.length - 1];
    if (last && !last.returnDate) {
      last.returnDate = Time.toJSDate(Time.now());
      last.returnBy = returnBy || null;
    } else {
      // If no open history entry exists, append a minimal return entry to keep audit consistent
      product.history.push({
        employeeId: product.currentOwner,
        handoverDate: null,
        returnDate: Time.toJSDate(Time.now()),
        handOverBy: null,
        returnBy: returnBy || null
      });
    }

    // Update product state
    product.currentOwner = null;
    product.status = "AVAILABLE";
    await product.save();

    // Remove from employee.assets (safety even if duplicate calls)
    await Employee.updateOne(
      { _id: prevOwnerId },
      { $pull: { assets: product._id } }
    );

    // Inventory adjustments
    let inventory = await Inventory.findOne({ type: product.type });
    if (!inventory) {
      inventory = new Inventory({
        type: product.type,
        quantity: 0,
        usedQuantity: 0,
        unUseableQuantity: 0,
        underMaintenanceQuantity: 0,
        history: [],
        products: []
      });
    }

    // Ensure product ref list contains this product (optional safety)
    if (!inventory.products?.some(pId => pId.toString() === product._id.toString())) {
      inventory.products.push(product._id);
    }

    // ASSIGNED -> AVAILABLE : usedQuantity -= 1
    inventory.usedQuantity = Math.max(0, (inventory.usedQuantity || 0) - 1);

    // Inventory RETURN history
    inventory.history.push({
      action: "RETURN", // your enum: ["IN","RETURN","DISBURST","DELETED"]
      quantity: 1,
      timestamp: Time.toJSDate(Time.now()),
      user: returnBy && mongoose.Types.ObjectId.isValid(returnBy) ? returnBy : undefined
    });

    await inventory.save();

    // Populate for response
    await product.populate([
      { path: "type", select: "name description" },
      { path: "history.employeeId", select: "firstName lastName email" },
      { path: "history.handOverBy", select: "firstName lastName email" },
      { path: "history.returnBy", select: "firstName lastName email" }
    ]);

    return res.status(200).json({
      success: true,
      message: "Product returned successfully",
      data: product
    });
  } catch (error) {
    console.error("❌ Return product error:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Get product history
async function getProductHistory(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await Product.findById(id)
      .populate('history.employeeId', 'firstName lastName email role')
      .populate('history.handOverBy', 'firstName lastName email')
      .populate('history.returnBy', 'firstName lastName email')
      .select('productId name history createdAt')
      .lean(); // ⚡ faster, returns POJOs

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Safely sort by event date: handoverDate > returnDate > product.createdAt
    const sortedHistory = (product.history || [])
      .map(h => ({
        ...h,
        eventDate: h.handoverDate || h.returnDate || product.createdAt
      }))
      .sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate))
      .map(({ eventDate, ...rest }) => rest); // strip helper

    return res.status(200).json({
      success: true,
      data: {
        productId: product.productId,
        productName: product.name,
        history: sortedHistory
      }
    });
  } catch (error) {
    console.error("❌ Get product history error:", error);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createProduct,
  createBulkProducts,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  handOverProduct,
  returnProduct,
  getProductHistory
};
