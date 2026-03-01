import { Ball } from './ball.js';
import { Player } from './player.js';
import { Network } from './network.js';
import { 
    W, 
    H, 
    WIN_SCORE,
    getElement,
    showScreen,
    hideScreen,
    updateScoreDisplay,
    showError,
    updateConnectionStatus,
    PADDLE_MIN_Y,
    PADDLE_MAX_Y,
    clamp
} from './utils.js';

class PongGame {
    constructor() {
        const oldCanvas = document.querySelector('canvas');
        if (oldCanvas) oldCanvas.remove();
        
        this.app = new PIXI.Application({
            width: W,
            height: H,
            backgroundColor: 0x050505,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            antialias: true
        });
        
        document.body.appendChild(this.app.view);
        
        this.state = {
            playing: false,
            mode: '',
            role: '',
            roomCode: null,
            score: { L: 0, R: 0 }
        };
        
        this.gameStopped = false;
        this.inputY = H / 2;
        this.scaleFactor = 1;
        this.lastScoreUpdate = 0;
        this.eventCleanup = [];
        
        this.ball = null;
        this.playerLeft = null;
        this.playerRight = null;
        this.network = null;
        
        this.initGraphics();
        this.initGameObjects();
        this.initInput();
        this.initUI();
        this.resize();
        
        const resizeHandler = () => this.resize();
        window.addEventListener('resize', resizeHandler);
        this.eventCleanup.push(() => window.removeEventListener('resize', resizeHandler));
        
        window.addEventListener('beforeunload', () => {
            if (this.state.roomCode && this.network) {
                this.network.beaconCleanup(this.state.role, this.state.roomCode);
            }
        });
        
        this.app.ticker.add((delta) => this.loop(delta));
    }
    
    initGraphics() {
        try {
            if (PIXI.filters?.BloomFilter) {
                const quality = window.devicePixelRatio > 1 ? 2 : 3;
                this.app.stage.filters = [
                    new PIXI.filters.BloomFilter({ strength: 0.3, quality, blur: 6 })
                ];
            }
        } catch (e) {
            console.warn('Bloom filter not available');
        }
        
        const net = new PIXI.Graphics();
        net.beginFill(0x333333);
        for (let y = 10; y < H; y += 30) {
            net.drawRect(W / 2 - 1, y, 2, 15);
        }
        net.endFill();
        this.app.stage.addChild(net);
    }
    
    initGameObjects() {
        this.ball = new Ball(this.app);
        this.playerLeft = new Player(this.app, 30, 0xff0055, 'left');
        this.playerRight = new Player(this.app, W - 30, 0x00f3ff, 'right');
        this.network = new Network(this);
    }
    
    initInput() {
        const touchIndicator = getElement('touchIndicator');
        
        const mouseMoveHandler = (e) => {
            if (!this.state.playing) return;
            const rect = this.app.view.getBoundingClientRect();
            const relativeY = (e.clientY - rect.top) / this.scaleFactor;
            this.inputY = clamp(relativeY, PADDLE_MIN_Y, PADDLE_MAX_Y);
        };
        
        window.addEventListener('mousemove', mouseMoveHandler);
        this.eventCleanup.push(() => window.removeEventListener('mousemove', mouseMoveHandler));
        
        const onTouch = (clientY, show = false) => {
            if (!this.state.playing) return;
            const rect = this.app.view.getBoundingClientRect();
            const relativeY = (clientY - rect.top) / this.scaleFactor;
            this.inputY = clamp(relativeY, PADDLE_MIN_Y, PADDLE_MAX_Y);
            
            if (show && touchIndicator) {
                const canvasCenterX = rect.left + (rect.width * this.scaleFactor * 0.5);
                touchIndicator.style.left = canvasCenterX + 'px';
                touchIndicator.style.top = clientY + 'px';
                touchIndicator.classList.add('visible');
            }
        };
        
        const zones = document.querySelectorAll('.touch-zone');
        zones.forEach(zone => {
            const handlers = {
                start: (e) => {
                    e.preventDefault();
                    zone.classList.add('active');
                    for (let i = 0; i < e.touches.length; i++) {
                        onTouch(e.touches[i].clientY, true);
                    }
                },
                move: (e) => {
                    e.preventDefault();
                    if (e.touches.length > 0) {
                        onTouch(e.touches[0].clientY, true);
                    }
                },
                end: (e) => {
                    e.preventDefault();
                    zone.classList.remove('active');
                    if (touchIndicator) touchIndicator.classList.remove('visible');
                }
            };
            
            zone.addEventListener('touchstart', handlers.start, { passive: false });
            zone.addEventListener('touchmove', handlers.move, { passive: false });
            zone.addEventListener('touchend', handlers.end, { passive: false });
            zone.addEventListener('touchcancel', handlers.end, { passive: false });
            
            this.eventCleanup.push(() => {
                zone.removeEventListener('touchstart', handlers.start);
                zone.removeEventListener('touchmove', handlers.move);
                zone.removeEventListener('touchend', handlers.end);
                zone.removeEventListener('touchcancel', handlers.end);
            });
        });
        
        const keyHandler = (e) => {
            if (!this.state.playing) return;
            if (e.key === 'ArrowUp') {
                this.inputY = Math.max(PADDLE_MIN_Y, this.inputY - 20);
            }
            if (e.key === 'ArrowDown') {
                this.inputY = Math.min(PADDLE_MAX_Y, this.inputY + 20);
            }
        };
        
        window.addEventListener('keydown', keyHandler);
        this.eventCleanup.push(() => window.removeEventListener('keydown', keyHandler));
    }
    
    initUI() {
        const btnAI = getElement('btnAI');
        const btnOnline = getElement('btnOnline');
        const btnBack = getElement('btnBack');
        const btnHost = getElement('btnHost');
        const btnJoin = getElement('btnJoin');
        const btnExit = getElement('btnExit');
        const btnCancelHost = getElement('btnCancelHost');
        const codeIn = getElement('codeIn');
        
        if (btnAI) btnAI.onclick = () => this.startAI();
        if (btnOnline) btnOnline.onclick = () => this.showLobby();
        if (btnBack) btnBack.onclick = () => this.hideLobby();
        if (btnHost) btnHost.onclick = () => this.hostGame();
        if (btnJoin) btnJoin.onclick = () => this.joinGame();
        if (btnExit) btnExit.onclick = () => this.manualExit();
        if (btnCancelHost) btnCancelHost.onclick = () => this.cancelHosting();
        
        if (codeIn) {
            codeIn.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.joinGame();
                }
            });
        }
    }
    
    resize() {
        const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
        this.app.view.style.width = `${W * scale}px`;
        this.app.view.style.height = `${H * scale}px`;
        this.scaleFactor = scale;
    }
    
    showLobby() {
        hideScreen('menuScreen');
        showScreen('lobbyScreen');
    }
    
    hideLobby() {
        hideScreen('lobbyScreen');
        showScreen('menuScreen');
        const joinFeedback = getElement('joinFeedback');
        if (joinFeedback) joinFeedback.textContent = '';
        ['btnJoin', 'btnHost'].forEach(id => {
            const btn = getElement(id);
            if (btn) btn.disabled = false;
        });
    }
    
    startAI() {
        this.state = {
            playing: true,
            mode: 'ai',
            role: '',
            roomCode: null,
            score: { L: 0, R: 0 }
        };
        
        this.gameStopped = false;
        updateScoreDisplay(0, 0);
        this.ball.reset();
        
        hideScreen('menuScreen');
        showScreen('gameHud');
        
        const status = getElement('connectionStatus');
        if (status) status.style.display = 'none';
    }
    
    async hostGame() {
        const btn = getElement('btnHost');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        
        try {
            const code = await this.network.createRoom();
            
            this.state.roomCode = code;
            this.state.role = 'host';
            this.state.score = { L: 0, R: 0 };
            this.gameStopped = false;
            
            hideScreen('lobbyMain');
            showScreen('lobbyWait');
            
            const codeDisp = getElement('codeDisp');
            if (codeDisp) codeDisp.innerText = code;
            
        } catch (error) {
            console.error('Host error:', error);
            showError('Failed to create room');
            if (btn) btn.disabled = false;
        }
    }
    
    async joinGame() {
        const codeInput = getElement('codeIn');
        const feedback = getElement('joinFeedback');
        const btn = getElement('btnJoin');
        
        if (!codeInput || !btn) return;
        
        const code = codeInput.value.trim();
        
        if (!code || !/^\d{4}$/.test(code)) {
            if (feedback) feedback.textContent = 'Enter valid 4-digit code';
            return;
        }
        
        if (btn.disabled) return;
        btn.disabled = true;
        if (feedback) feedback.textContent = 'Connecting...';
        
        const timeoutId = setTimeout(() => {
            if (feedback) feedback.textContent = 'Connection timeout';
            btn.disabled = false;
        }, 10000);
        
        try {
            await this.network.joinRoom(code);
            clearTimeout(timeoutId);
            
            this.state.roomCode = code;
            this.state.role = 'guest';
            this.state.score = { L: 0, R: 0 };
            this.state.mode = 'online';
            this.state.playing = true;
            this.gameStopped = false;
            
            updateScoreDisplay(0, 0);
            hideScreen('lobbyScreen');
            showScreen('gameHud');
            updateConnectionStatus(true, 'online', true);
            
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Join error:', error);
            if (feedback) feedback.textContent = error.message || 'Connection failed';
            btn.disabled = false;
        }
    }
    
    async cancelHosting() {
        await this.cleanup();
        hideScreen('lobbyWait');
        showScreen('lobbyMain');
        ['btnJoin', 'btnHost'].forEach(id => {
            const btn = getElement(id);
            if (btn) btn.disabled = false;
        });
    }
    
    async manualExit() {
        await this.cleanup();
        window.location.reload();
    }
    
    loop(delta) {
        if (!this.state.playing) return;
        
        const dt = Math.min(delta / 60, 0.033);
        
        if (this.state.mode === 'ai') {
            this.playerLeft.setY(this.inputY);
            this.playerRight.updateAI(this.ball, dt);
        } else if (this.state.mode === 'online') {
            if (this.state.role === 'host') {
                this.playerLeft.setY(this.inputY);
            } else {
                this.playerRight.setY(this.inputY);
            }
        }
        
        this.ball.update(dt);
        
        if (this.state.mode === 'ai' || (this.state.mode === 'online' && this.state.role === 'host')) {
            this.playerLeft.checkBallCollision(this.ball);
            this.playerRight.checkBallCollision(this.ball);
            
            this.checkScoring();
        } else if (this.state.mode === 'online' && this.state.role === 'guest') {
            this.playerLeft.checkBallCollision(this.ball);
            this.playerRight.checkBallCollision(this.ball);
        }
        
        if (this.state.mode === 'online' && this.state.playing) {
            this.network.sync(this.state.role, {
                ball: this.ball,
                playerLeft: this.playerLeft,
                playerRight: this.playerRight,
                score: this.state.score
            }, dt);
            
            updateConnectionStatus(
                this.network.isConnected(),
                this.state.mode,
                this.state.playing
            );
        }
    }
    
    checkScoring() {
        const now = Date.now();
        if (now - this.lastScoreUpdate < 300) return;
        
        const result = this.ball.isOutOfBounds();
        
        if (result === 'right') {
            this.state.score.R++;
            this.lastScoreUpdate = now;
            this.handleScore(1);
        } else if (result === 'left') {
            this.state.score.L++;
            this.lastScoreUpdate = now;
            this.handleScore(-1);
        }
    }
    
    handleScore(direction) {
        this.ball.reset(direction);
        updateScoreDisplay(this.state.score.L, this.state.score.R);
        
        if (this.state.score.L >= WIN_SCORE || this.state.score.R >= WIN_SCORE) {
            const winner = this.state.score.L > this.state.score.R 
                ? "PLAYER 1 WINS!" 
                : "PLAYER 2 WINS!";
            
            if (this.state.mode === 'online' && this.state.role === 'host') {
                this.network.broadcastGameOver(winner);
                this.stopGame(winner);
                setTimeout(() => this.cleanup(), 1500);
            } else {
                this.stopGame(winner);
            }
        } else if (this.state.mode === 'online' && this.state.role === 'host') {
            this.network.broadcastBallReset(this.ball.getState());
        }
    }
    
    stopGame(reason) {
        if (this.gameStopped) return;
        this.gameStopped = true;
        this.state.playing = false;
        
        this.app.ticker.stop();
        
        if (this.ball && this.ball.trail) {
            this.ball.trail.clear();
        }
        
        hideScreen('gameHud');
        showScreen('overScreen');
        
        const winMsg = getElement('winMsg');
        if (winMsg) winMsg.innerText = reason || "GAME OVER";
        
        const status = getElement('connectionStatus');
        if (status) status.style.display = 'none';
    }
    
    async cleanup() {
        this.eventCleanup.forEach(fn => fn());
        this.eventCleanup = [];
        
        if (this.network) {
            await this.network.cleanup(this.state.role, this.state.roomCode);
        }
        
        this.state.roomCode = null;
        this.state.role = '';
    }
    
    isPlaying() {
        return this.state.playing;
    }
    
    onGuestJoined() {
        this.state.mode = 'online';
        this.state.playing = true;
        updateScoreDisplay(0, 0);
        this.ball.reset();
        
        hideScreen('lobbyScreen');
        showScreen('gameHud');
        updateConnectionStatus(true, 'online', true);
    }
    
    onGameOver(winner) {
        this.stopGame(winner);
    }
    
    onNetworkError(message) {
        this.stopGame(message);
        this.cleanup();
    }
    
    updateOpponentPaddle(y) {
        if (this.state.role === 'host') {
            this.playerRight.setY(y);
        } else {
            this.playerLeft.setY(y);
        }
    }
    
    updateScore(l, r) {
        this.state.score.L = l;
        this.state.score.R = r;
        updateScoreDisplay(l, r);
    }
    
    resetBallFromServer(ballReset) {
        this.ball.setState(ballReset.bx, ballReset.by, ballReset.bvx, ballReset.bvy);
    }
    
    reconcileBallState(serverState) {
        const ballState = this.ball.getState();
        
        this.ball.vx = serverState.bvx;
        this.ball.vy = serverState.bvy;
        
        const dist = Math.abs(ballState.x - serverState.bx) + Math.abs(ballState.y - serverState.by);
        
        if (dist < 30) {
        } else if (dist < 80) {
            this.ball.x += (serverState.bx - ballState.x) * 0.2;
            this.ball.y += (serverState.by - ballState.y) * 0.2;
        } else if (dist < 150) {
            this.ball.x += (serverState.bx - ballState.x) * 0.5;
            this.ball.y += (serverState.by - ballState.y) * 0.5;
        } else {
            this.ball.x = serverState.bx;
            this.ball.y = serverState.by;
        }
    }
}

window.addEventListener('load', () => {
    try {
        new PongGame();
    } catch (error) {
        console.error('Fatal error:', error);
        alert('Failed to start game. Please refresh.');
    }
});
