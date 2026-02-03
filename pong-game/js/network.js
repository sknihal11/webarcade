import { db, firebaseConfig } from '../lib/firebase.js';
import { ref, set, onValue, update, remove, get, onDisconnect, off } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { generateRoomCode, isValidRoomCode, PADDLE_MIN_Y, PADDLE_MAX_Y } from './utils.js';

export class Network {
    constructor(game) {
        this.game = game;
        this.roomRef = null;
        this.roomListener = null;
        this.isCleaningUp = false;
        this.lastNetSync = 0;
        this.lastServerUpdate = Date.now();
        this.lastHeartbeat = Date.now();
    }
    
    async createRoom() {
        let code;
        let attempts = 0;
        
        while (attempts < 10) {
            code = generateRoomCode();
            try {
                const exists = await get(ref(db, 'rooms/' + code));
                if (!exists.exists()) break;
            } catch (e) {
                break;
            }
            attempts++;
        }
        
        if (attempts >= 10) {
            throw new Error('Failed to create room');
        }
        
        this.roomRef = ref(db, 'rooms/' + code);
        
        await set(this.roomRef, {
            h: true,
            status: 'waiting',
            created: Date.now()
        });
        
        onDisconnect(this.roomRef).remove();
        
        this.roomListener = onValue(this.roomRef, (snap) => {
            if (this.isCleaningUp || !this.game.isPlaying()) return;
            
            const data = snap.val();
            if (!data) return;
            
            this.handleHostUpdate(data);
        }, (error) => {
            if (!this.game.isPlaying()) return;
            console.error('Host error:', error);
            this.game.onNetworkError('Connection lost');
        });
        
        return code;
    }
    
    async joinRoom(code) {
        if (!isValidRoomCode(code)) {
            throw new Error('Invalid room code');
        }
        
        this.roomRef = ref(db, 'rooms/' + code);
        const snap = await get(this.roomRef);
        
        if (!snap.exists()) {
            throw new Error('Room not found');
        }
        
        const roomData = snap.val();
        
        if (roomData.g || roomData.status === 'playing') {
            throw new Error('Room is full');
        }
        
        if (roomData.gameOver) {
            throw new Error('Game already ended');
        }
        
        await update(this.roomRef, { g: true });
        onDisconnect(ref(db, 'rooms/' + code + '/g')).remove();
        
        this.roomListener = onValue(this.roomRef, (snap) => {
            if (this.isCleaningUp || !this.game.isPlaying()) return;
            
            const data = snap.val();
            if (!data) {
                this.game.onNetworkError('Host disconnected');
                return;
            }
            
            this.handleGuestUpdate(data);
        }, (error) => {
            if (!this.game.isPlaying()) return;
            console.error('Guest error:', error);
            this.game.onNetworkError('Connection lost');
        });
        
        return code;
    }
    
    handleHostUpdate(data) {
        if (data.g && !this.game.isPlaying() && data.status === 'waiting') {
            update(this.roomRef, { status: 'playing' }).catch(() => {});
            this.game.onGuestJoined();
        }
        
        if (data.gameOver && data.winner && this.game.isPlaying()) {
            this.game.onGameOver(data.winner);
            setTimeout(() => this.cleanup(), 1500);
            return;
        }
        
        if (this.game.isPlaying() && !data.g && !data.gameOver) {
            this.game.onNetworkError('Opponent left');
            this.cleanup();
            return;
        }
        
        if (typeof data.gy === 'number' && !isNaN(data.gy) && this.game.isPlaying()) {
            const validY = Math.max(PADDLE_MIN_Y, Math.min(PADDLE_MAX_Y, data.gy));
            this.game.updateOpponentPaddle(validY);
            this.lastServerUpdate = Date.now();
        }
        
        if (data.gLastUpdate) {
            this.lastHeartbeat = Date.now();
        }
    }
    
    handleGuestUpdate(data) {
        if (data.gameOver && data.winner) {
            this.game.onGameOver(data.winner);
            return;
        }
        
        if (data.ballReset) {
            if (typeof data.ballReset.bx === 'number' && !isNaN(data.ballReset.bx)) {
                this.game.resetBallFromServer(data.ballReset);
            }
        }
        
        if (typeof data.hy === 'number' && !isNaN(data.hy)) {
            const validY = Math.max(PADDLE_MIN_Y, Math.min(PADDLE_MAX_Y, data.hy));
            this.game.updateOpponentPaddle(validY);
        }
        
        if (data.sc && typeof data.sc.L === 'number' && typeof data.sc.R === 'number') {
            this.game.updateScore(data.sc.L, data.sc.R);
        }
        
        if (typeof data.bx === 'number' && !isNaN(data.bx) &&
            typeof data.bvx === 'number' && !isNaN(data.bvx)) {
            this.game.reconcileBallState({
                bx: data.bx,
                by: data.by,
                bvx: data.bvx,
                bvy: data.bvy
            });
            
            this.lastServerUpdate = Date.now();
        }
        
        if (data.hostHeartbeat) {
            this.lastHeartbeat = Date.now();
        }
    }
    
    sync(role, state, dt) {
        if (!this.roomRef || this.isCleaningUp) return;
        
        const now = Date.now();
        const syncInterval = 16;
        
        if (now - this.lastNetSync < syncInterval) return;
        this.lastNetSync = now;
        
        try {
            if (role === 'host') {
                update(this.roomRef, {
                    bx: Math.round(state.ball.x),
                    by: Math.round(state.ball.y),
                    bvx: Math.round(state.ball.vx),
                    bvy: Math.round(state.ball.vy),
                    hy: Math.round(state.playerLeft.y),
                    sc: state.score,
                    hostHeartbeat: now
                }).catch(() => {});
            } else {
                update(this.roomRef, {
                    gy: Math.round(state.playerRight.y),
                    gLastUpdate: now
                }).catch(() => {});
            }
        } catch (e) {
            console.error('Sync error:', e);
        }
    }
    
    broadcastBallReset(ballState) {
        if (!this.roomRef || this.isCleaningUp) return;
        
        update(this.roomRef, {
            ballReset: {
                bx: ballState.x,
                by: ballState.y,
                bvx: ballState.vx,
                bvy: ballState.vy
            }
        }).catch(() => {});
    }
    
    broadcastGameOver(winner) {
        if (!this.roomRef || this.isCleaningUp) return;
        
        update(this.roomRef, {
            gameOver: true,
            winner: winner
        }).catch(() => {});
    }
    
    isConnected() {
        const now = Date.now();
        const timeSinceUpdate = now - this.lastServerUpdate;
        const timeSinceHeartbeat = now - this.lastHeartbeat;
        return timeSinceUpdate < 2000 || timeSinceHeartbeat < 2000;
    }
    
    async cleanup(role, roomCode) {
        if (this.isCleaningUp) return;
        this.isCleaningUp = true;
        
        if (this.roomRef) {
            try {
                off(this.roomRef);
            } catch (e) {}
            this.roomListener = null;
            this.roomRef = null;
        }
        
        if (roomCode) {
            try {
                if (role === 'host') {
                    await remove(ref(db, 'rooms/' + roomCode));
                } else if (role === 'guest') {
                    await update(ref(db, 'rooms/' + roomCode), { g: null });
                }
            } catch (e) {}
        }
        
        this.isCleaningUp = false;
    }
    
    beaconCleanup(role, roomCode) {
        if (!roomCode) return;
        
        const url = role === 'host'
            ? `${firebaseConfig.databaseURL}/rooms/${roomCode}.json`
            : `${firebaseConfig.databaseURL}/rooms/${roomCode}/g.json`;
        
        if (navigator.sendBeacon) {
            navigator.sendBeacon(url, JSON.stringify(null));
        }
    }
}
