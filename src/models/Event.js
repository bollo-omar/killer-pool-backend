const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    gameId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['BALL_POTTED', 'GAME_STARTED', 'WHITE_BALL_POTTED', 'FOUL_COMMITTED', 'GAME_ENDED', 'GAME_CLINCHED', 'UNDO'],
        required: true,
    },
    payload: {
        // For BALL_POTTED
        ballNumber: Number,
        ballValue: Number,
        playerId: mongoose.Schema.Types.ObjectId,
        scoreEffect: Number, // +1 or -1
        scoreDelta: Number,
        outOfOrder: Boolean, // true if ball was not the active ball

        // For WHITE_BALL_POTTED and FOUL_COMMITTED
        penalty: Number, // Penalty amount

        // For GAME_CLINCHED
        topScore: Number,
        bestChallengerMax: Number,
        remainingBalls: [Number],
    },
    createdByUserId: {
        type: String,
        default: 'operator',
    },
}, {
    timestamps: true,
});

// Index for efficient querying
eventSchema.index({ gameId: 1, createdAt: 1 });

module.exports = mongoose.model('Event', eventSchema);
