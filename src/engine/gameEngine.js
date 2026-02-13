/**
 * Ball scoring map - authoritative source of truth
 */
const getBallValue = (ballNumber) => {
    if (ballNumber === 0) return 0; // White ball
    if (ballNumber === 1) return 16;
    if (ballNumber === 2) return 17;
    if ([3, 4, 5, 6].includes(ballNumber)) return 6;
    return ballNumber; // 7-15 have their own value
};

/**
 * Ordered sequence of balls (Score ASC, Number ASC)
 * Note: White ball (0) is NOT in this sequence as it's never the "active" ball
 */
const BALL_SEQUENCE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 2];

/**
 * Maximum possible score in the game
 */
const MAX_TOTAL_SCORE = 156;

/**
 * Check if a ball is the white ball
 */
const isWhiteBall = (ballNumber) => ballNumber === 0;

/**
 * Calculate penalty for potting white ball
 * Returns 0 if no balls have been potted yet, otherwise returns active ball value
 */
const calculateWhiteBallPenalty = (state) => {
    if (!state.isFirstBallPotted) return 0;
    const activeBall = getActiveBall(state.remainingBalls);
    return activeBall ? getBallValue(activeBall) : 0;
};

/**
 * Get the active ball (next ball to be potted in sequence)
 */
const getActiveBall = (remainingBalls) => {
    for (const ball of BALL_SEQUENCE) {
        if (remainingBalls.includes(ball)) {
            return ball;
        }
    }
    return null; // No balls remaining
};

/**
 * Calculate remaining total from remaining balls
 */
const calculateRemainingTotal = (remainingBalls) => {
    return remainingBalls.reduce((sum, ball) => sum + getBallValue(ball), 0);
};

/**
 * Pure function: Apply an event to the game state
 * @param {Object} state - Current game state
 * @param {Object} event - Event to apply
 * @returns {Object} - New game state
 */
const applyEvent = (state, event) => {
    const newState = JSON.parse(JSON.stringify(state)); // Deep clone

    switch (event.type) {
        case 'GAME_STARTED':
            newState.status = 'ACTIVE';
            break;

        case 'BALL_POTTED':
            const { ballNumber, ballValue, playerId, scoreEffect, scoreDelta } = event.payload;

            // Mark that first ball has been potted
            newState.isFirstBallPotted = true;

            // Update player score
            const playerScore = newState.scores.find(s => s.playerId.toString() === playerId.toString());
            if (playerScore) {
                playerScore.score += scoreDelta;
                if (playerScore.score >= MAX_TOTAL_SCORE) {
                    playerScore.hitMax = true;
                }
            }

            // Remove ball from remaining
            newState.remainingBalls = newState.remainingBalls.filter(b => b !== ballNumber);
            newState.remainingTotal = calculateRemainingTotal(newState.remainingBalls);

            // Recompute top score
            newState.topScore = Math.max(...newState.scores.map(s => s.score));

            // Recompute max possible for each player
            newState.scores.forEach(s => {
                s.maxPossible = s.score + newState.remainingTotal;
            });

            // Recompute elimination status
            newState.scores.forEach(s => {
                if (s.maxPossible < newState.topScore) {
                    s.status = 'ELIMINATED';
                } else {
                    s.status = 'ACTIVE';
                }
            });

            // Check for clinch (early winner)
            // Only consider active players (not dropped out) for winning
            const activePlayers = game.players.filter(p => !p.droppedOut).map(p => p.playerId.toString());
            const topPlayers = newState.scores.filter(s =>
                s.score === newState.topScore && activePlayers.includes(s.playerId.toString())
            );
            const nonTopPlayers = newState.scores.filter(s =>
                s.score < newState.topScore && activePlayers.includes(s.playerId.toString())
            );

            if (nonTopPlayers.length > 0) {
                const bestChallengerMax = Math.max(...nonTopPlayers.map(s => s.maxPossible));

                if (bestChallengerMax < newState.topScore) {
                    // Game is clinched!
                    newState.status = 'ENDED';
                    newState.winners = topPlayers.map(p => p.playerId);
                }
            }

            // Check if all balls are gone
            if (newState.remainingBalls.length === 0) {
                newState.status = 'ENDED';
                newState.winners = topPlayers.map(p => p.playerId);
            }

            break;

        case 'WHITE_BALL_POTTED':
            const { playerId: whitePlayerId, penalty } = event.payload;

            // Mark that first ball has been potted (if this is the first pot)
            if (!newState.isFirstBallPotted) {
                newState.isFirstBallPotted = true;
            }

            // Apply penalty (if any)
            if (penalty > 0) {
                const whitePlayerScore = newState.scores.find(s => s.playerId.toString() === whitePlayerId.toString());
                if (whitePlayerScore) {
                    whitePlayerScore.score -= penalty;
                }

                // Recompute top score and max possible
                newState.topScore = Math.max(...newState.scores.map(s => s.score));
                newState.scores.forEach(s => {
                    s.maxPossible = s.score + newState.remainingTotal;
                });

                // Recompute elimination status
                newState.scores.forEach(s => {
                    if (s.maxPossible < newState.topScore) {
                        s.status = 'ELIMINATED';
                    } else {
                        s.status = 'ACTIVE';
                    }
                });
            }

            // White ball is never removed from table
            break;

        case 'FOUL_COMMITTED':
            const { playerId: foulPlayerId, ballNumber: foulBall, penalty: foulPenalty } = event.payload;

            // Apply penalty
            const foulPlayerScore = newState.scores.find(s => s.playerId.toString() === foulPlayerId.toString());
            if (foulPlayerScore) {
                foulPlayerScore.score -= foulPenalty;
            }

            // Recompute top score and max possible
            newState.topScore = Math.max(...newState.scores.map(s => s.score));
            newState.scores.forEach(s => {
                s.maxPossible = s.score + newState.remainingTotal;
            });

            // Recompute elimination status
            newState.scores.forEach(s => {
                if (s.maxPossible < newState.topScore) {
                    s.status = 'ELIMINATED';
                } else {
                    s.status = 'ACTIVE';
                }
            });

            // Ball remains on table (not removed from remainingBalls)
            break;

        case 'GAME_ENDED':
        case 'GAME_CLINCHED':
            newState.status = 'ENDED';
            break;

        default:
            break;
    }

    return newState;
};

/**
 * Rebuild game state from events
 */
const rebuildStateFromEvents = (game, events) => {
    let state = {
        gameId: game._id,
        scores: game.players.map(p => ({
            playerId: p.playerId,
            score: 0,
            status: 'ACTIVE',
            maxPossible: MAX_TOTAL_SCORE,
            hitMax: false,
        })),
        remainingBalls: [...BALL_SEQUENCE],
        remainingTotal: MAX_TOTAL_SCORE,
        topScore: 0,
        winners: [],
        status: game.status,
        version: game.version,
        isFirstBallPotted: false, // Track if any ball has been potted
    };

    // Apply each event in order
    for (const event of events) {
        state = applyEvent(state, event);
    }

    return state;
};

module.exports = {
    getBallValue,
    BALL_SEQUENCE,
    MAX_TOTAL_SCORE,
    getActiveBall,
    calculateRemainingTotal,
    applyEvent,
    rebuildStateFromEvents,
    isWhiteBall,
    calculateWhiteBallPenalty,
};
