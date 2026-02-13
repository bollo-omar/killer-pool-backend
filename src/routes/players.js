const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

// Get all players (excluding archived by default)
router.get('/', async (req, res) => {
    try {
        const includeArchived = req.query.includeArchived === 'true';
        const filter = includeArchived ? {} : { archived: false };
        const players = await Player.find(filter).sort({ name: 1 });
        res.json(players);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new player
router.post('/', async (req, res) => {
    try {
        const { name, alias } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const player = new Player({ name: name.trim(), alias: alias?.trim() });
        await player.save();
        res.status(201).json(player);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a player
router.patch('/:id', async (req, res) => {
    try {
        const { name, alias } = req.body;
        const updateData = {};

        if (name !== undefined) updateData.name = name.trim();
        if (alias !== undefined) updateData.alias = alias.trim();

        const player = await Player.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }

        res.json(player);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Archive a player
router.post('/:id/archive', async (req, res) => {
    try {
        const player = await Player.findByIdAndUpdate(
            req.params.id,
            { archived: true },
            { new: true }
        );

        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }

        res.json(player);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get player win statistics
router.get('/:id/wins', async (req, res) => {
    try {
        const Game = require('../models/Game');
        const GameStateCache = require('../models/GameStateCache');
        const playerId = req.params.id;

        // Find all ended games where player participated
        const games = await Game.find({
            'players.playerId': playerId,
            status: 'ENDED'
        }).sort({ createdAt: -1 });

        // Get game states to determine wins
        const gameIds = games.map(g => g.id);
        const gameStates = await GameStateCache.find({
            gameId: { $in: gameIds }
        });

        // Calculate wins
        let totalWins = 0;
        const recentWins = [];

        for (const game of games) {
            const state = gameStates.find(s => s.gameId.toString() === game.id);
            if (state) {
                // Find player's score
                const playerScore = state.scores.find(s =>
                    s.playerId.toString() === playerId
                );

                // Check if player won (highest score)
                if (playerScore) {
                    const maxScore = Math.max(...state.scores.map(s => s.score));
                    if (playerScore.score === maxScore && playerScore.score > 0) {
                        totalWins++;
                        if (recentWins.length < 10) {
                            recentWins.push({
                                gameId: game.id,
                                score: playerScore.score,
                                date: game.createdAt,
                                players: game.players.length
                            });
                        }
                    }
                }
            }
        }

        const totalGames = games.length;
        const winPercentage = totalGames > 0 ? (totalWins / totalGames * 100).toFixed(1) : 0;

        res.json({
            playerId,
            totalGames,
            totalWins,
            winPercentage: parseFloat(winPercentage),
            recentWins
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
