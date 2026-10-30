"use strict";

// GROWTH CURVE: tune these three values to change how fish grow.
// size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (1 - e^(-points / K))
const MIN_SIZE = 46;
const MAX_SIZE = 142;
const K = 60;

const STORAGE_KEY = "finfriends.tank.v1";
const DEFAULT_COLORS = [
  "#FF8E7A", "#FFD166", "#7EE0B2", "#75C9F1",
  "#B9A7F2", "#F49AC1", "#A6D96A", "#FFAB6B",
  "#65D5D0", "#E7A6E0", "#9BB7FF", "#C6D672"
];
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = reducedMotionQuery.matches;
const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const deepClone = (value) => JSON.parse(JSON.stringify(value));
let idCounter = 0;

function uniqueId() {
  idCounter += 1;
  return `group-${Date.now().toString(36)}-${idCounter}`;
}

function defaultGroup(index) {
  return { id: uniqueId(), name: `Group ${index + 1}`, color: DEFAULT_COLORS[index % DEFAULT_COLORS.length], points: 0 };
}

function defaultState() {
  return { version: 1, groups: [0, 1, 2].map(defaultGroup), settings: { sound: false } };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function normalizeState(candidate) {
  if (!candidate || !Array.isArray(candidate.groups) || candidate.groups.length === 0) {
    throw new Error("This file does not contain any groups.");
  }
  const usedIds = new Set();
  const groups = candidate.groups.slice(0, 12).map((group, index) => {
    let id = typeof group.id === "string" && group.id ? group.id.slice(0, 80) : uniqueId();
    while (usedIds.has(id)) id = uniqueId();
    usedIds.add(id);
    const color = typeof group.color === "string" && /^#[0-9a-f]{6}$/i.test(group.color)
      ? group.color.toUpperCase() : DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    const points = clamp(Math.floor(Number(group.points) || 0), 0, 999999);
    const rawName = typeof group.name === "string" ? group.name.trim() : "";
    return { id, name: (rawName || `Group ${index + 1}`).slice(0, 24), color, points };
  });
  return {
    version: 1,
    groups,
    settings: { sound: Boolean(candidate.settings && candidate.settings.sound) }
  };
}

let storageAvailable = true;
let storageWarningShown = false;

function readSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: defaultState(), hadSaved: false };
    return { data: normalizeState(JSON.parse(raw)), hadSaved: true };
  } catch (error) {
    storageAvailable = false;
    return { data: defaultState(), hadSaved: false };
  }
}

const loaded = readSavedState();
let state = loaded.data;
let hasStarted = loaded.hadSaved;
let testMode = false;
let testSnapshot = null;
let testRunning = false;
let testAccumulator = 0;
let toastTimer = 0;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

function saveState() {
    if (testMode) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
      return true;
    } catch (error) {
      storageAvailable = false;
      if (!storageWarningShown) {
        showToast("Saving is unavailable here. Use Export to keep a backup.");
        storageWarningShown = true;
      }
      return false;
    }
}

function sizeForPoints(points) {
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (1 - Math.exp(-points / K));
}

function growthLevel(points) {
  return Math.floor((sizeForPoints(points) - MIN_SIZE) / (MAX_SIZE - MIN_SIZE) * 4);
}

// ---------- Optional synthesized sound (off by default) ----------
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function playTone(frequency, endFrequency, duration, volume, delay = 0) {
  if (!state.settings.sound) return;
  const audio = getAudioContext();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playBubble() {
  playTone(620, 310, 0.11, 0.07);
}

function playChime() {
  playTone(523, 525, 0.24, 0.055);
  playTone(659, 661, 0.28, 0.05, 0.09);
  playTone(784, 786, 0.32, 0.045, 0.18);
}

function updateSoundButton() {
  const button = $("soundButton");
  const enabled = state.settings.sound;
  button.innerHTML = `<svg><use href="#i-${enabled ? "volume" : "mute"}"></use></svg>`;
  button.setAttribute("aria-label", enabled ? "Turn sound off" : "Turn sound on");
  button.title = enabled ? "Sound on" : "Sound off";
}

// ---------- Setup and teacher controls ----------
function setGroupCount(count) {
  const nextCount = clamp(Math.round(Number(count) || 1), 1, 12);
  while (state.groups.length < nextCount) state.groups.push(defaultGroup(state.groups.length));
  if (state.groups.length > nextCount) state.groups.length = nextCount;
  $("groupCount").value = nextCount;
  renderSetupList();
}

function renderSetupList() {
  $("groupSetupList").innerHTML = state.groups.map((group, index) => `
    <div class="setup-group-row" data-group-id="${escapeHtml(group.id)}">
      <span class="setup-group-number">${String(index + 1).padStart(2, "0")}</span>
      <input type="text" maxlength="24" value="${escapeHtml(group.name)}" aria-label="Name for group ${index + 1}" data-field="name">
      <input type="color" value="${group.color}" aria-label="Color for group ${index + 1}" data-field="color">
    </div>
  `).join("");
}

function renderGroupControls() {
  $("groupControls").innerHTML = state.groups.map((group, index) => `
    <section class="group-card" data-group-id="${escapeHtml(group.id)}" style="--group-color:${group.color}">
      <div class="group-card-heading">
        <span class="group-color-dot" style="background:${group.color}"></span>
        <span class="group-card-title" title="${escapeHtml(group.name)}">${index + 1}. ${escapeHtml(group.name)}</span>
        <span class="group-points">${group.points} pts</span>
      </div>
      <div class="point-buttons">
        <button class="minus-button" type="button" data-minus aria-label="Remove 1 point from ${escapeHtml(group.name)}" title="Minus 1 point"><svg><use href="#i-minus"></use></svg></button>
        <button class="point-button" type="button" data-add="1">+1</button>
        <button class="point-button" type="button" data-add="5">+5</button>
        <button class="point-button" type="button" data-add="10">+10</button>
      </div>
      <form class="custom-point-form">
        <input type="number" min="1" max="999" step="1" inputmode="numeric" placeholder="Custom amount" aria-label="Custom points for ${escapeHtml(group.name)}">
        <button class="custom-add" type="submit" aria-label="Add custom points to ${escapeHtml(group.name)}"><svg><use href="#i-plus"></use></svg></button>
      </form>
    </section>
  `).join("");
  updateScoreUI();
  requestAnimationFrame(updatePlayBounds);
}

function updateScoreUI() {
  state.groups.forEach((group, index) => {
    const card = $("groupControls").children[index];
    if (card) card.querySelector(".group-points").textContent = `${group.points} pts`;
  });
  const total = state.groups.reduce((sum, group) => sum + group.points, 0);
  $("totalPointsLabel").textContent = `${total.toLocaleString()} ${total === 1 ? "point" : "points"}`;
  $("groupCountLabel").textContent = `${state.groups.length} ${state.groups.length === 1 ? "group" : "groups"}`;
  if (testMode) drawGrowthChart();
}

function applySetup() {
  setGroupCount($("groupCount").value);
  state.groups.forEach((group, index) => {
    group.name = group.name.trim().slice(0, 24) || `Group ${index + 1}`;
  });
  hasStarted = true;
  $("setupScreen").hidden = true;
  $("closeSetupButton").hidden = false;
  syncFish(false);
  renderGroupControls();
  saveState();
}

function openSetup() {
  $("groupCount").value = state.groups.length;
  renderSetupList();
  $("closeSetupButton").hidden = !hasStarted;
  $("setupScreen").hidden = false;
}

// ---------- Canvas, fish, and animation ----------
const canvas = $("tankCanvas");
const ctx = canvas.getContext("2d");
const { Fish, TankScene } = window.FishTankArt;
const scene = new TankScene(reducedMotion);
let fishes = [];
let controlsHidden = false;
let playBounds = { left: 20, right: 800, top: 100, bottom: 500 };

function updatePlayBounds() {
  const width = scene.width;
  const height = scene.height;
  const panelHeight = controlsHidden ? 0 : $("teacherPanel").getBoundingClientRect().height;
  const top = Math.min(108, height * 0.2);
  let bottom = controlsHidden ? height - scene.sandHeight - 12 : height - panelHeight - 40;
  bottom = Math.max(top + 145, bottom);
  playBounds = { left: 16, right: Math.max(80, width - 16), top, bottom: Math.min(height - 30, bottom) };
}

function resizeCanvas() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.resize(width, height);
  for (const fish of fishes) {
    fish.x = clamp(fish.x, 40, width - 40);
    fish.y = clamp(fish.y, 120, Math.max(140, height - 160));
  }
  updatePlayBounds();
}

function syncFish(immediate) {
  const existing = new Map(fishes.map((fish) => [fish.group.id, fish]));
  fishes = state.groups.map((group, index) => {
    const fish = existing.get(group.id) || new Fish(group, index, scene.width, scene.height, reducedMotion);
    fish.group = group;
    fish.reducedMotion = reducedMotion;
    fish.setSize(sizeForPoints(group.points), immediate || !existing.has(group.id));
    return fish;
  });
}

function findFish(groupId) {
  return fishes.find((fish) => fish.group.id === groupId);
}

function addPoints(groupId, amount, options = {}) {
  const group = state.groups.find((item) => item.id === groupId);
  const increment = clamp(Math.round(Number(amount) || 0), 0, 999);
  if (!group || increment < 1) return;
  const previousLevel = growthLevel(group.points);
  group.points = clamp(group.points + increment, 0, 999999);
  const fish = findFish(group.id);
  if (fish) {
    fish.setSize(sizeForPoints(group.points), false);
    scene.burst(fish.x, fish.y - fish.displaySize * 0.65, group.color, `+${increment}`);
  }
  if (!options.quiet) {
    if (growthLevel(group.points) > previousLevel) playChime();
    else playBubble();
  }
  updateScoreUI();
  saveState();
}

function removePoint(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || group.points <= 0) {
    showToast("That fish is already at zero points.");
    return;
  }
  group.points = Math.max(0, group.points - 1);
  const fish = findFish(group.id);
  if (fish) {
    fish.setSize(sizeForPoints(group.points), false);
    scene.burst(fish.x, fish.y - fish.displaySize * 0.65, group.color, "−1");
  }
  playBubble();
  updateScoreUI();
  saveState();
}

function feedAll() {
  scene.feed(state.groups.length);
  playBubble();
}

let previousTime = performance.now();
let chartTimer = 0;

function animate(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.04);
  previousTime = now;
  const time = now / 1000;

  if (testMode && testRunning) {
    const speed = Number($("testSpeed").value);
    testAccumulator += dt * speed;
    // About 140 points per group in 30 seconds at 1x speed.
    while (testAccumulator >= 0.65) {
      testAccumulator -= 0.65;
      for (const group of state.groups) addPoints(group.id, 1 + Math.floor(Math.random() * 5), { quiet: true });
    }
  }

  scene.update(dt);
  for (const fish of fishes) fish.update(dt, time, playBounds, fishes, scene.foods);

  ctx.clearRect(0, 0, scene.width, scene.height);
  scene.drawBackground(ctx, time);
  const leaderPoints = Math.max(...state.groups.map((group) => group.points));
  const orderedFish = [...fishes].sort((a, b) => a.displaySize - b.displaySize);
  for (const fish of orderedFish) fish.draw(ctx, leaderPoints > 0 && fish.group.points === leaderPoints);
  scene.drawFoods(ctx);
  scene.drawEffects(ctx);

  chartTimer += dt;
  if (testMode && chartTimer > 0.35) {
    chartTimer = 0;
    drawGrowthChart();
  }
  requestAnimationFrame(animate);
}

// ---------- Export, import, and reset ----------
function exportState() {
  const payload = { ...deepClone(state), app: "FinFriends", exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finfriends-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Backup exported.");
}

async function importState(file) {
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    if (!window.confirm("Replace the current tank with this backup?")) return;
    if (testMode) exitTestMode(true);
    state = imported;
    hasStarted = true;
    $("setupScreen").hidden = true;
    $("closeSetupButton").hidden = false;
    syncFish(true);
    renderSetupList();
    renderGroupControls();
    updateSoundButton();
    saveState();
    showToast("Backup imported successfully.");
  } catch (error) {
    showToast(`Could not import: ${error.message || "invalid JSON file"}`);
  } finally {
    $("importFileInput").value = "";
  }
}

function resetPoints() {
  if (!state.groups.some((group) => group.points > 0)) {
    showToast("All fish are already at zero points.");
    return;
  }
  const message = testMode
    ? "Reset all test points to zero? Real saved scores will stay untouched."
    : "Reset every group's points to zero? This cannot be undone.";
  if (!window.confirm(message)) return;
  for (const group of state.groups) group.points = 0;
  for (const fish of fishes) fish.setSize(MIN_SIZE, false);
  updateScoreUI();
  saveState();
  showToast(testMode ? "Test points reset. Real scores are still safe." : "All points reset.");
}

// ---------- Hidden time-lapse / test mode ----------
function updateAutoTestButton() {
  $("autoTestButton").innerHTML = `<svg><use href="#i-${testRunning ? "pause" : "play"}"></use></svg><span>${testRunning ? "Pause" : "Resume"} auto points</span>`;
}

function enterTestMode() {
  if (testMode || !hasStarted || !$("setupScreen").hidden) return;
  testSnapshot = deepClone(state);
  testMode = true;
  testRunning = true;
  testAccumulator = 0;
  $("testPanel").hidden = false;
  updateAutoTestButton();
  drawGrowthChart();
  showToast("Test mode on. Real scores are safely parked.");
}

function exitTestMode(restore) {
  if (!testMode) return;
  testMode = false;
  testRunning = false;
  $("testPanel").hidden = true;
  if (restore && testSnapshot) {
    state = deepClone(testSnapshot);
    syncFish(false);
    renderSetupList();
    renderGroupControls();
    updateSoundButton();
  }
  testSnapshot = null;
  testAccumulator = 0;
  updateScoreUI();
}

function resetTestPoints() {
  if (!testMode || !testSnapshot) return;
  const realPoints = new Map(testSnapshot.groups.map((group) => [group.id, group.points]));
  for (const group of state.groups) {
    if (realPoints.has(group.id)) group.points = realPoints.get(group.id);
  }
  for (const fish of fishes) fish.setSize(sizeForPoints(fish.group.points), false);
  updateScoreUI();
  showToast("Real saved scores restored in the test tank.");
}

function keepTestPoints() {
  if (!testMode) return;
  if (!window.confirm("Overwrite the real saved scores with these test scores?")) return;
  testMode = false;
  testRunning = false;
  testSnapshot = null;
  $("testPanel").hidden = true;
  saveState();
  showToast("Test scores are now the real saved scores.");
}

function drawGrowthChart() {
  if (!testMode) return;
  const chart = $("growthChart");
  const chartCtx = chart.getContext("2d");
  const width = chart.width;
  const height = chart.height;
  const margin = { left: 31, right: 10, top: 12, bottom: 24 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;
  const highestPoints = Math.max(...state.groups.map((group) => group.points));
  const xMax = Math.max(150, Math.ceil(highestPoints / 50) * 50);
  const x = (points) => margin.left + clamp(points / xMax, 0, 1) * graphWidth;
  const y = (size) => margin.top + (1 - (size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)) * graphHeight;

  chartCtx.clearRect(0, 0, width, height);
  chartCtx.strokeStyle = "rgba(255,255,255,.1)";
  chartCtx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const lineY = margin.top + graphHeight * i / 2;
    chartCtx.beginPath();
    chartCtx.moveTo(margin.left, lineY);
    chartCtx.lineTo(width - margin.right, lineY);
    chartCtx.stroke();
  }
  chartCtx.strokeStyle = "rgba(255,255,255,.32)";
  chartCtx.beginPath();
  chartCtx.moveTo(margin.left, margin.top);
  chartCtx.lineTo(margin.left, height - margin.bottom);
  chartCtx.lineTo(width - margin.right, height - margin.bottom);
  chartCtx.stroke();

  chartCtx.strokeStyle = "#7ee0b2";
  chartCtx.lineWidth = 2;
  chartCtx.beginPath();
  for (let points = 0; points <= xMax; points += 3) {
    if (points === 0) chartCtx.moveTo(x(points), y(sizeForPoints(points)));
    else chartCtx.lineTo(x(points), y(sizeForPoints(points)));
  }
  chartCtx.stroke();

  for (const group of state.groups) {
    chartCtx.fillStyle = group.color;
    chartCtx.beginPath();
    chartCtx.arc(x(group.points), y(sizeForPoints(group.points)), 4, 0, Math.PI * 2);
    chartCtx.fill();
    chartCtx.strokeStyle = "rgba(5,35,45,.8)";
    chartCtx.lineWidth = 1;
    chartCtx.stroke();
  }

  chartCtx.fillStyle = "#9dbbc2";
  chartCtx.font = '10px "Trebuchet MS", sans-serif';
  chartCtx.textAlign = "center";
  chartCtx.fillText("0", x(0), height - 8);
  chartCtx.fillText(`${xMax} pts`, x(xMax), height - 8);
  chartCtx.textAlign = "right";
  chartCtx.fillText(`${MAX_SIZE}px`, margin.left - 5, margin.top + 4);
  chartCtx.fillText(`${MIN_SIZE}px`, margin.left - 5, height - margin.bottom);

  $("testReadout").innerHTML = state.groups.map((group) => `
    <div class="readout-row"><span>${escapeHtml(group.name)}</span><strong>${group.points} pts → ${Math.round(sizeForPoints(group.points))} px</strong></div>
  `).join("");
}

// ---------- Events ----------
$("fewerGroupsButton").addEventListener("click", () => setGroupCount(Number($("groupCount").value) - 1));
$("moreGroupsButton").addEventListener("click", () => setGroupCount(Number($("groupCount").value) + 1));
$("groupCount").addEventListener("change", () => setGroupCount($("groupCount").value));
$("startButton").addEventListener("click", applySetup);
$("closeSetupButton").addEventListener("click", applySetup);
$("settingsButton").addEventListener("click", openSetup);

$("groupSetupList").addEventListener("input", (event) => {
  const row = event.target.closest(".setup-group-row");
  if (!row) return;
  const group = state.groups.find((item) => item.id === row.dataset.groupId);
  if (!group) return;
  if (event.target.dataset.field === "name") group.name = event.target.value;
  if (event.target.dataset.field === "color") group.color = event.target.value.toUpperCase();
});

$("groupControls").addEventListener("click", (event) => {
  const card = event.target.closest(".group-card");
  if (!card) return;
  const addButton = event.target.closest("[data-add]");
  if (addButton) addPoints(card.dataset.groupId, Number(addButton.dataset.add));
  if (event.target.closest("[data-minus]")) removePoint(card.dataset.groupId);
});

$("groupControls").addEventListener("submit", (event) => {
  event.preventDefault();
  const card = event.target.closest(".group-card");
  const input = event.target.querySelector("input");
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount < 1) {
    showToast("Enter a custom amount of at least 1 point.");
    return;
  }
  addPoints(card.dataset.groupId, amount);
  input.value = "";
});

function toggleControls() {
  controlsHidden = !controlsHidden;
  document.body.classList.toggle("controls-hidden", controlsHidden);
  $("showControlsButton").hidden = !controlsHidden;
  requestAnimationFrame(updatePlayBounds);
  setTimeout(updatePlayBounds, 280);
}

$("hideControlsButton").addEventListener("click", toggleControls);
$("showControlsButton").addEventListener("click", toggleControls);
$("feedButton").addEventListener("click", feedAll);
$("resetButton").addEventListener("click", resetPoints);
$("exportButton").addEventListener("click", exportState);
$("importButton").addEventListener("click", () => $("importFileInput").click());
$("importFileInput").addEventListener("change", (event) => {
  if (event.target.files[0]) importState(event.target.files[0]);
});

$("soundButton").addEventListener("click", () => {
  state.settings.sound = !state.settings.sound;
  if (state.settings.sound) {
    getAudioContext();
    playBubble();
  }
  updateSoundButton();
  saveState();
});

$("fullscreenButton").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else showToast("Fullscreen is not available in this browser.");
  } catch (error) {
    showToast("The browser could not enter fullscreen.");
  }
});

$("closeTestButton").addEventListener("click", () => exitTestMode(true));
$("resetTestButton").addEventListener("click", resetTestPoints);
$("keepTestButton").addEventListener("click", keepTestPoints);
$("autoTestButton").addEventListener("click", () => {
  testRunning = !testRunning;
  updateAutoTestButton();
});
$("testSpeed").addEventListener("input", () => $("testSpeedValue").value = `${$("testSpeed").value}×`);
document.querySelectorAll("[data-days]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!testMode) return;
    const days = Number(button.dataset.days);
    const average = clamp(Number($("averagePoints").value) || 8, 1, 100);
    for (const group of state.groups) {
      const realisticVariation = 0.65 + Math.random() * 0.7;
      addPoints(group.id, Math.max(1, Math.round(days * average * realisticVariation)), { quiet: true });
    }
  });
});

window.addEventListener("keydown", (event) => {
  const tag = document.activeElement && document.activeElement.tagName;
  const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement && document.activeElement.isContentEditable);
  if (isTyping || event.ctrlKey || event.metaKey || event.altKey || !hasStarted || !$("setupScreen").hidden) return;

  if (event.code === "KeyT") {
    event.preventDefault();
    if (testMode) exitTestMode(true);
    else enterTestMode();
    return;
  }
  if (event.code === "KeyH") {
    event.preventDefault();
    toggleControls();
    return;
  }
  if (event.code === "Escape" && testMode) {
    exitTestMode(true);
    return;
  }
  const numberMatch = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
  if (numberMatch) {
    const group = state.groups[Number(numberMatch[1]) - 1];
    if (group) {
      event.preventDefault();
      addPoints(group.id, event.shiftKey ? 5 : 1);
    }
  }
});

window.addEventListener("resize", resizeCanvas);
if (window.ResizeObserver) new ResizeObserver(updatePlayBounds).observe($("teacherPanel"));
const handleMotionPreference = (event) => {
  reducedMotion = event.matches;
  scene.reducedMotion = reducedMotion;
  for (const fish of fishes) fish.reducedMotion = reducedMotion;
  scene.resize(scene.width, scene.height);
};
if (reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener("change", handleMotionPreference);
else reducedMotionQuery.addListener(handleMotionPreference);

// ---------- Initial render ----------
renderSetupList();
renderGroupControls();
updateSoundButton();
resizeCanvas();
syncFish(true);
updateScoreUI();
$("setupScreen").hidden = hasStarted;
$("closeSetupButton").hidden = !hasStarted;
if (!storageAvailable) showToast("Saving is unavailable here. Export a backup before closing.");
requestAnimationFrame(animate);
