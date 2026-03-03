let playerCount = 4; // Total slots (2, 3, 4)
let aiCount = 1;     // Substituted bots
let gameMode = 'local';
let gameVariant = 'classic';
let friendlyKill = false;
let activePlayers = [];
let playerRoles = {};
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
    roll: new Audio('https://www.soundjay.com/misc/sounds/dice-roll-1.mp3'),
    move: new Audio('https://www.soundjay.com/buttons/button-20.mp3'),
    kill: new Audio('https://www.soundjay.com/buttons/button-37.mp3'),
    win: new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-01.mp3'),
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

let selectedOpponent = 'local'; // local, bot, online

// --- SCREEN NAVIGATION ---
const mainDashboard = document.getElementById('mainDashboard');
const selectGameMenu = document.getElementById('selectGameMenu');
const chooseColorMenu = document.getElementById('chooseColorMenu');


window.openSelectGame = (type) => {
    selectedOpponent = type;
    if (type === 'bot') gameMode = 'bot';
    else if (type === 'local') gameMode = 'local';
    else if (type === 'team') gameMode = 'team';

    mainDashboard.classList.add('hidden');
    selectGameMenu.classList.remove('hidden');

    // Default variant
    selectVariant('classic');
};

window.backToDashboard = () => {
    selectGameMenu.classList.add('hidden');
    mainDashboard.classList.remove('hidden');
};

window.selectVariant = (variant) => {
    gameVariant = variant;

    document.querySelectorAll('.select-row').forEach(row => row.classList.remove('active'));
    document.querySelectorAll('.select-row .check-circle').forEach(btn => btn.innerHTML = '');

    const activeRow = document.querySelector(`.select-row[onclick="selectVariant('${variant}')"]`);
    if (activeRow) {
        activeRow.classList.add('active');
        activeRow.querySelector('.check-circle').innerHTML = '✔';
    }
};

window.goToColorSelection = () => {
    selectGameMenu.classList.add('hidden');
    chooseColorMenu.classList.remove('hidden');

    // Default player count based on variant
    if (gameVariant === 'team' || selectedOpponent === 'team') {
        selectPlayerCount(4);
        document.getElementById('playerCountSelector').style.display = 'none'; // Lock to 4P
    } else {
        document.getElementById('playerCountSelector').style.display = 'flex';
        selectPlayerCount(playerCount || 2);
    }
};

window.backToSelectGame = () => {
    chooseColorMenu.classList.add('hidden');
    selectGameMenu.classList.remove('hidden');
};

window.selectPlayerCount = (count) => {
    playerCount = count;
    document.querySelectorAll('.p-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.p-btn[onclick="selectPlayerCount(${count})"]`);
    if (btn) btn.classList.add('active');

    renderColorSlots();
};

function renderColorSlots() {
    const container = document.getElementById('colorSlotsContainer');
    container.innerHTML = '';

    if (playerCount === 2) activePlayers = ['red', 'yellow'];
    else if (playerCount === 3) activePlayers = ['red', 'green', 'yellow'];
    else activePlayers = ['red', 'green', 'yellow', 'blue'];

    const allColors = ['red', 'green', 'yellow', 'blue'];

    allColors.forEach((color, idx) => {
        const isActive = activePlayers.includes(color);
        const playerNum = idx + 1;

        if (!playerRoles[color]) {
            playerRoles[color] = (selectedOpponent === 'bot' && color !== 'red') ? 'bot' : 'human';
        }

        const slot = document.createElement('div');
        slot.className = `color-slot slot-${color} ${isActive ? 'active' : 'inactive'}`;

        slot.innerHTML = `
            <div class="color-check">${isActive ? '✔' : ''}</div>
            <div class="color-pin" style="color: var(--${color})">📍</div>
            <input type="text" class="player-input-box" id="name_${color}" value="Player ${playerNum}" ${isActive ? '' : 'disabled'}>
            <div class="role-badge" id="role_${color}" onclick="toggleRole('${color}')">${playerRoles[color] === 'bot' ? '🤖 BOT' : '👤 HUMAN'}</div>
        `;
        container.appendChild(slot);
    });
}

window.toggleRole = (color) => {
    if (!activePlayers.includes(color)) return;

    playerRoles[color] = playerRoles[color] === 'human' ? 'bot' : 'human';
    const badge = document.getElementById(`role_${color}`);
    badge.innerHTML = playerRoles[color] === 'bot' ? '🤖 BOT' : '👤 HUMAN';
};

const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const settingsBtn = document.getElementById('settingsBtn');
const settingsMenu = document.getElementById('settingsMenu');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
});

settingsBtn.addEventListener('click', () => {
    settingsMenu.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsMenu.classList.add('hidden');
});

// Settings Handlers
document.querySelectorAll('#themeSetup .player-count-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#themeSetup .player-count-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.body.className = e.target.getAttribute('data-theme') + '-theme';
    });
});

document.querySelectorAll('#friendlyKillSetup .player-count-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#friendlyKillSetup .player-count-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        friendlyKill = e.target.getAttribute('data-kill') === 'true';
    });
});

document.addEventListener('click', () => {
    if (!emojiPicker.classList.contains('hidden')) emojiPicker.classList.add('hidden');
});

window.sendEmoji = (emoji) => {
    const color = activePlayers[currentTurnIndex];
    const panel = document.getElementById(`panel_${color}`);
    if (!panel) return;

    const bubble = document.createElement('div');
    bubble.className = 'emoji-bubble';
    bubble.innerText = emoji;
    panel.appendChild(bubble);

    setTimeout(() => bubble.remove(), 2000);
    emojiPicker.classList.add('hidden');
};

document.getElementById('startBtn').addEventListener('click', () => {
    if (gameMode === 'online') {
        alert("Online Multiplayer coming in Phase 4!");
        return;
    }

    const hasHuman = activePlayers.some(color => playerRoles[color] === 'human');
    if (!hasHuman) {
        alert("At least one player must be a HUMAN.");
        return;
    }

    chooseColorMenu.classList.add('hidden');
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

let isMoving = false; // Global Lock

function initGame() {
    currentTurnIndex = 0;
    gameState.sixCount = 0;
    gameState.hasRolled = false;
    isMoving = false;

    // Hide all corner dice initially
    document.querySelectorAll('.corner-dice').forEach(el => {
        el.style.display = 'none';
        el.innerHTML = '';
    });

    generatePlayerPanels();
    generateBoard();

    // Initialize Token State (Exactly 16 Tokens)
    gameState.tokens = {};
    activePlayers.forEach((color) => {
        for (let i = 0; i < 4; i++) {
            const id = `${color}_${i}`;
            const isQuickOut = (gameVariant === 'quick' && i < 2);

            gameState.tokens[id] = {
                color, id, base: !isQuickOut,
                pathIndex: isQuickOut ? START_POINTS[color] : -1,
                homeIndex: -1, isHome: false,
                slotIndex: i // Remembers which of the 4 base slots it belongs to
            };
        }
    });

    // Create the physical token DOM elements ONCE
    document.querySelectorAll('.token').forEach(el => el.remove());
    Object.values(gameState.tokens).forEach(t => {
        const tokenEl = document.createElement('div');
        tokenEl.className = `token ${t.color}`;
        tokenEl.id = `token_${t.id}`;
        tokenEl.onclick = () => handleTokenClick(t.id);
        document.body.appendChild(tokenEl); // Temporarily append to body
    });

    renderAllTokens(); // Single Source of Truth positioning
    updateTurnUI();
}

function generatePlayerPanels() {
    activePlayers.forEach(color => {
        const container = document.getElementById(`corner_${color}`);
        if (!container) return;
        container.style.display = 'block';

        const role = playerRoles[color];
        container.innerHTML = `
            <div class="player-card ${color} ${role}" id="panel_${color}">
                <div class="player-header">
                    <div class="player-name">${color.toUpperCase()}</div>
                    <div class="player-badge">${role === 'bot' ? '🤖 BOT' : '👤 HUMAN'}</div>
                </div>
                <div class="player-level">Level ${Math.floor(Math.random() * 5) + 1}</div>
                <div class="dice-container disabled" id="dice_${color}" onclick="handleRoll('${color}')">
                    <div class="dice-face dice-6" id="dice_face_${color}">
                        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                    </div>
                </div>
            </div>
        `;
    });
}

function updateTurnUI() {
    if (isMoving) return;

    const color = activePlayers[currentTurnIndex];
    statusText.innerText = `${color.toUpperCase()}'s Turn`;

    document.querySelectorAll('.player-card').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.dice-container').forEach(d => d.classList.add('disabled'));

    const activePanel = document.getElementById(`panel_${color}`);
    const activeDice = document.getElementById(`dice_${color}`);
    if (activePanel) activePanel.classList.add('active');
    if (activeDice && !gameState.hasRolled) activeDice.classList.remove('disabled');

    document.querySelectorAll('.token').forEach(t => t.classList.remove('highlight'));
    if (gameState.hasRolled && playerRoles[color] === 'human') {
        highlightValidMoves(color, gameState.currentRoll);
    }

    if (playerRoles[color] === 'bot' && !gameState.hasRolled) {
        setTimeout(() => {
            if (Math.random() > 0.8) {
                const reactions = ['🔥', '🎲', '👋', '👏'];
                window.sendEmoji(reactions[Math.floor(Math.random() * reactions.length)]);
            }
            if (!isMoving) handleRoll(color);
        }, 800);
    }
}

function nextTurn() {
    gameState.hasRolled = false;
    currentTurnIndex = (currentTurnIndex + 1) % activePlayers.length;
    updateTurnUI();
}

/* --- SINGLE SOURCE OF TRUTH RENDERING --- */

function renderAllTokens() {
    // 1. Reset all token visuals
    document.querySelectorAll('.token').forEach(el => {
        el.classList.remove('stacked', 'highlight');
    });

    const locationMap = {}; // Tracks how many tokens are in each cell id

    // 2. Place pieces in their exact state locations
    Object.values(gameState.tokens).forEach(t => {
        const el = document.getElementById(`token_${t.id}`);
        if (!el) return;

        let targetId = '';
        if (t.isHome) {
            targetId = 'home_center';
        } else if (t.base) {
            targetId = `base_slot_${t.color}_${t.slotIndex}`;
        } else if (t.homeIndex !== -1) {
            targetId = `home_${t.color}_${t.homeIndex}`;
        } else if (t.pathIndex !== -1) {
            targetId = `path_${t.pathIndex}`;
        }

        if (targetId) {
            const targetCell = document.getElementById(targetId);
            if (targetCell) {
                targetCell.appendChild(el);
                locationMap[targetId] = (locationMap[targetId] || 0) + 1;
            }
        }
    });

    // 3. Apply stacking logic defensively
    Object.keys(locationMap).forEach(cellId => {
        if (locationMap[cellId] > 1 && !cellId.includes('base_slot')) {
            const cell = document.getElementById(cellId);
            if (cell) {
                cell.querySelectorAll('.token').forEach(t => t.classList.add('stacked'));
            }
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* --- DICE / MOVEMENT --- */

async function handleRoll(color) {
    if (activePlayers[currentTurnIndex] !== color) return;
    if (gameState.hasRolled || isMoving) return;

    isMoving = true; // Lock interactions
    playSound('roll');

    const diceEl = document.getElementById(`dice_${color}`);
    diceEl.classList.remove('rolling');
    void diceEl.offsetWidth;
    diceEl.classList.add('rolling');

    await sleep(500); // Wait for tumbling animation
    diceEl.classList.remove('rolling');

    const roll = Math.floor(Math.random() * 6) + 1;
    const face = document.getElementById(`dice_face_${color}`);
    face.className = `dice-face dice-${roll}`;
    face.innerHTML = Array(roll).fill('<div class="dot"></div>').join('');

    gameState.currentRoll = roll;
    gameState.hasRolled = true;

    if (roll === 6) {
        gameState.sixCount++;
        if (gameState.sixCount === 3) {
            showToast("Oops! Three 6s skipped.");
            gameState.sixCount = 0;
            isMoving = false;
            setTimeout(nextTurn, 1000);
            return;
        }
    } else {
        gameState.sixCount = 0;
    }

    const validTokens = getValidMoves(color, roll);

    if (validTokens.length === 0) {
        showToast("No valid moves.");
        isMoving = false;
        setTimeout(nextTurn, 1000);
    } else if (validTokens.length === 1 || playerRoles[color] === 'bot') {
        let selectedId = validTokens[0];
        if (playerRoles[color] === 'bot' && validTokens.length > 1) {
            selectedId = chooseBotMove(color, validTokens, roll);
        }
        await sleep(400); // Artificial bot thinking delay
        moveToken(selectedId, roll); // moveToken manages isMoving unlock internally
    } else {
        // Unlock and wait for human click
        isMoving = false;
        updateTurnUI();
    }
}

function isPathBlocked(myColor, currentIdx, roll) {
    if (currentIdx === -1) return false;

    let idx = currentIdx;
    let distanceToEnd = getDistanceToEnd(myColor, currentIdx);

    for (let step = 1; step <= roll; step++) {
        if (step > distanceToEnd) break;

        idx = (idx + 1) % 52;
        if (!SAFE_ZONES.includes(idx)) {
            const tokensOnSquare = Object.values(gameState.tokens).filter(t => t.pathIndex === idx && t.homeIndex === -1 && !t.isHome && !t.base);

            const colorCounts = {};
            tokensOnSquare.forEach(t => {
                if (t.color !== myColor) colorCounts[t.color] = (colorCounts[t.color] || 0) + 1;
            });

            if (Object.values(colorCounts).some(count => count >= 2)) return true;
        }
    }
    return false;
}

function getValidMoves(color, roll) {
    let validTokens = [];
    for (let i = 0; i < 4; i++) {
        const id = `${color}_${i}`;
        const t = gameState.tokens[id];

        if (t.isHome) continue;

        if (t.base) {
            if (roll === 6) validTokens.push(id);
        } else {
            if (t.homeIndex !== -1) {
                if (t.homeIndex + roll <= 5) validTokens.push(id);
            } else {
                if (!isPathBlocked(color, t.pathIndex, roll)) {
                    let distanceToHome = getDistanceToEnd(color, t.pathIndex);
                    if (roll <= distanceToHome + 6) validTokens.push(id);
                }
            }
        }
    }
    return validTokens;
}

function highlightValidMoves(color, roll) {
    const valid = getValidMoves(color, roll);
    valid.forEach(id => document.getElementById(`token_${id}`).classList.add('highlight'));
}

function getDistanceToEnd(color, currentIndex) {
    let end = END_POINTS[color];
    if (currentIndex <= end) return end - currentIndex;
    return (52 - currentIndex) + end;
}

function handleTokenClick(id) {
    if (isMoving || !gameState.hasRolled) return;

    const el = document.getElementById(`token_${id}`);
    if (!el.classList.contains('highlight')) return;

    document.querySelectorAll('.token').forEach(t => t.classList.remove('highlight'));
    moveToken(id, gameState.currentRoll);
}

// Token movement animation sequence (Fully Synchronous Loop)
async function moveToken(id, steps) {
    isMoving = true;
    const t = gameState.tokens[id];
    let remainingSteps = steps;
    playSound('move');

    if (t.base && steps === 6) {
        t.base = false;
        t.pathIndex = START_POINTS[t.color];
        renderAllTokens();
        gameState.hasRolled = false;
        isMoving = false;
        updateTurnUI();
        return;
    }

    // Step-by-step physical hop
    while (remainingSteps > 0) {
        const tokenEl = document.getElementById(`token_${id}`);
        if (tokenEl) tokenEl.classList.add('hopping');

        if (t.homeIndex !== -1) {
            t.homeIndex++;
        } else {
            if (t.pathIndex === END_POINTS[t.color]) {
                t.pathIndex = -1;
                t.homeIndex = 0;
            } else {
                t.pathIndex = (t.pathIndex + 1) % 52;
            }
        }

        renderAllTokens(); // Dynamic restacking every frame

        // Let CSS hop animation play
        await sleep(150);
        if (tokenEl) tokenEl.classList.remove('hopping');
        await sleep(100);

        remainingSteps--;
        if (remainingSteps > 0) playSound('move');
    }

    // Resolve Final Landing State
    await finalizeMove(id, steps);
}

async function finalizeMove(id, stepsRoll) {
    const t = gameState.tokens[id];
    let earnedExtraTurn = false;

    if (t.homeIndex === 5) {
        t.isHome = true;
        t.homeIndex = -1;
        renderAllTokens();
        showToast("🏠 Token Home!");
        earnedExtraTurn = true;
        if (checkWinCondition(t.color)) return;
    } else if (t.pathIndex !== -1) {
        const killedId = processCapture(t.pathIndex, t.color);
        if (killedId) {
            earnedExtraTurn = true;
            await playKillAnimation(killedId, t.pathIndex);
            // State Update exactly after animation
            gameState.tokens[killedId].base = true;
            gameState.tokens[killedId].pathIndex = -1;
            renderAllTokens();
        }
    }

    if (stepsRoll === 6 || earnedExtraTurn) {
        gameState.hasRolled = false;
        isMoving = false;
        updateTurnUI();
    } else {
        isMoving = false;
        setTimeout(nextTurn, 500);
    }
}

// Synchronous Capture Processor
function processCapture(targetIndex, movingTokenColor) {
    if (SAFE_ZONES.includes(targetIndex)) return null;

    const tokensAtPos = Object.values(gameState.tokens).filter(t => t.pathIndex === targetIndex && t.homeIndex === -1 && !t.isHome && !t.base);

    for (const t of tokensAtPos) {
        let isTeammate = false;
        if (gameMode === 'team') {
            const teamA = ['red', 'yellow'];
            const teamB = ['green', 'blue'];
            const myTeam = teamA.includes(movingTokenColor) ? teamA : teamB;
            if (myTeam.includes(t.color) && t.color !== movingTokenColor) {
                isTeammate = true;
            }
        }

        if (t.color !== movingTokenColor) {
            if (isTeammate && !friendlyKill) continue;
            return t.id; // Return immediately to kill only one piece
        }
    }
    return null;
}

async function playKillAnimation(killedId, targetIndex) {
    const tokenEl = document.getElementById(`token_${killedId}`);
    const cellEl = document.getElementById(`path_${targetIndex}`);
    showToast("⚔️ Captured!");
    playSound('kill');

    if (tokenEl) tokenEl.classList.add('killing');
    if (cellEl) cellEl.classList.add('capture-vibe');

    await sleep(500);

    if (tokenEl) tokenEl.classList.remove('killing');
    if (cellEl) cellEl.classList.remove('capture-vibe');
}

function checkWinCondition(color) {
    let hasWon = false;
    if (gameVariant === 'team' && playerCount === 4) {
        const teammate = (color === 'red') ? 'yellow' : (color === 'yellow') ? 'red' : (color === 'green') ? 'blue' : 'green';
        const teamTokens = Object.values(gameState.tokens).filter(t => (t.color === color || t.color === teammate) && t.isHome).length;
        if (teamTokens === 8) {
            document.getElementById('winTitle').innerText = `${color.toUpperCase()} & ${teammate.toUpperCase()} WIN!`;
            hasWon = true;
        }
    } else if (gameVariant === 'quick') {
        const homeTokens = Object.values(gameState.tokens).filter(t => t.color === color && t.isHome).length;
        if (homeTokens >= 1) {
            document.getElementById('winTitle').innerText = `${color.toUpperCase()} WINS QUICK MATCH!`;
            hasWon = true;
        }
    } else {
        const homeTokens = Object.values(gameState.tokens).filter(t => t.color === color && t.isHome).length;
        if (homeTokens === 4) {
            document.getElementById('winTitle').innerText = `${color.toUpperCase()} WINS!`;
            hasWon = true;
        }
    }

    if (hasWon) {
        document.getElementById('winTitle').style.color = `var(--${color})`;
        winMenu.classList.remove('hidden');
        playSound('win');
        triggerConfetti();
        reportScore(color);
        isMoving = true; // Lock the game permanently
        return true;
    }
    return false;
}

function triggerConfetti() {
    confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ff0055', '#00ffcc', '#ffcc00', '#0099ff']
    });
}

function reportScore(winningColor) {
    if (playerRoles[winningColor] === 'human') {
        if (window.reportLudoWin) window.reportLudoWin();
        showToast("🏆 Win Reported! Rating Updated.");
    }
}

function chooseBotMove(color, validTokens, roll) {
    let bestMove = validTokens[0];
    let highestScore = -1;

    validTokens.forEach(id => {
        let score = 0;
        const t = gameState.tokens[id];

        if (t.base) {
            score = 40;
        } else {
            let targetPathIndex = -1;

            if (t.homeIndex !== -1) {
                if (t.homeIndex + roll === 5) score = 80;
                else score = 30;
            } else {
                let distanceToEnd = getDistanceToEnd(color, t.pathIndex);
                if (roll > distanceToEnd) {
                    score = 60;
                } else {
                    targetPathIndex = (t.pathIndex + roll) % 52;
                }
            }

            if (targetPathIndex !== -1) {
                if (!SAFE_ZONES.includes(targetPathIndex)) {
                    const tokensAtPos = Object.values(gameState.tokens).filter(o => o.pathIndex === targetPathIndex && o.homeIndex === -1 && !o.base);
                    const hasOpponent = tokensAtPos.some(o => o.color !== color);
                    if (hasOpponent) score = 100;
                }
                if (SAFE_ZONES.includes(targetPathIndex)) score = 50;
            }

            if (score === 0) {
                score = (52 - getDistanceToEnd(color, t.pathIndex));
            }
        }

        score += Math.random() * 5;
        if (score > highestScore) {
            highestScore = score;
            bestMove = id;
        }
    });

    return bestMove;
}

document.getElementById('playAgainBtn').addEventListener('click', () => {
    winMenu.classList.add('hidden');
    initGame();
});

generateBoard(); // Draw board in BG initially
