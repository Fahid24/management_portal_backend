const express = require('express');
const router = express.Router();
const {
  createProduct,
  createBulkProducts,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  handOverProduct,
  returnProduct,
  getProductHistory
} = require('../controller/productController');

// Product management routes
router.post('/handover/:id', handOverProduct);      // Hand over product to employee
router.post('/return/:id', returnProduct);          // Return product from employee
router.get('/history/:id', getProductHistory);      // Get product handover history
router.post('/bulk', createBulkProducts);           // Create products in bulk

// Basic CRUD routes
router.post('/', createProduct);                    // Create product
router.get('/', getProducts);                       // Get all products with filters
router.get('/:id', getProductById);                 // Get single product by ID
router.put('/:id', updateProduct);                  // Update product
router.delete('/:id', deleteProduct);               // Delete product

module.exports = router;
