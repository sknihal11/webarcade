import { W, H, BALL_RADIUS, BALL_BASE_SPEED_X } from './utils.js';

export class Ball {
    constructor(app) {
        this.app = app;
        this.x = W / 2;
        this.y = H / 2;
        this.vx = 0;
        this.vy = 0;
        
        this.graphics = new PIXI.Graphics();
        this.graphics.beginFill(0xffffff);
        this.graphics.drawCircle(0, 0, BALL_RADIUS);
        this.graphics.endFill();
        this.graphics.x = this.x;
        this.graphics.y = this.y;
        
        this.trail = new PIXI.Graphics();
        
        app.stage.addChild(this.trail);
        app.stage.addChild(this.graphics);
    }
    
    reset(direction) {
        this.x = W / 2;
        this.y = H / 2;
        
        const dir = direction || (Math.random() > 0.5 ? 1 : -1);
        this.vx = dir * BALL_BASE_SPEED_X;
        this.vy = (Math.random() * 70 + 70) * (Math.random() > 0.5 ? 1 : -1);
        
        this.trail.clear();
    }
    
    update(dt) {
        const oldX = this.x;
        const oldY = this.y;
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        if (this.y - BALL_RADIUS < 0) {
            this.y = BALL_RADIUS;
            this.vy = Math.abs(this.vy) * 0.98;
        } else if (this.y + BALL_RADIUS > H) {
            this.y = H - BALL_RADIUS;
            this.vy = -Math.abs(this.vy) * 0.98;
        }
        
        this.trail.clear();
        this.trail.lineStyle(BALL_RADIUS * 1.5, 0xffffff, 0.15);
        this.trail.moveTo(oldX, oldY);
        this.trail.lineTo(this.x, this.y);
        
        this.graphics.x = this.x;
        this.graphics.y = this.y;
    }
    
    isOutOfBounds() {
        if (this.x + BALL_RADIUS < 0) {
            return 'right';
        } else if (this.x - BALL_RADIUS > W) {
            return 'left';
        }
        return null;
    }
    
    setState(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.graphics.x = x;
        this.graphics.y = y;
    }
    
    getState() {
        return {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy
        };
    }
}
