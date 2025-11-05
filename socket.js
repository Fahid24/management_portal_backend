// Socket.io server setup
const { Server } = require('socket.io');

let ioInstance;

function setupSocket(server) {
  ioInstance = new Server(server, {
    cors: {
      origin: 'http://localhost:5173', // Set to your frontend URL
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  ioInstance.on('connection', (socket) => {
    // console.log('A user connected:', socket.id);

    // Listen for join event to add user to their room
    socket.on('join', (userId) => {
      socket.join(userId);
      // console.log(`User ${userId} joined their room`);
    });

    // Example event
    socket.on('message', (data) => {
      // console.log('Received message:', data);
      // Broadcast to all clients
      ioInstance.emit('message', data);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized!');
  }
  return ioInstance;
}

module.exports = { setupSocket, getIO };
