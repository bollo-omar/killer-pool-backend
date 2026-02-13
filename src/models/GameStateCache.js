const mongoose = require('mongoose');

const gameStateCacheSchema = new mongoose.Schema({
    gameId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true,
        unique: true,
    },
    scores: [{
        playerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Player',
        },
        score: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'ELIMINATED'],
            default: 'ACTIVE',
        },
        maxPossible: Number,
        hitMax: {
            type: Boolean,
            default: false,
        },
    }],
    remainingBalls: [Number],
    remainingTotal: Number,
    topScore: Number,
    winners: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
    }],
    status: {
        type: String,
        enum: ['LOBBY', 'ACTIVE', 'ENDED'],
    },
    version: Number,
    isFirstBallPotted: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('GameStateCache', gameStateCacheSchema);
