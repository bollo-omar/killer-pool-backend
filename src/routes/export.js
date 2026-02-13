const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const GameStateCache = require('../models/GameStateCache');
const Event = require('../models/Event');

// Export game as JSON
router.get('/games/:id/json', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id)
            .populate('players.playerId')
            .populate('winners');

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const stateCache = await GameStateCache.findOne({ gameId: game._id })
            .populate('scores.playerId');

        const events = await Event.find({ gameId: game._id })
            .sort({ createdAt: 1 });

        const exportData = {
            game: {
                id: game._id,
                status: game.status,
                createdAt: game.createdAt,
                updatedAt: game.updatedAt,
                players: game.players.map(p => ({
                    id: p.playerId._id,
                    name: p.playerId.name || p.nameSnapshot,
                    alias: p.playerId.alias,
                })),
                winners: game.winners.map(w => ({
                    id: w._id,
                    name: w.name,
                })),
            },
            finalScores: stateCache ? stateCache.scores.map(s => ({
                playerId: s.playerId._id,
                playerName: s.playerId.name,
                score: s.score,
                status: s.status,
                maxPossible: s.maxPossible,
            })) : [],
            events: events.map(e => ({
                type: e.type,
                timestamp: e.createdAt,
                payload: e.payload,
            })),
        };

        res.json(exportData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export game as CSV
router.get('/games/:id/csv', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id)
            .populate('players.playerId')
            .populate('winners');

        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }

        const stateCache = await GameStateCache.findOne({ gameId: game._id })
            .populate('scores.playerId');

        if (!stateCache) {
            return res.status(404).json({ error: 'Game state not found' });
        }

        // Create CSV content
        let csv = 'Player ID,Player Name,Score,Status,Max Possible\n';
        stateCache.scores.forEach(s => {
            csv += `${s.playerId._id},"${s.playerId.name}",${s.score},${s.status},${s.maxPossible}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="game-${game._id}.csv"`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
