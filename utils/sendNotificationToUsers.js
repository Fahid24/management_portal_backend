const Notification = require('../model/notificationSchema');
const Employee = require('../model/employeeSchema');
const { getIO } = require('../socket');
const Time = require('../utils/time');

/**
 * @param {Object} params
 * @param {String[]} [params.userIds] 
 * @param {String[]} [params.departmentIds] 
 * @param {String} params.type 
 * @param {String} params.title 
 * @param {String} params.message 
 * @param {Object} [params.data] 
 */
async function sendNotificationToUsers({ userIds = [], departmentIds = [], type, title, message, data }) {
  let finalUserIds = Array.isArray(userIds) ? [...userIds] : [];

  if (departmentIds.length > 0 && finalUserIds.length === 0) {
    const users = await Employee.find({ department: { $in: departmentIds } }, '_id');
    finalUserIds = users.map(u => u._id.toString());
  }

  const notification = new Notification({
    userId: finalUserIds,
    departmentId: departmentIds,
    type,
    title,
    message,
    data,
    createdAt: Time.toJSDate(Time.now())
  });
  await notification.save();

  // Emit notification to each user via socket.io
  try {
    const io = getIO();
    finalUserIds.forEach(userId => {
      io.to(userId).emit('notification', {
        type,
        title,
        message,
        data,
        notificationId: notification._id,
      });
    });
  } catch (err) {
    console.error('Socket.io emit error:', err.message);
  }
}

module.exports = { sendNotificationToUsers };
