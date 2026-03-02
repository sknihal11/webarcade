// --- DATA STRUCTURES & CONSTANTS ---
const TURN_ORDER = ['red', 'green', 'yellow', 'blue'];

let playerCount = 2; // Selected by user
let activePlayers = []; // e.g. ['red', 'yellow'] for 2 players
let currentTurnIndex = 0;

let gameState = {
    tokens: {}, // { 'red_0': { color, id, base: true, pathIndex: -1, homeIndex: -1, isHome: false } }
    board: [],  // 52 slots array for outer ring, storing array of token IDs
    sixCount: 0,
    hasRolled: false,
    currentRoll: 0
};

// DOM Elements
const boardEl = document.getElementById('board');
const playersPanel = document.getElementById('playersPanel');
const mainMenu = document.getElementById('mainMenu');
const rulesMenu = document.getElementById('rulesMenu');
const winMenu = document.getElementById('winMenu');
const statusText = document.getElementById('statusText');
const toastEl = document.getElementById('toast');
const soundToggle = document.getElementById('soundToggle');

// Sounds (Placeholders)
const sounds = {
    roll: new Audio('https://assets.mixkit.co/active_storage/sfx/2012/2012-preview.mp3'),
    move: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
    kill: new Audio('https://assets.mixkit.co/active_storage/sfx/2143/2143-preview.mp3'),
    win: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'),
};
let soundEnabled = true;

/* BOARD GENERATION LOGIC */

// Ludo safe spots based on a 52 outer ring (index 0-51)
const START_POINTS = { red: 0, green: 13, yellow: 26, blue: 39 };
const END_POINTS = { red: 50, green: 11, yellow: 24, blue: 37 }; // Point before entering Home stretch
const SAFE_ZONES = [0, 8, 13, 21, 26, 34, 39, 47];

// Grid Mapping (15x15) - We map each array index 0-51 to a grid (col, row)
const PATH_COORDS = [
    // Red Path to Green Base side
    { c: 2, r: 7 }, { c: 3, r: 7 }, { c: 4, r: 7 }, { c: 5, r: 7 }, { c: 6, r: 7 },
    // Turning to Green Path
    { c: 7, r: 6 }, { c: 7, r: 5 }, { c: 7, r: 4 }, { c: 7, r: 3 }, { c: 7, r: 2 }, { c: 7, r: 1 },
    // Across top
    { c: 8, r: 1 }, { c: 9, r: 1 },
    // Green Path down
    { c: 9, r: 2 }, { c: 9, r: 3 }, { c: 9, r: 4 }, { c: 9, r: 5 }, { c: 9, r: 6 },
    // Turning to Yellow path (right)
    { c: 10, r: 7 }, { c: 11, r: 7 }, { c: 12, r: 7 }, { c: 13, r: 7 }, { c: 14, r: 7 }, { c: 15, r: 7 },
    // Down right side
    { c: 15, r: 8 }, { c: 15, r: 9 },
    // Yellow path leftwards
    { c: 14, r: 9 }, { c: 13, r: 9 }, { c: 12, r: 9 }, { c: 11, r: 9 }, { c: 10, r: 9 },
    // Turning to Blue path (down)
    { c: 9, r: 10 }, { c: 9, r: 11 }, { c: 9, r: 12 }, { c: 9, r: 13 }, { c: 9, r: 14 }, { c: 9, r: 15 },
    // Across bottom
    { c: 8, r: 15 }, { c: 7, r: 15 },
    // Blue path up
    { c: 7, r: 14 }, { c: 7, r: 13 }, { c: 7, r: 12 }, { c: 7, r: 11 }, { c: 7, r: 10 },
    // Turning to Red path (left)
    { c: 6, r: 9 }, { c: 5, r: 9 }, { c: 4, r: 9 }, { c: 3, r: 9 }, { c: 2, r: 9 }, { c: 1, r: 9 },
    // Up left side to start
    { c: 1, r: 8 }, { c: 1, r: 7 }
];

// Home stretches (5 blocks each)
const HOME_STRETCHES = {
    red: [{ c: 2, r: 8 }, { c: 3, r: 8 }, { c: 4, r: 8 }, { c: 5, r: 8 }, { c: 6, r: 8 }],
    green: [{ c: 8, r: 2 }, { c: 8, r: 3 }, { c: 8, r: 4 }, { c: 8, r: 5 }, { c: 8, r: 6 }],
    yellow: [{ c: 14, r: 8 }, { c: 13, r: 8 }, { c: 12, r: 8 }, { c: 11, r: 8 }, { c: 10, r: 8 }],
    blue: [{ c: 8, r: 14 }, { c: 8, r: 13 }, { c: 8, r: 12 }, { c: 8, r: 11 }, { c: 8, r: 10 }]
};

function generateBoard() {
    boardEl.innerHTML = '';

    // Generate Outer Path Tracks
    PATH_COORDS.forEach((coord, i) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.id = `path_${i}`;
        cell.style.gridColumn = coord.c;
        cell.style.gridRow = coord.r;

        if (SAFE_ZONES.includes(i)) cell.classList.add('safe-zone');
        if (i === START_POINTS.red) cell.classList.add('path-red');
        if (i === START_POINTS.green) cell.classList.add('path-green');
        if (i === START_POINTS.yellow) cell.classList.add('path-yellow');
        if (i === START_POINTS.blue) cell.classList.add('path-blue');

        // Add visual arrows pointing to Home Stretch
        if (i === END_POINTS.red) cell.innerHTML = '<span class="path-arrow">➤</span>';
        if (i === END_POINTS.green) cell.innerHTML = '<span class="path-arrow">▼</span>';
        if (i === END_POINTS.yellow) cell.innerHTML = '<span class="path-arrow">◀</span>';
        if (i === END_POINTS.blue) cell.innerHTML = '<span class="path-arrow">▲</span>';

        boardEl.appendChild(cell);
    });

    // Generate Home Stretches
    ['red', 'green', 'yellow', 'blue'].forEach(color => {
        HOME_STRETCHES[color].forEach((coord, i) => {
            const cell = document.createElement('div');
            cell.className = `cell path-${color}`;
            cell.id = `home_${color}_${i}`;
            cell.style.gridColumn = coord.c;
            cell.style.gridRow = coord.r;
            boardEl.appendChild(cell);
        });
    });

    // Add Bases
    ['red', 'green', 'blue', 'yellow'].forEach(color => {
        const base = document.createElement('div');
        base.className = `base ${color}`;
        base.id = `base_${color}`;

        const inner = document.createElement('div');
        inner.className = 'base-inner';
        for (let i = 0; i < 4; i++) {
            const slot = document.createElement('div');
            slot.className = 'token-slot';
            slot.id = `base_slot_${color}_${i}`;
            inner.appendChild(slot);
        }
        base.appendChild(inner);
        boardEl.appendChild(base);
    });

    // Home Center
    const home = document.createElement('div');
    home.className = 'home-center';
    home.id = 'home_center';
    boardEl.appendChild(home);
}

/* MENU / UI LOGIC */

// Setup Player count
document.querySelectorAll('.player-count-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playerCount = parseInt(btn.dataset.count);
    });
});

document.getElementById('startBtn').addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    initGame();
});

document.getElementById('rulesBtn').addEventListener('click', () => {
    rulesMenu.classList.remove('hidden');
});

document.getElementById('closeRulesBtn').addEventListener('click', () => {
    rulesMenu.classList.add('hidden');
});

document.getElementById('homeBtn').addEventListener('click', () => {
    winMenu.classList.add('hidden');
    mainMenu.classList.remove('hidden');
});

soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundToggle.innerText = soundEnabled ? '🔊' : '🔇';
});

function showToast(msg) {
    toastEl.innerText = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function playSound(name) {
    if (!soundEnabled) return;
    sounds[name].currentTime = 0;
    sounds[name].play().catch(() => console.log("Audio play prevented"));
}

/* INIT & GAME STATE */

function initGame() {
    // Determine active players
    if (playerCount === 2) activePlayers = ['red', 'yellow'];
    else if (playerCount === 3) activePlayers = ['red', 'green', 'yellow'];
    else activePlayers = ['red', 'green', 'yellow', 'blue'];

    currentTurnIndex = 0;
    gameState.sixCount = 0;
    gameState.hasRolled = false;
    gameState.board = Array(52).fill().map(() => []);

    // Clean DOM Board Tokens
    document.querySelectorAll('.token').forEach(el => el.remove());

    generatePlayerPanels();
    generateBoard(); // Ensure coordinates are fresh

    // Initialize Token State
    gameState.tokens = {};
    activePlayers.forEach(color => {
        for (let i = 0; i < 4; i++) {
            const id = `${color}_${i}`;
            gameState.tokens[id] = { color, id, base: true, pathIndex: -1, homeIndex: -1, isHome: false };

            // Creates token DOM elements inside bases
            const tokenEl = document.createElement('div');
            tokenEl.className = `token ${color}`;
            tokenEl.id = `token_${id}`;
            tokenEl.onclick = () => handleTokenClick(id);
            document.getElementById(`base_slot_${color}_${i}`).appendChild(tokenEl);
        }
    });

    updateTurnUI();
}

function generatePlayerPanels() {
    playersPanel.innerHTML = '';
    activePlayers.forEach(color => {
        const card = document.createElement('div');
        card.className = `player-card ${color}`;
        card.id = `panel_${color}`;

        card.innerHTML = `
            <div class="player-name">${color.toUpperCase()}</div>
            <div class="dice-container" id="dice_${color}" onclick="handleRoll('${color}')">
                <div class="dice-face dice-6" id="dice_face_${color}">
                    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                    <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                </div>
            </div>
        `;
        playersPanel.appendChild(card);
    });
}

function updateTurnUI() {
    const color = activePlayers[currentTurnIndex];
    statusText.innerText = `${color.toUpperCase()}'s Turn`;

    document.querySelectorAll('.player-card').forEach(c => c.classList.remove('active'));
    document.getElementById(`panel_${color}`).classList.add('active');

    // Reset dice highlights
    document.querySelectorAll('.token').forEach(t => t.classList.remove('highlight'));
    if (gameState.hasRolled) highlightValidMoves(color, gameState.currentRoll);
}

function nextTurn() {
    gameState.hasRolled = false;
    currentTurnIndex = (currentTurnIndex + 1) % activePlayers.length;
    updateTurnUI();
}

/* --- DICE / MOVEMENT --- */

function handleRoll(color) {
    if (activePlayers[currentTurnIndex] !== color) return;
    if (gameState.hasRolled) return;

    playSound('roll');
    const diceEl = document.getElementById(`dice_${color}`);
    diceEl.classList.add('rolling');

    setTimeout(() => {
        diceEl.classList.remove('rolling');
        const roll = Math.floor(Math.random() * 6) + 1;

        // Update face
        const face = document.getElementById(`dice_face_${color}`);
        face.className = `dice-face dice-${roll}`;
        face.innerHTML = Array(roll).fill('<div class="dot"></div>').join('');

        gameState.currentRoll = roll;
        gameState.hasRolled = true;

        if (roll === 6) {
            gameState.sixCount++;
            if (gameState.sixCount === 3) {
                showToast("Three 6s! Turn skipped.");
                gameState.sixCount = 0;
                setTimeout(nextTurn, 1000);
                return;
            }
        } else {
            gameState.sixCount = 0; // reset
        }

        // Check Valid Moves
        const validTokens = getValidMoves(color, roll);
        if (validTokens.length === 0) {
            showToast("No valid moves.");
            setTimeout(nextTurn, 1000);
        } else if (validTokens.length === 1) {
            // Auto-move if only 1 option
            setTimeout(() => {
                moveToken(validTokens[0], roll);
            }, 600);
        } else {
            // Highlight multiple options and update turn UI
            validTokens.forEach(id => {
                document.getElementById(`token_${id}`).classList.add('highlight');
            });
            updateTurnUI();
        }

    }, 300); // Shorter animation
}

function getValidMoves(color, roll) {
    let validTokens = [];

    for (let i = 0; i < 4; i++) {
        const id = `${color}_${i}`;
        const t = gameState.tokens[id];

        if (t.isHome) continue;

        if (t.base) {
            if (roll === 6) {
                validTokens.push(id);
            }
        } else {
            // Check if they can move without overshooting home
            if (t.homeIndex !== -1) {
                if (t.homeIndex + roll <= 5) { // 5 is center home
                    validTokens.push(id);
                }
            } else {
                // Determine if moving puts them past the end point into the home stretch
                let distanceToHome = getDistanceToEnd(color, t.pathIndex);
                if (roll <= distanceToHome + 6) { // Can technically enter home stretch
                    validTokens.push(id);
                }
            }
        }
    }
    return validTokens;
}

function highlightValidMoves(color, roll) {
    // Left for updateTurnUI compatibility but highlighting is handled above now.
    const valid = getValidMoves(color, roll);
    valid.forEach(id => document.getElementById(`token_${id}`).classList.add('highlight'));
    return valid.length > 0;
}

function getDistanceToEnd(color, currentIndex) {
    let end = END_POINTS[color];
    if (currentIndex <= end) return end - currentIndex;
    return (52 - currentIndex) + end;
}

function handleTokenClick(id) {
    if (!gameState.hasRolled) return;

    const el = document.getElementById(`token_${id}`);
    if (!el.classList.contains('highlight')) return;

    // Clear highlights
    document.querySelectorAll('.token').forEach(t => t.classList.remove('highlight'));

    moveToken(id, gameState.currentRoll);
}

function processCapture(targetIndex, movingTokenColor) {
    let captured = false;
    if (SAFE_ZONES.includes(targetIndex)) return false;

    // Tokens at the target block
    const tokensAtPos = Object.values(gameState.tokens).filter(t => t.pathIndex === targetIndex && t.homeIndex === -1 && !t.isHome && !t.base);

    tokensAtPos.forEach(t => {
        if (t.color !== movingTokenColor) {
            // Check if there are multiple tokens of the same opponent color forming a block (Ludo King rule: 2+ is a block)
            // For simplicity, any opponent token gets captured unless it's a safe zone
            t.base = true;
            t.pathIndex = -1;
            renderToken(t.id);
            captured = true;
            showToast("⚔️ Captured!");
            playSound('kill');
        }
    });
    return captured;
}

function checkWinCondition(color) {
    const homeTokens = Object.values(gameState.tokens).filter(t => t.color === color && t.isHome).length;
    if (homeTokens === 4) {
        document.getElementById('winTitle').innerText = `${color.toUpperCase()} WINS!`;
        document.getElementById('winTitle').style.color = `var(--${color})`;
        winMenu.classList.remove('hidden');
        playSound('win');
        return true;
    }
    return false;
}

// Token movement animation sequence
function moveToken(id, steps) {
    const t = gameState.tokens[id];
    let remainingSteps = steps;
    playSound('move');

    if (t.base && steps === 6) {
        // Move to start point
        t.base = false;
        t.pathIndex = START_POINTS[t.color];
        renderToken(id);

        // Rolling 6 gives extra turn
        gameState.hasRolled = false;
        updateTurnUI();
        return;
    }

    // Animate step by step
    const interval = setInterval(() => {
        if (remainingSteps === 0) {
            clearInterval(interval);
            finalizeMove(id, steps);
            return;
        }

        if (t.homeIndex !== -1) {
            // Already in home stretch
            t.homeIndex++;
        } else {
            // Outer track logic
            if (t.pathIndex === END_POINTS[t.color]) {
                // Enter home stretch
                t.pathIndex = -1;
                t.homeIndex = 0;
            } else {
                t.pathIndex = (t.pathIndex + 1) % 52;
            }
        }

        renderToken(id);
        remainingSteps--;
        if (remainingSteps > 0) playSound('move');
    }, 200); // 200ms per step
}

function finalizeMove(id, stepsRoll) {
    const t = gameState.tokens[id];
    let earnedExtraTurn = false;

    // Check if entered Home
    if (t.homeIndex === 5) {
        t.isHome = true;
        t.homeIndex = -1;
        renderToken(id);
        showToast("🏠 Token Home!");
        earnedExtraTurn = true;

        if (checkWinCondition(t.color)) return;
    } else if (t.pathIndex !== -1) {
        // Check for captures on outer track
        if (processCapture(t.pathIndex, t.color)) {
            earnedExtraTurn = true;
        }
    }

    // Adjust stack visuals for this cell
    adjustCellStacking(t.pathIndex !== -1 ? `path_${t.pathIndex}` : (t.homeIndex !== -1 ? `home_${t.color}_${t.homeIndex}` : null));

    if (stepsRoll === 6 || earnedExtraTurn) {
        gameState.hasRolled = false;
        updateTurnUI(); // Player goes again
    } else {
        setTimeout(nextTurn, 500);
    }
}

function renderToken(id) {
    const t = gameState.tokens[id];
    const el = document.getElementById(`token_${id}`);

    el.classList.remove('stacked'); // Reset

    if (t.base) {
        // Move back to specific slot
        const slotPart = id.split('_')[1];
        document.getElementById(`base_slot_${t.color}_${slotPart}`).appendChild(el);
        return;
    }

    let targetCell;
    if (t.isHome) {
        targetCell = document.getElementById('home_center');
    } else if (t.homeIndex !== -1) {
        targetCell = document.getElementById(`home_${t.color}_${t.homeIndex}`);
    } else {
        targetCell = document.getElementById(`path_${t.pathIndex}`);
    }

    if (targetCell) {
        targetCell.appendChild(el);
    }
}

function adjustCellStacking(cellId) {
    if (!cellId) return;
    const cell = document.getElementById(cellId);
    if (!cell) return;

    const tokensInCell = cell.querySelectorAll('.token');
    if (tokensInCell.length > 1) {
        tokensInCell.forEach(el => el.classList.add('stacked'));
    } else if (tokensInCell.length === 1) {
        tokensInCell[0].classList.remove('stacked');
    }
}

document.getElementById('playAgainBtn').addEventListener('click', () => {
    winMenu.classList.add('hidden');
    initGame();
});

generateBoard(); // Draw board in BG initially
