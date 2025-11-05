const Vendor = require('../model/vendorSchema');
const mongoose = require('mongoose');

// Create a new vendor
const createVendor = async (req, res) => {
    try {
        const { name, logo, contactPerson, contactEmail, contactPhone, address, website, status, documents } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        const newVendor = new Vendor({
            name,
            logo,
            contactPerson,
            contactEmail,
            contactPhone,
            address,
            website,
            status: status || 'Active',
            documents: documents || [],
        });

        await newVendor.save();
        res.status(201).json({ success: true, message: 'Vendor created successfully', data: newVendor });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get all vendors
const getAllVendors = async (req, res) => {
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
        const vendors = await Vendor.find(query)  // Find vendors based on the query
            .sort(sort)                             // Always sort by name (A-Z)
            .skip(skip)                             // Skip based on the page
            .limit(Number(limit));                  // Limit the number of results per page

        const totalVendors = await Vendor.countDocuments(query); // Get the total number of matching vendors

        // Calculate the total number of pages
        const totalPages = Math.ceil(totalVendors / limit);

        // Send the response with pagination format
        res.status(200).json({
            success: true,
            data: vendors,
            pagination: {
                currentPage: parseInt(page),
                totalPages: totalPages,
                totalCount: totalVendors,
                limit: parseInt(limit),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};



// Get vendor by ID
const getVendorById = async (req, res) => {
    try {
        const vendorId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(vendorId)) {
            return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
        }
        const vendor = await Vendor.findById(vendorId);

        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        res.status(200).json({ success: true, data: vendor });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update vendor by ID
const updateVendor = async (req, res) => {
    try {
        const vendorId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(vendorId)) {
            return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
        }
        const updatedData = req.body;

        const updatedVendor = await Vendor.findByIdAndUpdate(vendorId, updatedData, { new: true });

        if (!updatedVendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        res.status(200).json({ success: true, message: 'Vendor updated successfully', data: updatedVendor });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Delete vendor by ID
const deleteVendor = async (req, res) => {
    try {
        const vendorId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(vendorId)) {
            return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
        }

        const vendor = await Vendor.findByIdAndDelete(vendorId);

        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }

        res.status(200).json({ success: true, message: 'Vendor deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

module.exports = {
    createVendor,
    getAllVendors,
    getVendorById,
    updateVendor,
    deleteVendor,
};
