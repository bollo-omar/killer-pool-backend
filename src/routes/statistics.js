const express = require('express');
const router = express.Router();
const Game = require('../models/Game');
const GameStateCache = require('../models/GameStateCache');
const Event = require('../models/Event');

// Get player statistics
router.get('/players/:id', async (req, res) => {
    try {
        const playerId = req.params.id;

        // Find all games with this player
        const games = await Game.find({
            'players.playerId': playerId,
            status: 'ENDED',
        });

        if (games.length === 0) {
            return res.json({
                playerId,
                gamesPlayed: 0,
                wins: 0,
                winRate: 0,
                averageScore: 0,
                bestScore: 0,
                worstScore: 0,
                totalPoints: 0,
            });
        }

        let wins = 0;
        let totalScore = 0;
        let bestScore = -Infinity;
        let worstScore = Infinity;

        // Calculate statistics
        for (const game of games) {
            // Check if player won
            if (game.winners.some(w => w.toString() === playerId)) {
                wins++;
            }

            // Get final score from game state cache
            const stateCache = await GameStateCache.findOne({ gameId: game._id });
            if (stateCache) {
                const playerScore = stateCache.scores.find(
                    s => s.playerId.toString() === playerId
                );
                if (playerScore) {
                    totalScore += playerScore.score;
                    bestScore = Math.max(bestScore, playerScore.score);
                    worstScore = Math.min(worstScore, playerScore.score);
                }
            }
        }

        res.json({
            playerId,
            gamesPlayed: games.length,
            wins,
            winRate: ((wins / games.length) * 100).toFixed(2),
            averageScore: (totalScore / games.length).toFixed(2),
            bestScore: bestScore === -Infinity ? 0 : bestScore,
            worstScore: worstScore === Infinity ? 0 : worstScore,
            totalPoints: totalScore,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get overall statistics
router.get('/overall', async (req, res) => {
    try {
        const totalGames = await Game.countDocuments({ status: 'ENDED' });
        const totalPlayers = await require('../models/Player').countDocuments({ archived: false });
        const activeGames = await Game.countDocuments({ status: 'ACTIVE' });

        // Get most recent games
        const recentGames = await Game.find({ status: 'ENDED' })
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate('players.playerId')
            .populate('winners');

        res.json({
            totalGames,
            totalPlayers,
            activeGames,
            recentGames,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
