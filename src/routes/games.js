const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const Event = require('../models/Event');
const GameStateCache = require('../models/GameStateCache');
const Player = require('../models/Player');
const {
    getBallValue,
    BALL_SEQUENCE,
    getActiveBall,
    rebuildStateFromEvents,
    applyEvent
} = require('../engine/gameEngine');

// Get all games (history)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status; // Filter by status

        const filter = {};
        if (status) {
            filter.status = status;
        }

        const games = await Game.find(filter)
            .populate('players.playerId')
            .populate('winners')
            .sort({ updatedAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit);

        const total = await Game.countDocuments(filter);

        res.json({
            games,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new game (lobby)
router.post('/', async (req, res) => {
    try {
        const { playerIds } = req.body;

        if (!playerIds || playerIds.length < 3) {
            return res.status(400).json({ error: 'Minimum 3 players required' });
        }

        // Fetch player details
        const players = await Player.find({ _id: { $in: playerIds } });

        if (players.length !== playerIds.length) {
            return res.status(400).json({ error: 'One or more players not found' });
        }

        const game = new Game({
            status: 'LOBBY',
            players: players.map(p => ({
                playerId: p._id,
                nameSnapshot: p.name,
            })),
        });

        await game.save();
        res.status(201).json(game);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start a game
router.post('/:id/start', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.status !== 'LOBBY') {
            return res.status(400).json({ error: 'Game already started' });
        }

        game.status = 'ACTIVE';
        await game.save();

        // Create GAME_STARTED event
        const event = new Event({
            gameId: game._id,
            type: 'GAME_STARTED',
            payload: {},
        });
        await event.save();

        // Initialize game state cache
        const stateCache = new GameStateCache({
            gameId: game._id,
            scores: game.players.map(p => ({
                playerId: p.playerId,
                score: 0,
                status: 'ACTIVE',
                maxPossible: 156,
                hitMax: false,
            })),
            remainingBalls: [...BALL_SEQUENCE],
            remainingTotal: 156,
            topScore: 0,
            winners: [],
            status: 'ACTIVE',
            version: game.version,
            isFirstBallPotted: false,
        });
        await stateCache.save();

        res.json(game);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get game details with scoreboard
router.get('/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id).populate('players.playerId');

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Get cached state
        const stateCache = await GameStateCache.findOne({ gameId: game._id })
            .populate('scores.playerId');

        const activeBall = stateCache ? getActiveBall(stateCache.remainingBalls) : null;

        res.json({
            game,
            state: stateCache,
            activeBall,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get game events
router.get('/:id/events', async (req, res) => {
    try {
        const events = await Event.find({ gameId: req.params.id })
            .sort({ createdAt: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Record a pot
router.post('/:id/pot', async (req, res) => {
    try {
        const { playerId, ballNumber, scoreEffect } = req.body;

        // Validation
        if (!playerId || ballNumber === undefined || !scoreEffect) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (![1, -1].includes(scoreEffect)) {
            return res.status(400).json({ error: 'scoreEffect must be +1 or -1' });
        }

        if (ballNumber < 0 || ballNumber > 15) {
            return res.status(400).json({ error: 'ballNumber must be between 0 and 15' });
        }

        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Game is not active' });
        }

        // Get current state
        const stateCache = await GameStateCache.findOne({ gameId: game._id });

        if (!stateCache) {
            return res.status(500).json({ error: 'Game state not found' });
        }

        // Handle white ball (0) separately
        if (ballNumber === 0) {
            const { calculateWhiteBallPenalty } = require('../engine/gameEngine');
            const penalty = calculateWhiteBallPenalty(stateCache.toObject());

            const event = new Event({
                gameId: game._id,
                type: 'WHITE_BALL_POTTED',
                payload: { playerId, ballNumber: 0, penalty },
            });
            await event.save();

            const newState = applyEvent(stateCache.toObject(), event);
            await GameStateCache.findOneAndUpdate({ gameId: game._id }, newState, { new: true });

            const { emitGameUpdate } = require('../config/socket');
            emitGameUpdate(game._id.toString(), { type: 'white-ball-potted', state: newState });

            const populatedState = await GameStateCache.findOne({ gameId: game._id }).populate('scores.playerId');
            return res.json({
                message: penalty > 0 ? `White ball potted - penalty: ${penalty}` : 'White ball potted - no penalty',
                state: populatedState,
                activeBall: getActiveBall(newState.remainingBalls),
            });
        }

        // Check if ball is remaining
        if (!stateCache.remainingBalls.includes(ballNumber)) {
            return res.status(400).json({ error: 'Ball already potted' });
        }

        // Check if player is in the game
        const playerInGame = game.players.find(p => p.playerId.toString() === playerId);
        if (!playerInGame) {
            return res.status(400).json({ error: 'Player not in this game' });
        }

        // Determine if out of order
        const activeBall = getActiveBall(stateCache.remainingBalls);
        const outOfOrder = ballNumber !== activeBall;

        // Calculate ball value and delta
        const ballValue = getBallValue(ballNumber);
        const scoreDelta = ballValue * scoreEffect;

        // Create event
        const event = new Event({
            gameId: game._id,
            type: 'BALL_POTTED',
            payload: {
                ballNumber,
                ballValue,
                playerId,
                scoreEffect,
                scoreDelta,
                outOfOrder,
            },
        });
        await event.save();

        // Apply event to state
        const newState = applyEvent(stateCache.toObject(), event);

        // Update state cache
        await GameStateCache.findOneAndUpdate(
            { gameId: game._id },
            newState,
            { new: true }
        );

        // If game ended, update game document
        if (newState.status === 'ENDED') {
            game.status = 'ENDED';
            game.winners = newState.winners;
            await game.save();

            // Create GAME_ENDED or GAME_CLINCHED event
            const endEvent = new Event({
                gameId: game._id,
                type: 'GAME_CLINCHED',
                payload: {
                    topScore: newState.topScore,
                    bestChallengerMax: Math.max(
                        ...newState.scores
                            .filter(s => s.score < newState.topScore)
                            .map(s => s.maxPossible)
                    ),
                    remainingBalls: newState.remainingBalls,
                },
            });
            await endEvent.save();
        }

        // Emit real-time update via WebSocket
        const { emitGameUpdate } = require('../config/socket');
        emitGameUpdate(game._id.toString(), {
            type: 'pot-recorded',
            state: newState,
            activeBall: getActiveBall(newState.remainingBalls),
        });

        // Populate player data before returning
        const populatedState = await GameStateCache.findOne({ gameId: game._id })
            .populate('scores.playerId');

        res.json({
            message: 'Pot recorded',
            state: populatedState,
            activeBall: getActiveBall(newState.remainingBalls),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Record a foul
router.post('/:id/foul', async (req, res) => {
    try {
        const { playerId, ballNumber } = req.body;

        if (!playerId || ballNumber === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (ballNumber < 0 || ballNumber > 15) {
            return res.status(400).json({ error: 'ballNumber must be between 0 and 15' });
        }

        const game = await Game.findById(req.params.id);
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Game is not active' });
        }

        const stateCache = await GameStateCache.findOne({ gameId: game._id });
        if (!stateCache) {
            return res.status(500).json({ error: 'Game state not found' });
        }

        // Calculate penalty based on ball value
        const penalty = getBallValue(ballNumber);

        // Create FOUL_COMMITTED event
        const event = new Event({
            gameId: game._id,
            type: 'FOUL_COMMITTED',
            payload: { playerId, ballNumber, penalty },
        });
        await event.save();

        // Apply event to state
        const newState = applyEvent(stateCache.toObject(), event);
        await GameStateCache.findOneAndUpdate({ gameId: game._id }, newState, { new: true });

        // Emit real-time update
        const { emitGameUpdate } = require('../config/socket');
        emitGameUpdate(game._id.toString(), { type: 'foul-committed', state: newState });

        // Populate player data
        const populatedState = await GameStateCache.findOne({ gameId: game._id }).populate('scores.playerId');

        res.json({
            message: `Foul committed - penalty: ${penalty}`,
            state: populatedState,
            activeBall: getActiveBall(newState.remainingBalls),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Undo last event
router.post('/:id/undo', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        // Get all events for this game
        const events = await Event.find({ gameId: game._id })
            .sort({ createdAt: 1 });

        if (events.length === 0) {
            return res.status(400).json({ error: 'No events to undo' });
        }

        // Remove the last event
        const lastEvent = events[events.length - 1];
        await Event.findByIdAndDelete(lastEvent._id);

        // Rebuild state from remaining events
        const remainingEvents = events.slice(0, -1);
        const newState = rebuildStateFromEvents(game, remainingEvents);

        // Update state cache
        await GameStateCache.findOneAndUpdate(
            { gameId: game._id },
            newState,
            { new: true }
        );

        // Update game status if needed
        game.status = newState.status;
        game.winners = newState.winners;
        await game.save();

        // Populate player data before returning
        const populatedState = await GameStateCache.findOne({ gameId: game._id })
            .populate('scores.playerId');

        res.json({
            message: 'Event undone',
            state: populatedState,
            activeBall: getActiveBall(newState.remainingBalls),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manually end game
router.post('/:id/end', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        if (game.status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Game is not active' });
        }

        // Get current state
        const stateCache = await GameStateCache.findOne({ gameId: game._id });

        if (!stateCache) {
            return res.status(500).json({ error: 'Game state not found' });
        }

        // Determine winners (players with top score)
        const topScore = stateCache.topScore;
        const winners = stateCache.scores
            .filter(s => s.score === topScore)
            .map(s => s.playerId);

        // Update game
        game.status = 'ENDED';
        game.winners = winners;
        await game.save();

        // Update state cache
        stateCache.status = 'ENDED';
        stateCache.winners = winners;
        await stateCache.save();

        // Create GAME_ENDED event
        const event = new Event({
            gameId: game._id,
            type: 'GAME_ENDED',
            payload: {
                reason: 'MANUAL',
                topScore: topScore,
                winners: winners,
            },
        });
        await event.save();

        // Emit real-time update via WebSocket
        const { emitGameUpdate } = require('../config/socket');
        emitGameUpdate(game._id.toString(), {
            type: 'game-ended',
            state: stateCache,
        });

        res.json({
            message: 'Game ended',
            game,
            state: stateCache,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
