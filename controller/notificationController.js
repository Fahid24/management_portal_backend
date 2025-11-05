const Notification = require('../model/notificationSchema');
const { sendNotificationToUsers } = require('../utils/sendNotificationToUsers');
const Time = require('../utils/time');

// Create a new notification (for specific users and/or departments)
exports.createNotification = async (req, res) => {
  try {
    const { userIds, departmentIds, type, title, message, data } = req.body;
    await sendNotificationToUsers({ userIds, departmentIds, type, title, message, data });
    res.status(201).json({ message: 'Notification sent successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get notifications for a user (with filters, pagination, sorting)
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isRead, type, page = 1, limit = 10, sort = '-createdAt' } = req.query;
    const filter = { userId: userId };
    if (type) filter.type = type;

    // Apply isRead filter in MongoDB query
    if (isRead === 'true') {
      filter['readBy.user'] = userId;
    } else if (isRead === 'false') {
      filter['readBy.user'] = { $ne: userId };
    }

    const notifications = await Notification.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Notification.countDocuments(filter);

    res.json({ notifications, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark a notification as read (per user, with read time)
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const notification = await Notification.findById(id);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (!notification.readBy) notification.readBy = [];
    // Check if user already marked as read
    const alreadyRead = notification.readBy.find(r => r.user.toString() === userId);
    if (!alreadyRead) {
      notification.readBy.push({ user: userId, readAt: Time.toJSDate(Time.now()) });
      await notification.save();
    }
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndDelete(id);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Mark all notifications as read for a user (with read time)
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await Notification.find({ userId: userId });
    for (const notification of notifications) {
      if (!notification.readBy) notification.readBy = [];
      const alreadyRead = notification.readBy.find(r => r.user.toString() === userId);
      if (!alreadyRead) {
        notification.readBy.push({ user: userId, readAt: Time.toJSDate(Time.now()) });
        await notification.save();
      }
    }
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Admin can edit a notification
exports.editNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const notification = await Notification.findByIdAndUpdate(id, update, { new: true });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
