const express = require("express");
const Router = express.Router();

const {
    createVendor,
    getAllVendors,
    getVendorById,
    updateVendor,
    deleteVendor
} = require('../controller/vendorController');

Router.post('/', createVendor);
Router.get('/', getAllVendors);
Router.get('/:id', getVendorById);
Router.put('/:id', updateVendor);
Router.delete('/:id', deleteVendor);

module.exports = Router;
