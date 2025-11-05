const Category = require('../model/categorySchema');
const mongoose = require('mongoose')

// Create a new category
const createCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ success: false, message: 'Category with this name already exists' });
    }

    const newCategory = new Category({
      name,
      description,
      status: status || 'Active',
    });

    await newCategory.save();
    res.status(201).json({ success: true, message: 'Category created successfully', category: newCategory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get all categories
const getAllCategories = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '' } = req.query;

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

    // Sorting by name in ascending order (A-Z)
    const sort = { name: 1 }; // 1 means ascending order

    // Pagination
    const skip = (page - 1) * limit;
    const categories = await Category.find(query)  // Find categories based on the query
      .sort(sort)                                 // Always sort by name (A-Z)
      .skip(skip)                                 // Skip based on the page
      .limit(Number(limit));                      // Limit the number of results per page

    const totalCategories = await Category.countDocuments(query); // Get the total number of matching categories

    // Calculate the total number of pages
    const totalPages = Math.ceil(totalCategories / limit);

    // Send the response with pagination format
    res.status(200).json({
      success: true,
      data: categories,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalCount: totalCategories,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};


// Get category by ID
const getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }
    const category = await Category.findById(categoryId);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.status(200).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update category by ID
const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const updatedData = req.body;

    if (updatedData.name) {
      const existingCategory = await Category.findOne({ name: updatedData.name, _id: { $ne: categoryId } });
      if (existingCategory) {
        return res.status(400).json({ success: false, message: 'Category with this name already exists' });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(categoryId, updatedData, { new: true });

    if (!updatedCategory) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.status(200).json({ success: true, message: 'Category updated successfully', category: updatedCategory });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Delete category by ID
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ success: false, message: 'Invalid category ID' });
    }

    const category = await Category.findByIdAndDelete(categoryId);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
