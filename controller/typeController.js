const Type = require('../model/typeSchema');
const mongoose = require('mongoose');

// Create a new type
const createType = async (req, res) => {
  try {
    const { name, logo, categoryId, description, status, trackingMode } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existingType = await Type.findOne({ name });
    if (existingType) {
      return res.status(400).json({ success: false, message: 'Type with this name already exists' });
    }

    const newType = new Type({
      name,
      logo,
      description,
      categoryId: categoryId || null,
      status: status || 'Active',
      trackingMode: trackingMode || 'ASSET',
    });

    await newType.save();
    res.status(201).json({ success: true, message: 'Type created successfully', type: newType });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get all types
const getAllTypes = async (req, res) => {
  try {
    // Extract query parameters: page, limit, search, and status
    const { page = 1, limit = 10, categoryId, search = '', status = '' } = req.query;

    // Build the query object based on the search and status filters
    const query = {};

    // Search by name (case-insensitive)
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    // Filter by status (if provided)
    if (status) {
      query.status = status;
    }

    // Filter by categoryId (if provided)
    if (categoryId) {
      query.categoryId = { $in: [categoryId, null] };
    }

    // Sorting by name in ascending order (A-Z)
    const sort = { name: 1 }; // 1 means ascending order

    // Pagination calculation
    const skip = (page - 1) * limit;

    // Fetch the categories with filters, pagination, and sorting
    const Types = await Type.find(query)
      .populate('categoryId', 'name') // Populate categoryId with name
      .sort(sort)                   // Always sort by name (A-Z)
      .skip(skip)                   // Skip the number of items based on page
      .limit(Number(limit));        // Limit the number of items per page

    // Get the total number of matching  types
    const totalTypes = await Type.countDocuments(query);

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalTypes / limit);

    // Send the response with pagination format
    res.status(200).json({
      success: true,
      data: Types,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalCount: totalTypes,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};


// Get type by ID
const getTypeById = async (req, res) => {
  try {
    const typeId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(typeId)) {
      return res.status(400).json({ success: false, message: 'Invalid Type ID' });
    }

    const type = await Type.findById(typeId).populate('categoryId', 'name');

    if (!type) {
      return res.status(404).json({ success: false, message: 'Type not found' });
    }

    res.status(200).json({ success: true, data: type });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update type by ID
const updateType = async (req, res) => {
  try {
    const typeId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(typeId)) {
      return res.status(400).json({ success: false, message: 'Invalid Type ID' });
    }

    const updatedData = req.body;

    if (updatedData.name) {
      const existingType = await Type.findOne({ name: updatedData.name, _id: { $ne: typeId } });
      if (existingType) {
        return res.status(400).json({ success: false, message: 'Type with this name already exists' });
      }
    }

    const updatedType = await Type.findByIdAndUpdate(typeId, updatedData, { new: true });

    if (!updatedType) {
      return res.status(404).json({ success: false, message: 'Type not found' });
    }

    res.status(200).json({ success: true, message: 'Type updated successfully', type: updatedType });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Delete type by ID
const deleteType = async (req, res) => {
  try {
    const typeId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(typeId)) {
      return res.status(400).json({ success: false, message: 'Invalid Type ID' });
    }

    const type = await Type.findByIdAndDelete(typeId);

    if (!type) {
      return res.status(404).json({ success: false, message: 'Type not found' });
    }

    res.status(200).json({ success: true, message: 'Type deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  createType,
  getAllTypes,
  getTypeById,
  updateType,
  deleteType,
};
