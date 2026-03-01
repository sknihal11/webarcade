// Game Constants
export const W = 800;
export const H = 600;
export const BALL_RADIUS = 8;
export const PADDLE_WIDTH = 16;
export const PADDLE_HEIGHT = 100;
export const BALL_BASE_SPEED_X = 420;
export const BALL_MAX_SPEED = 850;
export const BALL_ACCEL_FACTOR = 1.07;
export const PADDLE_MIN_Y = PADDLE_HEIGHT / 2 + 10;
export const PADDLE_MAX_Y = H - PADDLE_HEIGHT / 2 - 10;
export const WIN_SCORE = 10;
export const COLLISION_COOLDOWN = 80;

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function checkPaddleCollision(ballX, ballY, paddleX, paddleY, paddleWidth, paddleHeight, ballRadius) {
    const closestX = Math.max(paddleX - paddleWidth / 2, Math.min(ballX, paddleX + paddleWidth / 2));
    const closestY = Math.max(paddleY - paddleHeight / 2, Math.min(ballY, paddleY + paddleHeight / 2));
    const distSq = (ballX - closestX) ** 2 + (ballY - closestY) ** 2;
    return distSq <= ballRadius ** 2;
}

export function calculateBallVelocity(ballY, paddleY, currentSpeedX, paddleHeight, maxSpeed, accelFactor) {
    const newSpeed = Math.min(Math.abs(currentSpeedX) * accelFactor, maxSpeed);
    const relativePos = (ballY - paddleY) / (paddleHeight / 2);
    const bvy = relativePos * newSpeed * 0.45;
    return {
        bvx: newSpeed,
        bvy: Math.max(-newSpeed * 0.55, Math.min(newSpeed * 0.55, bvy))
    };
}

export function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

export function isValidRoomCode(code) {
    return code && /^\d{4}$/.test(code);
}

export function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.error(\`Element with id "\${id}" not found\`);
    }
    return element;
}

export function showScreen(screenId) {
    const screen = getElement(screenId);
    if (screen) {
        screen.classList.remove('hidden');
    }
}

export function hideScreen(screenId) {
    const screen = getElement(screenId);
    if (screen) {
        screen.classList.add('hidden');
    }
}

export function updateScoreDisplay(scoreL, scoreR) {
    const scoreLEl = getElement('scoreL');
    const scoreREl = getElement('scoreR');
    if (scoreLEl) scoreLEl.innerText = scoreL;
    if (scoreREl) scoreREl.innerText = scoreR;
}

export function showError(message, duration = 5000) {
    const errorEl = getElement('connectionError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), duration);
    }
}

export function updateConnectionStatus(connected, mode, playing) {
    const status = getElement('connectionStatus');
    if (!status) return;
    if (mode === 'online' && playing) {
        status.style.display = 'block';
        status.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
        status.textContent = connected ? 'CONNECTED' : 'RECONNECTING...';
    } else {
        status.style.display = 'none';
    }
}
