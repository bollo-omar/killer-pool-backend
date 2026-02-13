const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['LOBBY', 'ACTIVE', 'ENDED'],
        default: 'LOBBY',
    },
    players: [{
        playerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Player',
            required: true,
        },
        nameSnapshot: String,
        turnOrder: {
            type: Number,
            required: true,
            min: 1,
        },
        droppedOut: {
            type: Boolean,
            default: false,
        },
    }],
    scorekeeper: {
        playerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Player',
            required: true,
        },
        nameSnapshot: {
            type: String,
            required: true,
        },
    },
    remainingBalls: {
        type: [Number],
        default: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 2], // Ordered sequence
    },
    remainingTotal: {
        type: Number,
        default: 156,
    },
    topScore: {
        type: Number,
        default: 0,
    },
    winners: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
    }],
    version: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Game', gameSchema);
