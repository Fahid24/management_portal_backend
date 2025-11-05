const express = require('express');
const router = express.Router();
const {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getSingleEvent,
  getEventsByMonth,
} = require('../controller/eventController');

// GET /api/events/monthly
router.get('/monthly', getEventsByMonth);

// GET /api/events
router.get('/', getEvents);

// POST /api/events
router.post('/', createEvent);

// PUT /api/events/:id
router.put('/:id', updateEvent);

// DELETE /api/events/:id
router.delete('/:id', deleteEvent);

// GET /api/events/:id
router.get('/:id', getSingleEvent);

module.exports = router;