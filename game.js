(function(){
    // ---------- CANVAS ----------
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // ---------- GAME DIMENSIONS ----------
    const W = 900, H = 600;
    canvas.width = W;
    canvas.height = H;
    
    // ---------- SHIP ----------
    const SHIP_RADIUS = 16;
    let ship = { x: W/2, y: H/2 };
    
    // ---------- ASTEROIDS ----------
    let asteroids = [];
    const BASE_ASTEROID_COUNT = 4;
    const MAX_ASTEROIDS = 18;
    let currentMaxAsteroids = BASE_ASTEROID_COUNT;
    
    const ASTEROID_TYPES = [
        { radius: 12, points: 30, speedMult: 1.3, color: '#b87333' },
        { radius: 22, points: 20, speedMult: 0.95, color: '#8b5a2b' },
        { radius: 32, points: 10, speedMult: 0.7, color: '#6b4c3b' }
    ];
    
    // ---------- POWERUPS ----------
    let powerups = [];
    const POWERUP_TYPES = [
        { type: 'slow', color: '#3b82f6', icon: '⏪', duration: 4000, effect: 'slow', label: 'TIME SLOW' },
        { type: 'shield', color: '#a855f7', icon: '🛡️', duration: 5000, effect: 'shield', label: 'SHIELD' },
        { type: 'clear', color: '#f97316', icon: '💥', duration: 0, effect: 'clear', label: 'NOVA' }
    ];
    
    let activeShield = false;
    let shieldEndTime = 0;
    let slowMotionActive = false;
    let slowMotionEndTime = 0;
    let gameRunning = true;
    let invincibleFrames = 0;
    let frameCounter = 0;
    let score = 0;
    let bestScore = 0;
    let difficultyTimer = 0;
    let powerupSpawnCooldown = 0;
    let frameScoreAcc = 0;
    
    // Load best score
    try {
        const saved = localStorage.getItem('cosmicDebrisBest');
        if(saved && !isNaN(parseInt(saved))) bestScore = parseInt(saved);
    } catch(e) { }
    document.getElementById('bestValue').innerText = bestScore;
    
    function updateUI() {
        document.getElementById('scoreValue').innerText = Math.floor(score);
        if(score > bestScore) {
            bestScore = Math.floor(score);
            document.getElementById('bestValue').innerText = bestScore;
            localStorage.setItem('cosmicDebrisBest', bestScore);
        }
    }
    
    function getCurrentSpeedMultiplier() {
        if(slowMotionActive) return 0.45;
        return 1.0;
    }
    
    function spawnAsteroid(avoidShip = true) {
        const typeIdx = Math.floor(Math.random() * ASTEROID_TYPES.length);
        const type = ASTEROID_TYPES[typeIdx];
        let radius = type.radius;
        let side = Math.floor(Math.random() * 4);
        let x, y;
        const padding = 45;
        
        if(side === 0) { x = -padding; y = Math.random() * H; }
        else if(side === 1) { x = W + padding; y = Math.random() * H; }
        else if(side === 2) { x = Math.random() * W; y = -padding; }
        else { x = Math.random() * W; y = H + padding; }
        
        let targetX = W/2 + (Math.random() - 0.5) * 180;
        let targetY = H/2 + (Math.random() - 0.5) * 180;
        let dx = targetX - x;
        let dy = targetY - y;
        let len = Math.hypot(dx, dy);
        if(len < 0.01) len = 1;
        dx /= len;
        dy /= len;
        
        const angleVar = (Math.random() - 0.5) * 1.2;
        const cos = Math.cos(angleVar);
        const sin = Math.sin(angleVar);
        let finalDx = dx * cos - dy * sin;
        let finalDy = dx * sin + dy * cos;
        
        const baseSpeed = 1.2 + Math.random() * 1.1;
        let speed = baseSpeed * type.speedMult;
        
        return {
            x, y, radius: radius,
            vx: finalDx * speed,
            vy: finalDy * speed,
            points: type.points,
            color: type.color,
            typeIdx: typeIdx
        };
    }
    
    function initAsteroids(count) {
        asteroids = [];
        for(let i=0; i<count; i++) {
            let newRock = spawnAsteroid(true);
            let attempts = 0;
            while(Math.hypot(newRock.x - ship.x, newRock.y - ship.y) < SHIP_RADIUS + newRock.radius + 35 && attempts < 15) {
                newRock = spawnAsteroid(false);
                attempts++;
            }
            asteroids.push(newRock);
        }
    }
    
    function spawnPowerup() {
        if(!gameRunning) return;
        const typeIdx = Math.floor(Math.random() * POWERUP_TYPES.length);
        const pType = POWERUP_TYPES[typeIdx];
        let margin = 40;
        let x = margin + Math.random() * (W - 2*margin);
        let y = margin + Math.random() * (H - 2*margin);
        
        if(Math.hypot(x - ship.x, y - ship.y) < SHIP_RADIUS + 18) {
            x = Math.min(W-30, Math.max(30, ship.x + (Math.random() - 0.5)*100));
            y = Math.min(H-30, Math.max(30, ship.y + (Math.random() - 0.5)*100));
        }
        
        powerups.push({
            x, y, radius: 13,
            type: pType.type,
            color: pType.color,
            icon: pType.icon,
            duration: pType.duration,
            effect: pType.effect,
            lifetime: Date.now()
        });
    }
    
    function applyPowerup(p) {
        if(p.effect === 'slow') {
            slowMotionActive = true;
            slowMotionEndTime = Date.now() + p.duration;
        } 
        else if(p.effect === 'shield') {
            activeShield = true;
            shieldEndTime = Date.now() + p.duration;
        }
        else if(p.effect === 'clear') {
            const cleared = asteroids.length;
            score += cleared * 45;
            asteroids = [];
            updateUI();
        }
    }
    
    function updatePowerupTimers() {
        const now = Date.now();
        if(activeShield && now > shieldEndTime) activeShield = false;
        if(slowMotionActive && now > slowMotionEndTime) slowMotionActive = false;
    }
    
    function handleCollisions() {
        if(!gameRunning) return;
        for(let i=0; i<asteroids.length; i++) {
            const a = asteroids[i];
            const dist = Math.hypot(ship.x - a.x, ship.y - a.y);
            const threshold = SHIP_RADIUS + a.radius;
            if(dist < threshold) {
                if(activeShield) {
                    asteroids.splice(i,1);
                    i--;
                    score += Math.floor(a.points * 0.7);
                    updateUI();
                    continue;
                }
                if(invincibleFrames <= 0) {
                    gameRunning = false;
                    return;
                }
            }
        }
    }
    
    function updateAsteroids() {
        const speedFactor = getCurrentSpeedMultiplier();
        for(let i=0; i<asteroids.length; i++) {
            const a = asteroids[i];
            a.x += a.vx * speedFactor;
            a.y += a.vy * speedFactor;
            const marginBig = 200;
            if(a.x < -marginBig || a.x > W+marginBig || a.y < -marginBig || a.y > H+marginBig) {
                asteroids.splice(i,1);
                i--;
            }
        }
        
        while(asteroids.length < currentMaxAsteroids && gameRunning) {
            let newRock = spawnAsteroid(true);
            if(Math.hypot(newRock.x - ship.x, newRock.y - ship.y) < SHIP_RADIUS + newRock.radius + 25) {
                newRock = spawnAsteroid(false);
            }
            asteroids.push(newRock);
        }
    }
    
    function updatePowerups() {
        for(let i=0; i<powerups.length; i++) {
            const p = powerups[i];
            p.y += Math.sin(Date.now() * 0.005 + i) * 0.2;
            p.x += Math.cos(Date.now() * 0.004 + i) * 0.15;
            
            const distToShip = Math.hypot(ship.x - p.x, ship.y - p.y);
            if(distToShip < SHIP_RADIUS + p.radius) {
                applyPowerup(p);
                powerups.splice(i,1);
                i--;
                continue;
            }
            
            if(Date.now() - p.lifetime > 12000) {
                powerups.splice(i,1);
                i--;
            }
        }
    }
    
    function trySpawnPowerup() {
        if(!gameRunning) return;
        if(powerupSpawnCooldown > 0) {
            powerupSpawnCooldown--;
            return;
        }
        if(asteroids.length > 2 && Math.random() < 0.008 && powerups.length < 3) {
            spawnPowerup();
            powerupSpawnCooldown = 90 + Math.floor(Math.random() * 70);
        }
    }
    
    function updateDifficulty() {
        if(!gameRunning) return;
        difficultyTimer++;
        if(difficultyTimer > 150) {
            difficultyTimer = 0;
            if(currentMaxAsteroids < MAX_ASTEROIDS) {
                currentMaxAsteroids = Math.min(MAX_ASTEROIDS, currentMaxAsteroids + 1);
            }
        }
        let scoreThreshold = Math.floor(score / 400);
        let dynamicCap = BASE_ASTEROID_COUNT + Math.min(MAX_ASTEROIDS - BASE_ASTEROID_COUNT, scoreThreshold);
        if(dynamicCap > currentMaxAsteroids) currentMaxAsteroids = Math.min(MAX_ASTEROIDS, dynamicCap);
    }
    
    function addSurvivalScore() {
        if(!gameRunning) return;
        frameScoreAcc += 0.12;
        if(frameScoreAcc >= 1) {
            let add = Math.floor(frameScoreAcc);
            score += add;
            frameScoreAcc -= add;
            updateUI();
        }
    }
    
    function updateInvincibility() {
        if(invincibleFrames > 0) invincibleFrames--;
    }
    
    function resetGame() {
        gameRunning = true;
        score = 0;
        frameScoreAcc = 0;
        currentMaxAsteroids = BASE_ASTEROID_COUNT;
        asteroids = [];
        powerups = [];
        activeShield = false;
        slowMotionActive = false;
        invincibleFrames = 45;
        ship.x = W/2;
        ship.y = H/2;
        updateUI();
        shieldEndTime = 0;
        slowMotionEndTime = 0;
        difficultyTimer = 0;
        powerupSpawnCooldown = 20;
        initAsteroids(BASE_ASTEROID_COUNT);
    }
    
    function handleMove(clientX, clientY) {
        if(!gameRunning) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let canvasX = (clientX - rect.left) * scaleX;
        let canvasY = (clientY - rect.top) * scaleY;
        canvasX = Math.min(W - SHIP_RADIUS - 2, Math.max(SHIP_RADIUS + 2, canvasX));
        canvasY = Math.min(H - SHIP_RADIUS - 2, Math.max(SHIP_RADIUS + 2, canvasY));
        ship.x = canvasX;
        ship.y = canvasY;
    }
    
    function onPointer(e) {
        e.preventDefault();
        const pos = e.touches ? e.touches[0] : e;
        handleMove(pos.clientX, pos.clientY);
    }
    
    canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
    canvas.addEventListener('touchmove', onPointer, { passive: false });
    canvas.addEventListener('touchstart', onPointer, { passive: false });
    
    document.getElementById('resetButton').addEventListener('click', () => resetGame());
    
    // Drawing functions
    function drawStars() {
        for(let i=0; i<300; i++) {
            let sx = (i * 131) % W;
            let sy = (i * 253) % H;
            ctx.fillStyle = `rgba(255,240,200,${0.3+Math.sin(frameCounter*0.02+i)*0.2})`;
            ctx.fillRect(sx, sy, 2, 2);
        }
    }
    
    function drawShip() {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, SHIP_RADIUS-2, 0, Math.PI*2);
        ctx.fillStyle = '#2dd4bf30';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, SHIP_RADIUS-3, 0, Math.PI*2);
        ctx.fillStyle = '#4f9da6';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ship.x-2, ship.y-2, 4, 0, Math.PI*2);
        ctx.fillStyle = '#b9f6ff';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ship.x-3, ship.y-3, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#0ff8f0';
        ctx.beginPath();
        ctx.ellipse(ship.x+3, ship.y-2, 4, 5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ship.x+4, ship.y-3, 1.5, 0, Math.PI*2);
        ctx.fill();
        
        if(activeShield) {
            ctx.beginPath();
            ctx.arc(ship.x, ship.y, SHIP_RADIUS+6, 0, Math.PI*2);
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 3;
            ctx.setLineDash([4,8]);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(ship.x, ship.y, SHIP_RADIUS+8, 0, Math.PI*2);
            ctx.strokeStyle = '#f0abfc';
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }
    
    function drawAsteroids() {
        for(let a of asteroids) {
            ctx.beginPath();
            ctx.arc(a.x, a.y, a.radius-2, 0, Math.PI*2);
            ctx.fillStyle = a.color;
            ctx.fill();
            ctx.fillStyle = '#d9b48b';
            ctx.font = `${Math.floor(a.radius*0.7)}px monospace`;
            ctx.fillText("⛰️", a.x-9, a.y-5);
        }
    }
    
    function drawPowerups() {
        for(let p of powerups) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius-1, 0, Math.PI*2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.font = `bold 18px monospace`;
            ctx.fillStyle = 'white';
            ctx.shadowBlur = 3;
            ctx.fillText(p.icon, p.x-11, p.y+8);
            ctx.shadowBlur = 0;
        }
    }
    
    function drawUItext() {
        if(slowMotionActive) {
            ctx.font = "bold 18monospace";
            ctx.fillStyle = "#7aa2f7";
            ctx.fillText("⏪ TIME SLOW", 20, 50);
        }
        if(activeShield) {
            ctx.font = "bold 18monospace";
            ctx.fillStyle = "#e0aaff";
            ctx.fillText("🛡️ SHIELD ACTIVE", 20, 85);
        }
        if(!gameRunning) {
            ctx.font = "800 42monospace";
            ctx.fillStyle = "#ffb347";
            ctx.fillText("💀 GAME OVER", W/2-120, H/2-40);
            ctx.font = "18monospace";
            ctx.fillStyle = "#aaccff";
            ctx.fillText("click RESTART to fly again", W/2-135, H/2+25);
        }
    }
    
    function draw() {
        ctx.clearRect(0,0,W,H);
        drawStars();
        drawAsteroids();
        drawPowerups();
        drawShip();
        drawUItext();
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 22, 0, Math.PI*2);
        ctx.strokeStyle = '#2dd4bf66';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        frameCounter++;
    }
    
    function gameUpdate() {
        if(gameRunning) {
            updatePowerupTimers();
            updateInvincibility();
            updateAsteroids();
            updatePowerups();
            handleCollisions();
            addSurvivalScore();
            updateDifficulty();
            trySpawnPowerup();
        }
    }
    
    function animate() {
        gameUpdate();
        draw();
        requestAnimationFrame(animate);
    }
    
    resetGame();
    animate();
})();