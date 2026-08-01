'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const gameoverView = document.getElementById('gameover-view');
const pauseView = document.getElementById('pause-view');
const pauseMainPanel = document.getElementById('pause-main-panel');
const pauseControlsPanel = document.getElementById('pause-controls-panel');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const backBtn = document.getElementById('back-btn');
const startLevelSelect = document.getElementById('start-level-select');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const recordsSection = document.getElementById('records-section');
const recordsList = document.getElementById('records-list');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');

const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_RECORDS = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let showingControls = false;
let combo, maxComboThisGame, lastSavedId;

let gridColor;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-grid-line').trim();
  if (typeof current !== 'undefined' && current) draw();
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
}

themeToggleBtn.addEventListener('click', () => {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  setTheme(isLight ? 'dark' : 'light');
});

applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY));
    return raw && typeof raw === 'object'
      ? { bestCombo: raw.bestCombo || 0, maxLines: raw.maxLines || 0 }
      : { bestCombo: 0, maxLines: 0 };
  } catch {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function qualifiesForTop(candidateScore) {
  if (candidateScore <= 0) return false;
  const records = loadRecords();
  return records.length < MAX_RECORDS || candidateScore > records[records.length - 1].score;
}

function renderRecords() {
  const records = loadRecords();
  const stats = loadStats();
  recordsList.innerHTML = '';
  if (records.length === 0) {
    const li = document.createElement('li');
    li.className = 'record-empty';
    li.textContent = 'Sin récords todavía';
    recordsList.appendChild(li);
  } else {
    records.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = 'record-item' + (r.id === lastSavedId ? ' highlight' : '');
      const rank = document.createElement('span');
      rank.className = 'record-rank';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'record-name';
      name.textContent = r.name;
      const sc = document.createElement('span');
      sc.className = 'record-score';
      sc.textContent = r.score.toLocaleString();
      li.append(rank, name, sc);
      recordsList.appendChild(li);
    });
  }
  bestComboEl.textContent = stats.bestCombo;
  maxLinesEl.textContent = stats.maxLines;
}

function saveScore() {
  const name = (playerNameInput.value || '').trim().slice(0, 12) || 'Jugador';
  const records = loadRecords();
  const id = Date.now();
  records.push({ id, name, score, lines });
  records.sort((a, b) => b.score - a.score);
  records.length = Math.min(records.length, MAX_RECORDS);
  saveRecords(records);
  lastSavedId = id;
  nameEntry.classList.add('hidden');
  recordsSection.classList.remove('hidden');
  renderRecords();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  pauseView.classList.add('hidden');
  gameoverView.classList.remove('hidden');
  restartBtn.textContent = 'Reiniciar';

  const stats = loadStats();
  if (maxComboThisGame > stats.bestCombo) stats.bestCombo = maxComboThisGame;
  if (lines > stats.maxLines) stats.maxLines = lines;
  saveStats(stats);

  lastSavedId = null;
  if (qualifiesForTop(score)) {
    nameEntry.classList.remove('hidden');
    recordsSection.classList.add('hidden');
    playerNameInput.value = '';
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    nameEntry.classList.add('hidden');
    recordsSection.classList.remove('hidden');
    renderRecords();
  }
  overlay.classList.remove('hidden');
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  nameEntry.classList.add('hidden');
  recordsSection.classList.remove('hidden');
  lastSavedId = null;
  renderRecords();
  overlay.classList.remove('hidden');
}

function showPauseMainPanel() {
  showingControls = false;
  pauseControlsPanel.classList.add('hidden');
  pauseMainPanel.classList.remove('hidden');
}

function showPauseControlsPanel() {
  showingControls = true;
  pauseMainPanel.classList.add('hidden');
  pauseControlsPanel.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    showPauseMainPanel();
    overlay.classList.add('hidden');
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    showPauseMainPanel();
    gameoverView.classList.add('hidden');
    pauseView.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxComboThisGame = 0;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  showPauseMainPanel();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') {
    togglePause();
    return;
  }
  if (e.code === 'Escape') {
    if (gameOver) return;
    if (paused && showingControls) { showPauseMainPanel(); return; }
    togglePause();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
pauseRestartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
showControlsBtn.addEventListener('click', showPauseControlsPanel);
backBtn.addEventListener('click', showPauseMainPanel);
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

startLevelSelect.value = String(startLevel);

saveScoreBtn.addEventListener('click', saveScore);

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScore();
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Seguro que quieres borrar todos los récords?')) return;
  localStorage.removeItem(RECORDS_KEY);
  localStorage.removeItem(STATS_KEY);
  lastSavedId = null;
  renderRecords();
});

showStartScreen();
