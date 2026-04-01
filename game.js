/**
 * Neon Dodge – game.js
 * Pure vanilla JavaScript, no dependencies.
 */

/* ─── DOM refs ─────────────────────────────────────────── */
const arena          = document.getElementById('arena');
const player         = document.getElementById('player');
const startScreen    = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const hud            = document.getElementById('hud');
const scoreDisplay   = document.getElementById('score-display');
const levelDisplay   = document.getElementById('level-display');
const finalScore     = document.getElementById('final-score');
const highScoreEl    = document.getElementById('high-score');
const startBtn       = document.getElementById('start-btn');
const restartBtn     = document.getElementById('restart-btn');

/* ─── Constants ────────────────────────────────────────── */
const PLAYER_WIDTH   = 44;   // px  (must match CSS --player-size)
const PLAYER_BOTTOM  = 18;   // px  (CSS bottom offset)
const OBSTACLE_H     = 22;   // px  (CSS --obstacle-h)

/**
 * Spawn timing jitter factor (0–1).
 * Adds up to ±30 % variance to spawn intervals so obstacles
 * don't feel perfectly metronomic.
 */
const SPAWN_JITTER_FACTOR = 0.3;

/**
 * Touch drag sensitivity multiplier.
 * Values > 1 make the player feel more responsive than a raw 1:1 pixel
 * mapping, compensating for finger occlusion on small screens.
 */
const TOUCH_SENSITIVITY_MULTIPLIER = 1.4;

/**
 * Maximum delta-time cap in animation frames (~16 ms each).
 * Prevents the "spiral of death" that occurs when the browser tab
 * loses focus and then resumes, which would cause a huge single-frame
 * jump and false collision or obstacle teleportation.
 */
const MAX_DELTA_FRAMES = 3;

/**
 * Difficulty levels — each entry activates once `score` reaches `minScore`.
 *
 * Design intent / pacing:
 *   Level 1  (0–9)   : gentle intro, slow speed, generous gaps
 *   Level 2  (10–24) : speed bump; player learns to keep moving
 *   Level 3  (25–49) : tighter windows, first real pressure
 *   Level 4  (50–79) : "heat" zone — reaction time becomes the bottleneck
 *   Level 5  (80–119): fast and dense; only experienced players survive
 *   Level 6  (120+)  : maximum difficulty — endurance challenge
 */
const LEVELS = [
  { minScore:   0, speed: 2.4, spawnInterval: 1400, maxObstacles: 3 },
  { minScore:  10, speed: 3.0, spawnInterval: 1150, maxObstacles: 4 },
  { minScore:  25, speed: 3.8, spawnInterval:  950, maxObstacles: 5 },
  { minScore:  50, speed: 4.8, spawnInterval:  780, maxObstacles: 6 },
  { minScore:  80, speed: 5.8, spawnInterval:  640, maxObstacles: 7 },
  { minScore: 120, speed: 7.0, spawnInterval:  520, maxObstacles: 8 },
];

/* Neon colours for obstacles */
const OBSTACLE_COLORS = [
  '#ff00c8', // pink
  '#f7ff00', // yellow
  '#ff6600', // orange
  '#39ff14', // green
  '#bf00ff', // purple
];

/* ─── Sound-ready structure (Web Audio API) ─────────────── */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Play a simple synthesised sound.
 * @param {'dodge'|'gameover'|'levelup'} type
 */
function playSound(type) {
  try {
    const ctx  = getAudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'dodge':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;

      case 'levelup':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.1);
        osc.frequency.setValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;

      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;

      default:
        break;
    }
  } catch (_) {
    // Audio not available — fail silently.
  }
}

/* ─── Game state ────────────────────────────────────────── */
let arenaW        = 0;   // arena width in px (recalculated on resize)
let arenaH        = 0;
let playerX       = 0;   // left edge of player in px

let obstacles     = [];  // array of { el, x, y, w } live obstacles
let score         = 0;
let highScore     = parseInt(localStorage.getItem('neonDodgeHigh') || '0', 10);
let currentLevel  = 0;
let gameRunning   = false;
let animFrameId   = null;
let spawnTimer    = null;
let lastTimestamp = 0;

/* Movement */
const keys = { left: false, right: false };
const PLAYER_SPEED = 5; // px per frame at 60 fps (scaled by delta)

/* Touch drag */
let touchStartX = 0;
let touchLastX  = 0;

/* ─── Initialise arena dimensions ───────────────────────── */
function refreshArenaSize() {
  const rect = arena.getBoundingClientRect();
  arenaW = rect.width;
  arenaH = rect.height;
}

/* ─── Player positioning ─────────────────────────────────── */
function setPlayerX(x) {
  playerX = Math.max(0, Math.min(arenaW - PLAYER_WIDTH, x));
  player.style.left = playerX + 'px';
}

function centrePlayer() {
  setPlayerX((arenaW - PLAYER_WIDTH) / 2);
}

/* ─── Level helper ───────────────────────────────────────── */
function getLevelConfig() {
  let cfg = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (score >= LEVELS[i].minScore) cfg = LEVELS[i];
  }
  return cfg;
}

function getCurrentLevelIndex() {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (score >= LEVELS[i].minScore) idx = i;
  }
  return idx;
}

/* ─── Obstacle management ────────────────────────────────── */
function spawnObstacle() {
  if (!gameRunning) return;

  const cfg = getLevelConfig();
  if (obstacles.length >= cfg.maxObstacles) return;

  const minW = Math.round(arenaW * 0.12);
  const maxW = Math.round(arenaW * 0.38);
  const w    = minW + Math.floor(Math.random() * (maxW - minW));
  const x    = Math.floor(Math.random() * (arenaW - w));
  const color = OBSTACLE_COLORS[Math.floor(Math.random() * OBSTACLE_COLORS.length)];

  const el = document.createElement('div');
  el.className = 'obstacle';
  el.style.cssText = `
    width: ${w}px;
    left: ${x}px;
    top: -${OBSTACLE_H}px;
    background: ${color};
    box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
  `;
  arena.appendChild(el);
  obstacles.push({ el, x, y: -OBSTACLE_H, w });
}

function scheduleSpawn() {
  if (!gameRunning) return;
  const cfg = getLevelConfig();
  // Slight jitter so obstacles don't feel perfectly timed
  const jitter = (Math.random() - 0.5) * cfg.spawnInterval * SPAWN_JITTER_FACTOR;
  spawnTimer = setTimeout(() => {
    spawnObstacle();
    scheduleSpawn();
  }, cfg.spawnInterval + jitter);
}

function removeObstacle(obs) {
  obs.el.remove();
  obstacles = obstacles.filter(o => o !== obs);
}

/* ─── Particle burst ─────────────────────────────────────── */
function spawnParticles(cx, cy, color) {
  const COUNT = 10;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2;
    const dist  = 28 + Math.random() * 24;
    const dx    = Math.round(Math.cos(angle) * dist);
    const dy    = Math.round(Math.sin(angle) * dist);

    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${cx - 3}px;
      top:  ${cy - 3}px;
      background: ${color};
      box-shadow: 0 0 6px ${color};
      --dx: ${dx}px;
      --dy: ${dy}px;
    `;
    arena.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}

/* ─── Collision detection ────────────────────────────────── */
function playerRect() {
  return {
    left:   playerX,
    right:  playerX + PLAYER_WIDTH,
    top:    arenaH - PLAYER_BOTTOM - PLAYER_WIDTH,
    bottom: arenaH - PLAYER_BOTTOM,
  };
}

function checkCollision(obs) {
  const pr   = playerRect();
  const obsB = obs.y + OBSTACLE_H;
  return !(obs.x + obs.w < pr.left ||
           obs.x          > pr.right  ||
           obs.y          > pr.bottom ||
           obsB           < pr.top);
}

/* ─── Score & HUD ────────────────────────────────────────── */
function updateHUD() {
  scoreDisplay.textContent = `Score: ${score}`;
  levelDisplay.textContent = `Level: ${getCurrentLevelIndex() + 1}`;
}

/* ─── Main loop ──────────────────────────────────────────── */
function gameLoop(timestamp) {
  if (!gameRunning) return;

  const dt  = Math.min((timestamp - lastTimestamp) / (1000 / 60), MAX_DELTA_FRAMES);
  lastTimestamp = timestamp;

  const cfg        = getLevelConfig();
  const prevLevel  = getCurrentLevelIndex();

  /* Move player */
  let dx = 0;
  if (keys.left)  dx -= PLAYER_SPEED;
  if (keys.right) dx += PLAYER_SPEED;
  if (dx !== 0) setPlayerX(playerX + dx * dt);

  /* Move obstacles */
  const toRemove = [];
  for (const obs of obstacles) {
    obs.y += cfg.speed * dt;
    obs.el.style.top = obs.y + 'px';

    if (checkCollision(obs)) {
      endGame(obs);
      return;
    }

    if (obs.y > arenaH) {
      toRemove.push(obs);
      score++;
      playSound('dodge');
      updateHUD();

      // Level-up sound?
      const newLevel = getCurrentLevelIndex();
      if (newLevel > prevLevel) {
        playSound('levelup');
      }
    }
  }
  toRemove.forEach(removeObstacle);

  animFrameId = requestAnimationFrame(gameLoop);
}

/* ─── Game lifecycle ─────────────────────────────────────── */
function startGame() {
  refreshArenaSize();
  centrePlayer();

  score        = 0;
  currentLevel = 0;
  gameRunning  = true;
  lastTimestamp = performance.now();

  // Clear previous obstacles
  obstacles.forEach(o => o.el.remove());
  obstacles = [];

  updateHUD();

  startScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  scheduleSpawn();
  animFrameId = requestAnimationFrame(gameLoop);
}

function endGame(collidedObs) {
  gameRunning = false;
  clearTimeout(spawnTimer);
  cancelAnimationFrame(animFrameId);

  playSound('gameover');

  /* Flash arena red */
  arena.classList.add('flash');
  arena.addEventListener('animationend', () => arena.classList.remove('flash'), { once: true });

  /* Particles at player centre */
  const pr = playerRect();
  const cx = (pr.left + pr.right) / 2;
  const cy = (pr.top + pr.bottom) / 2;
  spawnParticles(cx, cy, '#ff00c8');

  /* Update high score */
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('neonDodgeHigh', highScore);
  }

  /* Show game over screen */
  finalScore.textContent   = score;
  highScoreEl.textContent  = highScore;
  hud.classList.add('hidden');

  setTimeout(() => {
    gameoverScreen.classList.remove('hidden');
  }, 600);
}

/* ─── Input handling ─────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
});

document.addEventListener('keyup', e => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

/* Touch controls */
arena.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchLastX  = touchStartX;
}, { passive: true });

arena.addEventListener('touchmove', e => {
  const tx   = e.touches[0].clientX;
  const diff = tx - touchLastX;
  touchLastX = tx;
  setPlayerX(playerX + diff * TOUCH_SENSITIVITY_MULTIPLIER);
}, { passive: true });

/* ─── Buttons ────────────────────────────────────────────── */
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

/* ─── Responsive resize ──────────────────────────────────── */
window.addEventListener('resize', () => {
  if (gameRunning) refreshArenaSize();
});

/* ─── Init: show high score on start screen ─────────────── */
highScoreEl.textContent = highScore;
