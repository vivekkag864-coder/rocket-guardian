const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const hud = document.querySelector(".hud");
const touchControls = document.querySelector(".touch-controls");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resumeButton = document.getElementById("resumeButton");
const restartButton = document.getElementById("restartButton");
const playAgainButton = document.getElementById("playAgainButton");
const difficultySelect = document.getElementById("difficultySelect");
const missionLengthSelect = document.getElementById("missionLengthSelect");
const touchToggle = document.getElementById("touchToggle");
const resultEyebrow = document.getElementById("resultEyebrow");
const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const stick = document.getElementById("stick");
const stickKnob = document.getElementById("stickKnob");
const dashButton = document.getElementById("dashButton");
const healthEl = document.getElementById("rocketHealth");
const scoreEl = document.getElementById("score");
const waveEl = document.getElementById("wave");
const timerEl = document.getElementById("timer");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const touchMove = { x: 0, y: 0, active: false };
const difficultyMap = {
  easy: { spawn: 1.18, speed: 0.86, damage: 0.72, label: "Cadet" },
  normal: { spawn: 1, speed: 1, damage: 1, label: "Guardian" },
  hard: { spawn: 0.78, speed: 1.2, damage: 1.22, label: "Meteor Storm" },
};

const rocket = { x: W / 2, y: H / 2 + 38, r: 38, health: 100 };
const player = { x: W / 2, y: H - 86, r: 18, speed: 245, dash: 0, dashReady: 0 };
let settings = loadSettings();
let obstacles = [];
let sparks = [];
let pickups = [];
let score = 0;
let wave = 1;
let elapsed = 0;
let spawnClock = 0;
let pickupClock = 0;
let running = false;
let paused = false;
let ended = false;
let currentPanel = "main";
let previousPanel = "main";
let last = performance.now();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("rocketGuardianSettings") || "{}");
    return {
      difficulty: saved.difficulty || "normal",
      missionLength: Number(saved.missionLength) || 90,
      touchControls: saved.touchControls !== false,
    };
  } catch {
    return { difficulty: "normal", missionLength: 90, touchControls: true };
  }
}

function saveSettings() {
  localStorage.setItem("rocketGuardianSettings", JSON.stringify(settings));
}

function applySettings() {
  difficultySelect.value = settings.difficulty;
  missionLengthSelect.value = String(settings.missionLength);
  touchToggle.checked = settings.touchControls;
  document.body.classList.toggle("touch-off", !settings.touchControls);
  timerEl.textContent = Math.max(0, Math.ceil(settings.missionLength - elapsed));
}

function showPanel(name) {
  previousPanel = currentPanel;
  currentPanel = name;
  overlay.classList.remove("hidden");
  overlay.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.panel !== name);
  });
  const playing = running && !paused && !ended;
  hud.classList.toggle("hidden", !playing && name === "main");
  pauseButton.classList.toggle("hidden", !playing);
  touchControls.classList.add("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
  pauseButton.classList.toggle("hidden", !running || paused || ended);
  touchControls.classList.remove("hidden");
  hud.classList.remove("hidden");
}

function reset() {
  rocket.health = 100;
  player.x = W / 2;
  player.y = H - 86;
  player.dash = 0;
  player.dashReady = 0;
  obstacles = [];
  sparks = [];
  pickups = [];
  score = 0;
  wave = 1;
  elapsed = 0;
  spawnClock = 0;
  pickupClock = 7;
  running = true;
  paused = false;
  ended = false;
  hideOverlay();
  last = performance.now();
}

function spawnObstacle() {
  const side = Math.floor(Math.random() * 4);
  const margin = 34;
  const from = [
    { x: Math.random() * W, y: -margin },
    { x: W + margin, y: Math.random() * H },
    { x: Math.random() * W, y: H + margin },
    { x: -margin, y: Math.random() * H },
  ][side];
  const dx = rocket.x - from.x;
  const dy = rocket.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const size = 13 + Math.random() * 15;
  const difficulty = difficultyMap[settings.difficulty];
  const speed = (58 + wave * 9 + Math.random() * 38) * difficulty.speed;

  obstacles.push({
    x: from.x,
    y: from.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    r: size,
    spin: Math.random() * 6,
    hp: size > 22 ? 2 : 1,
  });
}

function spawnPickup() {
  pickups.push({
    x: 80 + Math.random() * (W - 160),
    y: 86 + Math.random() * (H - 170),
    r: 12,
    life: 9,
  });
}

function burst(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 170;
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.35 + Math.random() * 0.35,
      color,
    });
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dash() {
  if (running && !paused && player.dashReady <= 0) {
    player.dash = 0.18;
    player.dashReady = 1.15;
    burst(player.x, player.y, "#76f0a0", 8);
  }
}

function hit(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
}

function update(dt) {
  if (!running || paused) return;

  elapsed += dt;
  wave = Math.min(9, 1 + Math.floor(elapsed / 12));
  spawnClock -= dt;
  pickupClock -= dt;
  player.dashReady = Math.max(0, player.dashReady - dt);
  player.dash = Math.max(0, player.dash - dt);

  if (spawnClock <= 0) {
    spawnObstacle();
    spawnClock = Math.max(0.32, 1.05 - wave * 0.075) * difficultyMap[settings.difficulty].spawn;
  }

  if (pickupClock <= 0) {
    spawnPickup();
    pickupClock = 11 + Math.random() * 5;
  }

  let ax = 0;
  let ay = 0;
  if (keys.has("arrowleft") || keys.has("a")) ax -= 1;
  if (keys.has("arrowright") || keys.has("d")) ax += 1;
  if (keys.has("arrowup") || keys.has("w")) ay -= 1;
  if (keys.has("arrowdown") || keys.has("s")) ay += 1;
  if (touchMove.active) {
    ax += touchMove.x;
    ay += touchMove.y;
  }
  const mag = Math.hypot(ax, ay) || 1;
  const speed = player.speed * (player.dash > 0 ? 2.2 : 1);
  player.x = clamp(player.x + (ax / mag) * speed * dt, player.r, W - player.r);
  player.y = clamp(player.y + (ay / mag) * speed * dt, player.r, H - player.r);

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    o.spin += dt * 4;

    if (hit(player, o)) {
      o.hp -= player.dash > 0 ? 2 : 1;
      o.vx += (o.x - player.x) * 4.2;
      o.vy += (o.y - player.y) * 4.2;
      burst(o.x, o.y, "#9ee8ff", 8);
      if (o.hp <= 0) {
        obstacles.splice(i, 1);
        score += player.dash > 0 ? 25 : 15;
        continue;
      }
    }

    if (hit(rocket, o)) {
      obstacles.splice(i, 1);
      rocket.health -= Math.round(o.r * 0.9 * difficultyMap[settings.difficulty].damage);
      burst(o.x, o.y, "#ff7474", 18);
      continue;
    }

    if (o.x < -90 || o.x > W + 90 || o.y < -90 || o.y > H + 90) {
      obstacles.splice(i, 1);
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    if (hit(player, p)) {
      rocket.health = Math.min(100, rocket.health + 18);
      score += 50;
      burst(p.x, p.y, "#76f0a0", 14);
      pickups.splice(i, 1);
    } else if (p.life <= 0) {
      pickups.splice(i, 1);
    }
  }

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) sparks.splice(i, 1);
  }

  score += dt * 2;
  if (rocket.health <= 0) finish(false);
  if (elapsed >= settings.missionLength) finish(true);
}

function finish(won) {
  running = false;
  paused = false;
  ended = true;
  resultEyebrow.textContent = won ? "Mission Complete" : "Mission Failed";
  resultTitle.textContent = won ? "Rocket Launched" : "Rocket Destroyed";
  resultText.textContent = won
    ? `Final score: ${Math.floor(score)}. Difficulty: ${difficultyMap[settings.difficulty].label}.`
    : `Final score: ${Math.floor(score)}. Repair the rocket and try again.`;
  showPanel("result");
}

function pauseGame() {
  if (!running || ended) return;
  paused = true;
  showPanel("pause");
}

function resumeGame() {
  if (!running || ended) return;
  paused = false;
  hideOverlay();
  last = performance.now();
}

function mainMenu() {
  running = false;
  paused = false;
  ended = false;
  showPanel("main");
}

function drawStars() {
  ctx.fillStyle = "#10151d";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = (i * 137.5 + elapsed * 5) % W;
    const y = (i * 71.3) % H;
    ctx.globalAlpha = 0.22 + ((i % 5) * 0.08);
    ctx.fillStyle = "#d8f2ff";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawRocket() {
  const flame = running && !paused ? 12 + Math.sin(elapsed * 18) * 8 : 8;

  ctx.save();
  ctx.translate(rocket.x, rocket.y);
  ctx.fillStyle = "#dbe8f5";
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.quadraticCurveTo(30, -25, 22, 38);
  ctx.lineTo(-22, 38);
  ctx.quadraticCurveTo(-30, -25, 0, -58);
  ctx.fill();

  ctx.fillStyle = "#ff5f67";
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.quadraticCurveTo(17, -40, 20, -20);
  ctx.lineTo(-20, -20);
  ctx.quadraticCurveTo(-17, -40, 0, -58);
  ctx.fill();

  ctx.fillStyle = "#69caff";
  ctx.beginPath();
  ctx.arc(0, -15, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#72839a";
  ctx.beginPath();
  ctx.moveTo(-22, 24);
  ctx.lineTo(-48, 50);
  ctx.lineTo(-18, 42);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, 24);
  ctx.lineTo(48, 50);
  ctx.lineTo(18, 42);
  ctx.fill();

  ctx.fillStyle = "#ffc247";
  ctx.beginPath();
  ctx.moveTo(-12, 40);
  ctx.lineTo(0, 40 + flame);
  ctx.lineTo(12, 40);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = player.dash > 0 ? "#caffd8" : "#76f0a0";
  ctx.beginPath();
  ctx.arc(0, 0, player.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#082015";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-7, -2);
  ctx.lineTo(0, -9);
  ctx.lineTo(9, 8);
  ctx.stroke();

  if (player.dashReady <= 0) {
    ctx.strokeStyle = "rgba(118, 240, 160, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, player.r + 7 + Math.sin(elapsed * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawObstacle(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.spin);
  ctx.fillStyle = o.hp > 1 ? "#b48b72" : "#8d98a5";
  ctx.strokeStyle = "#3b424b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8;
    const radius = o.r * (i % 2 ? 0.72 : 1);
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPickup(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(elapsed * 3);
  ctx.fillStyle = "#76f0a0";
  ctx.fillRect(-5, -14, 10, 28);
  ctx.fillRect(-14, -5, 28, 10);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-16, -16, 32, 32);
  ctx.restore();
}

function render() {
  drawStars();

  ctx.strokeStyle = "rgba(105, 202, 255, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rocket.x, rocket.y, rocket.r + 24, 0, Math.PI * 2);
  ctx.stroke();

  drawRocket();
  pickups.forEach(drawPickup);
  obstacles.forEach(drawObstacle);
  drawPlayer();

  sparks.forEach((s) => {
    ctx.globalAlpha = Math.max(0, s.life * 2);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const health = clamp(rocket.health, 0, 100);
  healthEl.style.width = `${health}%`;
  healthEl.style.background = health < 35 ? "#ff6767" : "";
  scoreEl.textContent = Math.floor(score);
  waveEl.textContent = wave;
  timerEl.textContent = Math.max(0, Math.ceil(settings.missionLength - elapsed));
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === " ") {
    dash();
    event.preventDefault();
  }
  if (key === "enter" && !running) reset();
  if (key === "escape") {
    if (running && !paused) pauseGame();
    else if (running && paused) resumeGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", reset);
pauseButton.addEventListener("click", pauseGame);
resumeButton.addEventListener("click", resumeGame);
restartButton.addEventListener("click", reset);
playAgainButton.addEventListener("click", reset);

document.querySelectorAll("[data-open-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.openPanel;
    if (target === "main") {
      mainMenu();
    } else {
      showPanel(target);
    }
  });
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => {
    showPanel(running && paused ? "pause" : previousPanel === "main" ? "main" : previousPanel);
  });
});

difficultySelect.addEventListener("change", () => {
  settings.difficulty = difficultySelect.value;
  saveSettings();
});

missionLengthSelect.addEventListener("change", () => {
  settings.missionLength = Number(missionLengthSelect.value);
  saveSettings();
  applySettings();
});

touchToggle.addEventListener("change", () => {
  settings.touchControls = touchToggle.checked;
  saveSettings();
  applySettings();
});

dashButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  dash();
});

stick.addEventListener("pointerdown", (event) => {
  stick.setPointerCapture(event.pointerId);
  touchMove.active = true;
  updateStick(event);
});

stick.addEventListener("pointermove", updateStick);

function releaseStick() {
  touchMove.active = false;
  touchMove.x = 0;
  touchMove.y = 0;
  stickKnob.style.transform = "translate(-50%, -50%)";
}

stick.addEventListener("pointerup", releaseStick);
stick.addEventListener("pointercancel", releaseStick);

function updateStick(event) {
  if (!touchMove.active) return;
  const rect = stick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const max = rect.width * 0.32;
  const len = Math.hypot(dx, dy) || 1;
  const limited = Math.min(max, len);
  const nx = dx / len;
  const ny = dy / len;
  touchMove.x = nx * (limited / max);
  touchMove.y = ny * (limited / max);
  stickKnob.style.transform = `translate(calc(-50% + ${nx * limited}px), calc(-50% + ${ny * limited}px))`;
}

applySettings();
showPanel("main");
render();
requestAnimationFrame(loop);
