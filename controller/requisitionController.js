const Requisition = require('../model/requisitionSchema');
const mongoose = require('mongoose');
const Time = require('../utils/time');

// Create a new requisition
const createRequisition = async (req, res) => {
  try {
    const { requisitionTitle, description, items, requestedBy, documents } = req.body;
    if (!requisitionTitle) {
      return res.status(400).json({ success: false, message: 'Requisition title is required' });
    }

    if (!requestedBy) {
      return res.status(400).json({ success: false, message: 'Requested by is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(requestedBy)) {
      return res.status(400).json({ success: false, message: 'Invalid requested by ID' });
    }
    const uniqueTypes = [];
    // Validate each item
    for (const item of items) {
      if(item.type && uniqueTypes.includes(item.type.toString())) {
        return res.status(400).json({ success: false, message: `Duplicate item type found: ${item.type}` });
      }
      if (!item.quantityRequested || item.quantityRequested <= 0) {
        return res.status(400).json({ success: false, message: `Valid quantity requested is required for every item` });
      }
      if (!item.vendor) {
        return res.status(400).json({ success: false, message: `Vendor is required for every item` });
      }
      if (!item.type) {
        return res.status(400).json({ success: false, message: `Type is required for every item` });
      }
      uniqueTypes.push(item.type.toString());
    }

    // Calculate totals
    let totalQuantityRequested = 0;
    let totalEstimatedCost = 0;
    const itemsWithDefaults = (items || []).map(item => {
      totalQuantityRequested += item.quantityRequested || 0;
      totalEstimatedCost += item.estimatedCost || 0;
      return {
        ...item,
        quantityApproved: 0,
        approvedCost: 0,
        documents: item.documents || [],
      };
    });

    const newRequisition = new Requisition({
      requisitionTitle,
      description,
      items: itemsWithDefaults,
      requestedBy,
      documents: documents || [],
      totalQuantityRequested,
      totalEstimatedCost,
      totalQuantityApproved: 0,
      totalApprovedCost: 0,
      status: 'Requested',
    });

    await newRequisition.save();
    res.status(201).json({ success: true, message: 'Requisition created successfully', data: newRequisition });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get all requisitions
const getAllRequisitions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search = '' } = req.query;

    // Initialize the filters object
    const filters = {};

    // Apply the status filter if provided
    if (status) {
      filters.status = status;
    }

    // Search filters
    if(search){
      filters.$or = [
        { requisitionTitle: { $regex: search, $options: 'i' } },
        { requisitionID: { $regex: search, $options: 'i' } },
      ];
    }

    // Sorting by createdAt in descending order
    const sort = { createdAt: -1 }; // -1 means descending order

    // Pagination
    const skip = (page - 1) * limit;

    // Apply the search filters to the query
    const requisitions = await Requisition.find(filters)
      .populate({
        path: "requestedBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate({
        path: "actionBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate("items.vendor", "name")
      .populate("items.approvedVendor", "name")
      .populate("items.type", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Count the total number of requisitions matching the filters for pagination
    const totalRequisitions = await Requisition.countDocuments(filters);
    const totalPages = Math.ceil(totalRequisitions / limit);

    res.status(200).json({
      success: true,
      data: requisitions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRequisitions,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get requisition by ID
const getRequisitionById = async (req, res) => {
  try {
    const requisitionId = req.params.id;
    const requisition = await Requisition.findById(requisitionId)
      .populate({
        path: "requestedBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate({
        path: "actionBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate("items.vendor", "name")
      .populate("items.approvedVendor", "name")
      .populate("items.type", "name");

    if (!requisition) {
      return res.status(404).json({ success: false, message: 'Requisition not found' });
    }

    res.status(200).json({ success: true, data: requisition });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update requisition by ID
const updateRequisition = async (req, res) => {
  try {
    const requisitionId = req.params.id;
    const updatedData = req.body;

    if (!mongoose.Types.ObjectId.isValid(requisitionId)) {
      return res.status(400).json({ success: false, message: 'Invalid requisition ID' });
    }

    // If items are being updated, recalculate totals
    if (updatedData.items) {
      if (!Array.isArray(updatedData.items) || updatedData.items.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one item is required' });
      }
      const uniqueTypes = [];
      let totalQuantityRequested = 0;
      let totalEstimatedCost = 0;
      let totalApprovedCost = 0;
      let totalQuantityApproved = 0;
      updatedData.items = updatedData.items.map(item => {
        if (!item.quantityRequested || item.quantityRequested <= 0) {
          return res.status(400).json({ success: false, message: `Valid quantity requested is required for every item` });
        }
        if (!item.vendor) {
          return res.status(400).json({ success: false, message: `Vendor is required for every item` });
        }
        if (!item.type) {
          return res.status(400).json({ success: false, message: `Type is required for every item` });
        }
        if (item.type && uniqueTypes.includes(item.type.toString())) {
          return res.status(400).json({ success: false, message: `Duplicate item type found: ${item.type}` });
        }
        uniqueTypes.push(item.type.toString());
        totalQuantityRequested += item.quantityRequested || 0;
        totalEstimatedCost += item.estimatedCost || 0;
        totalApprovedCost += item.approvedCost || 0;
        totalQuantityApproved += item.quantityApproved || 0;
        return {
          ...item,
          quantityApproved: item.quantityApproved || 0,
          approvedCost: item.approvedCost || 0,
          documents: item.documents || [],
        };
      });
      updatedData.totalQuantityRequested = totalQuantityRequested;
      updatedData.totalEstimatedCost = totalEstimatedCost;
      updatedData.totalApprovedCost = totalApprovedCost;
      updatedData.totalQuantityApproved = totalQuantityApproved;
    }

    const updatedRequisition = await Requisition.findByIdAndUpdate(requisitionId, updatedData, { new: true })
      .populate({
        path: 'requestedBy',
        select: 'firstName lastName email role photoUrl',
        populate: {
          path: 'department',
          select: 'name'
        }
      })
      .populate({
        path: 'actionBy',
        select: 'firstName lastName email role photoUrl',
        populate: {
          path: 'department',
          select: 'name'
        }
      })
      .populate('items.vendor', 'name')
      .populate("items.approvedVendor", "name")
      .populate('items.type', 'name');

    if (!updatedRequisition) {
      return res.status(404).json({ success: false, message: 'Requisition not found' });
    }

    res.status(200).json({ success: true, message: 'Requisition updated successfully', data: updatedRequisition });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Delete requisition by ID
const deleteRequisition = async (req, res) => {
  try {
    const requisitionId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(requisitionId)) {
      return res.status(400).json({ success: false, message: 'Invalid requisition ID' });
    }

    const requisition = await Requisition.findByIdAndDelete(requisitionId);

    if (!requisition) {
      return res.status(404).json({ success: false, message: 'Requisition not found' });
    }

    res.status(200).json({ success: true, message: 'Requisition deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Final approval for requisition
const requisitionAction = async (req, res) => {
  try {
    const requisitionId = req.params.id;
    const { actionBy, comments, action, items, documents } = req.body;

    const requisition = await Requisition.findById(requisitionId);

    if (!requisition) {
      return res.status(404).json({ success: false, message: 'Requisition not found' });
    }

    if(action === 'Rejected') {
      requisition.actionBy = actionBy;
      requisition.actionDate = Time.toJSDate(Time.now());
      requisition.comments = comments;
      requisition.status = 'Rejected';
      requisition.documents = documents;
    } else {
      // Update items using index instead of id
      items.forEach((item, idx) => {
        if (requisition.items[idx]) {
          requisition.items[idx].approvedVendor = item.vendor;
          requisition.items[idx].quantityApproved = item.quantityRequested;
          requisition.items[idx].approvedCost = item.estimatedCost;
          requisition.items[idx].documents = item.documents;
        }
      });
      requisition.actionBy = actionBy;
      requisition.actionDate = Time.toJSDate(Time.now());
      requisition.comments = comments;
      requisition.status = 'Approved';
      requisition.documents = documents;
      requisition.totalQuantityApproved = requisition.items.reduce((sum, item) => sum + (item.quantityApproved || 0), 0);
      requisition.totalApprovedCost = requisition.items.reduce((sum, item) => sum + (item.approvedCost || 0), 0);
    }

    await requisition.save();

    res.status(200).json({ success: true, message: 'Requisition final approval completed', requisition });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get By RequisistionID
const getByRequisitionID = async (req, res) => {
  try {
    const requisitionId = req.params.requisitionId;
    const requisition = await Requisition.findOne({ requisitionID: requisitionId })
      .populate({
        path: "requestedBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate({
        path: "actionBy",
        select: "firstName lastName email role photoUrl",
        populate: {
          path: "department",
          select: "name",
        },
      })
      .populate("items.vendor")
      .populate("items.approvedVendor")
      .populate("items.type");

    if (!requisition) {
      return res.status(404).json({ success: false, message: 'Requisition not found' });
    }

    res.status(200).json({ success: true, data: requisition });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  createRequisition,
  getAllRequisitions,
  getRequisitionById,
  updateRequisition,
  deleteRequisition,
  requisitionAction,
  getByRequisitionID,
};
