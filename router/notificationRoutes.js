const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notificationController');

// Create notification
router.post('/', notificationController.createNotification);

// Get notifications for a user (with filters, pagination, sorting)
router.get('/user/:userId', notificationController.getUserNotifications);

// Mark a notification as read
router.patch('/:id/read', notificationController.markAsRead);

// Delete a notification
router.delete('/:id', notificationController.deleteNotification);

// Mark all notifications as read for a user
router.patch('/user/:userId/read-all', notificationController.markAllAsRead);

// Admin edit notification
router.put('/:id', notificationController.editNotification);

module.exports = router;
