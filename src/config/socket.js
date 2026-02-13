const socketIO = require('socket.io');

let io;

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Join a game room
        socket.on('join-game', (gameId) => {
            socket.join(`game-${gameId}`);
            console.log(`Client ${socket.id} joined game ${gameId}`);
        });

        // Leave a game room
        socket.on('leave-game', (gameId) => {
            socket.leave(`game-${gameId}`);
            console.log(`Client ${socket.id} left game ${gameId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

// Emit game update to all clients in a game room
const emitGameUpdate = (gameId, data) => {
    if (io) {
        io.to(`game-${gameId}`).emit('game-update', data);
    }
};

module.exports = {
    initializeSocket,
    getIO,
    emitGameUpdate,
};
