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

module.exports = router;
