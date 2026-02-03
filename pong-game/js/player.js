import { 
    H, 
    PADDLE_WIDTH, 
    PADDLE_HEIGHT, 
    PADDLE_MIN_Y, 
    PADDLE_MAX_Y,
    BALL_RADIUS,
    BALL_MAX_SPEED,
    BALL_ACCEL_FACTOR,
    COLLISION_COOLDOWN,
    checkPaddleCollision,
    calculateBallVelocity,
    clamp
} from './utils.js';

export class Player {
    constructor(app, x, color, side) {
        this.app = app;
        this.x = x;
        this.y = H / 2;
        this.color = color;
        this.side = side;
        this.lastHitTime = 0;
        
        this.graphics = new PIXI.Graphics();
        this.graphics.beginFill(color);
        this.graphics.drawRoundedRect(-PADDLE_WIDTH / 2, -PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT, 4);
        this.graphics.endFill();
        
        this.graphics.beginFill(0xffffff, 0.3);
        this.graphics.drawRoundedRect(-PADDLE_WIDTH / 2 + 2, -PADDLE_HEIGHT / 2 + 2, PADDLE_WIDTH - 4, PADDLE_HEIGHT - 4, 3);
        this.graphics.endFill();
        
        this.graphics.x = x;
        this.graphics.y = this.y;
        
        app.stage.addChild(this.graphics);
    }
    
    setY(y) {
        this.y = clamp(y, PADDLE_MIN_Y, PADDLE_MAX_Y);
        this.graphics.y = this.y;
    }
    
    getY() {
        return this.y;
    }
    
    updateAI(ball, dt) {
        const aiBaseSpeed = 320;
        const aiSpeedBoost = Math.abs(ball.vx) * 0.22;
        const aiSpeed = Math.min(500, aiBaseSpeed + aiSpeedBoost);
        
        const target = ball.x > this.app.screen.width / 2 ? ball.y : H / 2;
        const diff = target - this.y;
        const maxMove = aiSpeed * dt;
        
        if (Math.abs(diff) <= maxMove) {
            this.setY(target);
        } else {
            this.setY(this.y + Math.sign(diff) * maxMove);
        }
    }
    
    checkBallCollision(ball) {
        const now = Date.now();
        
        if (now - this.lastHitTime < COLLISION_COOLDOWN) {
            return false;
        }
        
        const movingToward = (this.side === 'left' && ball.vx < 0) || 
                           (this.side === 'right' && ball.vx > 0);
        if (!movingToward) {
            return false;
        }
        
        if (checkPaddleCollision(ball.x, ball.y, this.x, this.y, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_RADIUS)) {
            this.lastHitTime = now;
            
            const velocity = calculateBallVelocity(
                ball.y, 
                this.y, 
                ball.vx, 
                PADDLE_HEIGHT, 
                BALL_MAX_SPEED, 
                BALL_ACCEL_FACTOR
            );
            
            const direction = this.side === 'left' ? 1 : -1;
            ball.vx = velocity.bvx * direction;
            ball.vy = velocity.bvy;
            
            const pushout = Math.max(BALL_RADIUS + PADDLE_WIDTH / 2 + 5, Math.abs(ball.vx) * 0.03);
            ball.x = (this.side === 'left') ? (this.x + pushout) : (this.x - pushout);
            ball.x = clamp(ball.x, BALL_RADIUS + 5, this.app.screen.width - BALL_RADIUS - 5);
            
            return true;
        }
        
        return false;
    }
}
