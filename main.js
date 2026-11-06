import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   TARIK TAMBANG 3D — 17 Agustus Tug-of-War Simulator
   Mash SPACE / tap TARIK in rhythm. Best of 3 rounds.
   ============================================================ */

const WIN_DIST = 3.2;      // rope offset needed to win a round (meters)
const ROUND_TIME = 60;     // seconds per round
const TEAM_SIZE = 5;

// ---------- tiny DOM helpers ----------
const $ = (id) => document.getElementById(id);
const hud = $('hud'), overlay = $('overlay'), overlayText = $('overlayText');
const startBtn = $('startBtn'), pullBtn = $('pullBtn'), camBtn = $('camBtn');

// ---------- WebAudio sound (no assets, oscillator only) ----------
let audioCtx = null;
function audio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur = 0.15, type = 'square', vol = 0.08, slideTo = null, delay = 0) {
  const ctx = audio(); if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  pull: () => tone(140 + Math.random() * 60, 0.12, 'sawtooth', 0.06, 90),
  bonus: () => { tone(660, 0.1, 'square', 0.07); tone(880, 0.12, 'square', 0.07, null, 0.08); },
  slip: () => tone(300, 0.25, 'sawtooth', 0.06, 80),
  whistle: (n = 1) => { for (let i = 0; i < n; i++) tone(2200, 0.28, 'square', 0.06, null, i * 0.35); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, null, i * 0.16)); },
  lose: () => { [400, 350, 300, 220].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.07, null, i * 0.18)); },
  crowd: () => { for (let i = 0; i < 6; i++) tone(200 + Math.random() * 500, 0.15, 'triangle', 0.03, null, i * 0.09); },
};

// ---------- renderer / scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x9fc3e2, 35, 110);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 4.2, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.enabled = false; // follow-cam by default; toggle with C

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b4a2f, 0.85));
const sun = new THREE.DirectionalLight(0xfff2d9, 1.9);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffd9d9, 0.35);
fill.position.set(-12, 8, -10);
scene.add(fill);

// ---------- mud ground (canvas texture) ----------
function mudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a5230'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 1 + Math.random() * 4;
    const shades = ['#6b4527', '#8a5f38', '#5e3b21', '#93703f', '#4e3319'];
    g.fillStyle = shades[(Math.random() * shades.length) | 0];
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 0.25; g.strokeStyle = '#3d2712'; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ map: mudTexture(), roughness: 0.95, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// field markings: center line + win lines + side boundary
function stripe(w, l, color, x, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true;
  scene.add(m); return m;
}
stripe(0.35, 10, 0xffd54f, 0);            // center (gold)
stripe(0.3, 10, 0xe53935, -WIN_DIST);     // player win line (red, left)
stripe(0.3, 10, 0xffffff, WIN_DIST);      // rival win line (white, right)
stripe(14, 0.3, 0xffffff, 0, -5); stripe(14, 0.3, 0xffffff, 0, 5);

// ---------- 17 Agustus decorations ----------
// start/finish gate
(function gate() {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d1f1f, roughness: 0.6 });
  const poleG = new THREE.CylinderGeometry(0.14, 0.16, 6, 12);
  for (const z of [-5.6, 5.6]) {
    const p = new THREE.Mesh(poleG, poleMat);
    p.position.set(0, 3, z); p.castShadow = true; scene.add(p);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.3, metalness: 0.6 }));
    ball.position.set(0, 6.2, z); scene.add(ball);
  }
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#c62828'; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#fff'; g.fillRect(0, 62, 1024, 36);
  g.fillStyle = '#b71c1c'; g.font = 'bold 64px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★ MERDEKA • 17 AGUSTUS ★', 512, 82);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.6),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
  banner.position.set(0, 5.1, 0); banner.rotation.y = Math.PI / 2;
  banner.castShadow = true; scene.add(banner);
})();

// bunting: red-white triangle strings across the field
const buntingFlags = [];
(function bunting() {
  const rows = [-8, -4, 4, 8];
  for (const x of rows) {
    const a = new THREE.Vector3(x, 5.4, -7), b = new THREE.Vector3(x, 5.4, 7);
    const rope = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: 0x5d4037 }));
    scene.add(rope);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const sag = Math.sin(t * Math.PI) * 0.7;
      const col = i % 2 ? 0xe53935 : 0xffffff;
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3),
        new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }));
      tri.position.set(x, 5.4 - sag - 0.28, -7 + 14 * t);
      tri.rotation.z = Math.PI; tri.rotation.y = Math.PI / 2;
      scene.add(tri); buntingFlags.push(tri);
    }
  }
})();

// waving Indonesian flags (2 segments, wave by rotation)
const waveFlags = [];
function makeFlag(x, z, h = 4) {
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 10),
    new THREE.MeshStandardMaterial({ color: 0x9e9e9e, metalness: 0.6, roughness: 0.4 }));
  pole.position.y = h / 2; pole.castShadow = true; grp.add(pole);
  const c = document.createElement('canvas'); c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#e53935'; g.fillRect(0, 0, 128, 48);
  g.fillStyle = '#ffffff'; g.fillRect(0, 48, 128, 48);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 6, 1),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
  cloth.position.set(0.78, h - 0.7, 0); grp.add(cloth);
  grp.position.set(x, 0, z); scene.add(grp);
  waveFlags.push(cloth);
}
makeFlag(-6, -6.5); makeFlag(6, -6.5); makeFlag(-6, 6.5); makeFlag(6, 6.5);
makeFlag(-11, 0, 5); makeFlag(11, 0, 5);

// ---------- thick rope: tube with tension sag ----------
let ropeMesh = null;
const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
function updateRope(offset, tension) {
  const pts = [];
  const N = 24;
  const sag = THREE.MathUtils.lerp(0.55, 0.08, tension); // slack <-> taut
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = THREE.MathUtils.lerp(-7.5, 7.5, t) + offset;
    const y = 1.0 - Math.sin(t * Math.PI) * sag;
    pts.push(new THREE.Vector3(x, y, 0));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.09, 8, false);
  if (!ropeMesh) { ropeMesh = new THREE.Mesh(geo, ropeMat); ropeMesh.castShadow = true; scene.add(ropeMesh); }
  else { ropeMesh.geometry.dispose(); ropeMesh.geometry = geo; }
  return pts;
}
// center ribbon marker on rope
const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18),
  new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.5 }));
ribbon.castShadow = true; scene.add(ribbon);

// ---------- low-poly animated humans ----------
const skinTones = [0xc68642, 0x8d5524, 0xe0ac69, 0xa0663a, 0x6b4423];
function makeHuman(shirt, skin) {
  const g = new THREE.Group();
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const pantsM = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.85 });
  const mk = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = true; g.add(m); return m;
  };
  const legL = mk(new THREE.BoxGeometry(0.22, 0.75, 0.24), pantsM, 0, 0.38, -0.14);
  const legR = mk(new THREE.BoxGeometry(0.22, 0.75, 0.24), pantsM, 0, 0.38, 0.14);
  const torso = mk(new THREE.BoxGeometry(0.5, 0.72, 0.42), shirtM, 0, 1.1, 0);
  const armL = mk(new THREE.BoxGeometry(0.16, 0.62, 0.18), skinM, 0.28, 1.15, -0.3);
  const armR = mk(new THREE.BoxGeometry(0.16, 0.62, 0.18), skinM, 0.28, 1.15, 0.3);
  const head = mk(new THREE.SphereGeometry(0.21, 12, 12), skinM, 0, 1.68, 0);
  const cap = mk(new THREE.CylinderGeometry(0.22, 0.23, 0.1, 12),
    new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 }), 0, 1.86, 0);
  return { g, legL, legR, torso, armL, armR, head, cap };
}

const pullers = []; // {side:-1|1, baseX, human, phase, aiSpeed, slip}
for (let i = 0; i < TEAM_SIZE; i++) {
  for (const side of [-1, 1]) {
    const shirt = side < 0 ? (i % 2 ? 0xe53935 : 0xb71c1c) : 0xf5f5f5;
    const h = makeHuman(shirt, skinTones[(i * 2 + (side > 0 ? 1 : 0)) % skinTones.length]);
    const lane = -2 + i * 1.0;
    const baseX = side * (1.6 + i * 1.15);
    h.g.position.set(baseX, 0, lane);
    h.g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(h.g);
    pullers.push({
      side, baseX, lane, h,
      phase: Math.random() * Math.PI * 2,
      aiSpeed: side > 0 ? 0.75 + Math.random() * 0.7 : 1.0,
      slip: 0,
    });
  }
}

// judge + flag
const judge = makeHuman(0x212121, 0xc68642);
judge.g.position.set(0, 0, 3.4); judge.g.rotation.y = Math.PI;
scene.add(judge.g);
const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8),
  new THREE.MeshStandardMaterial({ color: 0x888888 }));
flagPole.position.set(0.5, 1.5, 3.9); scene.add(flagPole);
const judgeFlag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x2e7d32, side: THREE.DoubleSide }));
judgeFlag.position.set(0.8, 1.9, 3.9); scene.add(judgeFlag);

// crowd: jumping low-poly spectators around the arena
const crowd = [];
(function makeCrowd() {
  const cols = [0xe53935, 0xffffff, 0xffb300, 0x1e88e5, 0x43a047, 0x8e24aa];
  for (let i = 0; i < 46; i++) {
    const shirt = cols[i % cols.length];
    const h = makeHuman(shirt, skinTones[i % skinTones.length]);
    const ang = (i / 46) * Math.PI * 2;
    const r = 12 + (i % 3) * 1.6;
    h.g.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r * 0.75);
    h.g.rotation.y = Math.atan2(-h.g.position.x, -h.g.position.z);
    const s = 0.9 + Math.random() * 0.25; h.g.scale.setScalar(s);
    scene.add(h.g);
    crowd.push({ h, phase: Math.random() * 6.28, speed: 2 + Math.random() * 3 });
  }
})();

// ---------- particles: mud splash + confetti ----------
const MAXP = 400;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(MAXP * 3);
const pVel = new Float32Array(MAXP * 3);
const pLife = new Float32Array(MAXP);
const pCol = new Float32Array(MAXP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95 });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false; scene.add(points);
let pCursor = 0;
const _c = new THREE.Color();
function spawn(x, y, z, n, color, spread = 2.2, up = 2.5) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = pCursor; pCursor = (pCursor + 1) % MAXP;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = (Math.random() - 0.5) * spread;
    pVel[i * 3 + 1] = Math.random() * up;
    pVel[i * 3 + 2] = (Math.random() - 0.5) * spread;
    pLife[i] = 0.6 + Math.random() * 0.7;
    pCol[i * 3] = _c.r * (0.7 + Math.random() * 0.5);
    pCol[i * 3 + 1] = _c.g * (0.7 + Math.random() * 0.5);
    pCol[i * 3 + 2] = _c.b * (0.7 + Math.random() * 0.5);
  }
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -10; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 9 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; pVel[i * 3 + 1] = 0; }
  }
  pGeo.attributes.position.needsUpdate = true;
}
function confettiBurst() {
  const cols = [0xe53935, 0xffffff, 0xffd54f, 0x43a047, 0x1e88e5];
  for (let k = 0; k < 5; k++)
    spawn((Math.random() - 0.5) * 10, 4 + Math.random() * 3, (Math.random() - 0.5) * 6,
      40, cols[k % cols.length], 4, 2);
}

// ---------- game state ----------
const game = {
  phase: 'menu', // menu | play | roundEnd | matchEnd
  round: 1, scoreP: 0, scoreA: 0,
  offset: 0,          // rope marker position; + = rival pulling, - = player pulling
  vel: 0,
  time: ROUND_TIME,
  stamina: 1,
  playerHeat: 0,      // recent mash energy (decays)
  combo: 1,
  needle: 0, needleDir: 1, needleSpeed: 0.9,
  sweetX: 0.35, sweetW: 0.22,
  orbit: false,
  roundMsg: '',
  aiPhase: 0,
};

function resetRound() {
  game.offset = 0; game.vel = 0; game.time = ROUND_TIME;
  game.stamina = 1; game.playerHeat = 0; game.combo = 1;
  game.needle = 0; game.needleDir = 1;
  game.sweetX = 0.25 + Math.random() * 0.4;
  game.aiPhase = Math.random() * 10;
  for (const p of pullers) p.slip = 0;
  updateScoreHUD();
}

function updateScoreHUD() {
  $('roundLabel').textContent = Math.min(game.round, 3);
  $('scoreP').textContent = game.scoreP;
  $('scoreA').textContent = game.scoreA;
}

// ---------- input: rhythmic mash ----------
function doPull() {
  if (game.phase !== 'play') return;
  if (game.stamina <= 0.05) { tone(120, 0.15, 'sawtooth', 0.05, 70); return; } // exhausted
  const inSweet = game.needle >= game.sweetX - game.sweetW / 2 &&
                  game.needle <= game.sweetX + game.sweetW / 2;
  let power = 0.55;
  if (inSweet) {
    power = 1.5;
    game.combo = Math.min(game.combo + 0.15, 3.0);
    sfx.bonus();
    const px = -2 - Math.random() * 3;
    spawn(px, 0.4, (Math.random() - 0.5) * 4, 8, 0xffd54f, 1.5, 2);
  } else {
    game.combo = Math.max(1.0, game.combo - 0.1);
    sfx.pull();
  }
  const staminaFactor = 0.45 + 0.55 * game.stamina;
  game.vel -= power * staminaFactor * game.combo * 0.16;
  game.playerHeat = Math.min(game.playerHeat + (inSweet ? 0.5 : 0.3), 1.6);
  game.stamina = Math.max(0, game.stamina - (inSweet ? 0.045 : 0.06));
  // move sweet zone so player must adapt rhythm
  game.sweetX = 0.15 + Math.random() * 0.7;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (game.phase === 'play') doPull();
    else if (game.phase === 'menu') startMatch();
    else if (game.phase === 'matchEnd') startMatch();
    else if (game.phase === 'roundEnd') nextRound();
  }
  if (e.code === 'KeyC') toggleCam();
  if (e.code === 'Enter' && game.phase !== 'play') {
    if (game.phase === 'menu' || game.phase === 'matchEnd') startMatch();
    else nextRound();
  }
});
pullBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); doPull(); });
function toggleCam() {
  game.orbit = !game.orbit;
  controls.enabled = game.orbit;
  camBtn.textContent = 'Orbit: ' + (game.orbit ? 'ON' : 'OFF');
}
camBtn.addEventListener('click', toggleCam);

// ---------- overlay screens ----------
function showOverlay(html, btnLabel, btnFn) {
  overlay.classList.remove('hidden');
  overlayText.innerHTML = html;
  startBtn.textContent = btnLabel;
  startBtn.onclick = btnFn;
}
function hideOverlay() { overlay.classList.add('hidden'); }

function startMatch() {
  audio();
  game.phase = 'play'; game.round = 1; game.scoreP = 0; game.scoreA = 0;
  resetRound();
  hideOverlay();
  hud.classList.remove('hidden');
  $('touchControls').classList.remove('hidden');
  sfx.whistle(1);
}
function nextRound() {
  game.round++;
  resetRound();
  game.phase = 'play';
  hideOverlay();
  sfx.whistle(1);
}
function endRound(winner) {
  game.phase = 'roundEnd';
  if (winner === 'P') { game.scoreP++; sfx.win(); sfx.crowd(); confettiBurst(); }
  else { game.scoreA++; sfx.lose(); }
  updateScoreHUD();
  const matchOver = game.scoreP >= 2 || game.scoreA >= 2;
  setTimeout(() => {
    if (matchOver) {
      game.phase = 'matchEnd';
      const win = game.scoreP > game.scoreA;
      if (win) { confettiBurst(); setTimeout(confettiBurst, 500); }
      showOverlay(
        `<div class="${win ? 'win' : 'lose'}"><h2>${win ? '🏆 MENANG! YOU WIN!' : '😞 KALAH — YOU LOSE'}</h2>` +
        `<p>Skor akhir / Final score: <b>${game.scoreP} – ${game.scoreA}</b></p>` +
        `<p>${win ? 'Merdeka! Tim merah tak terbendung! <br/><span class="en">Freedom! The red team is unstoppable!</span>'
                  : 'Ayo coba lagi! Atur ritme & jaga stamina. <br/><span class="en">Try again — time your rhythm and save stamina!</span>'}</p></div>`,
        'MAIN LAGI / REMATCH ↻', startMatch);
    } else {
      showOverlay(
        `<h2>${winner === 'P' ? '🎉 Ronde untuk TIM MERAH! / Round to RED!' : '💪 Ronde untuk LAWAN / Round to RIVAL'}</h2>` +
        `<p>Skor / Score: <b>${game.scoreP} – ${game.scoreA}</b> • Ronde berikutnya: ${game.round + 1} / 3</p>`,
        'RONDE BERIKUTNYA / NEXT ▶', nextRound);
    }
  }, 1200);
}

// ---------- per-frame update ----------
const clock = new THREE.Clock();
let camPos = new THREE.Vector3(0, 4.2, 11);

function animatePullers(t, dt) {
  const effort = THREE.MathUtils.clamp(Math.abs(game.vel) * 2 + game.playerHeat, 0, 2);
  for (const p of pullers) {
    const { h } = p;
    p.phase += dt * (4 + effort * 5);
    const lean = 0.45 + effort * 0.25 + Math.sin(p.phase) * 0.08;
    // lean away from center: player team (side -1) leans left (-x), rival leans right
    h.g.rotation.x = 0;
    h.torso.rotation.z = 0;
    h.g.rotation.z = 0;
    // lean around z-axis (rope runs along x)
    h.g.rotation.y = p.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    h.torso.rotation.x = -lean * 0.5;
    h.head.position.y = 1.68 - lean * 0.08;
    const swing = Math.sin(p.phase) * (0.25 + effort * 0.2);
    h.armL.rotation.x = -0.9 + swing * 0.4;
    h.armR.rotation.x = -0.9 - swing * 0.4;
    h.legL.rotation.x = swing * 0.5;
    h.legR.rotation.x = -swing * 0.5;
    // position follows rope offset + slip wobble
    p.slip = Math.max(0, p.slip - dt * 2);
    const wob = p.slip > 0 ? Math.sin(t * 40) * 0.15 * p.slip : 0;
    h.g.position.x = p.baseX + game.offset + wob;
    h.g.position.z = p.lane + wob * 0.5;
    if (p.slip <= 0 && Math.random() < dt * 0.25 * effort) {
      p.slip = 1;
      spawn(h.g.position.x, 0.25, h.g.position.z, 6, 0x5e3b21, 2, 2);
      if (p.side < 0 && Math.random() < 0.3) sfx.slip();
    }
  }
  // judge waves flag when round decided / idle bounce
  judge.head.position.y = 1.68 + Math.abs(Math.sin(t * 2)) * 0.03;
  judgeFlag.rotation.y = Math.sin(t * (game.phase === 'play' ? 3 : 9)) * 0.5;
  for (const c of crowd) {
    c.phase += dt * c.speed * (game.phase === 'play' ? 1 : 2.2);
    c.h.g.position.y = Math.abs(Math.sin(c.phase)) * 0.35;
    c.h.armL.rotation.x = -2.4 + Math.sin(c.phase) * 0.5;
    c.h.armR.rotation.x = -2.4 - Math.sin(c.phase) * 0.5;
  }
}

function updateGame(dt) {
  if (game.phase !== 'play') return;
  game.time -= dt;
  game.playerHeat = Math.max(0, game.playerHeat - dt * 0.9);
  game.stamina = Math.min(1, game.stamina + dt * 0.055); // regen
  // timing needle ping-pong
  game.needle += game.needleDir * game.needleSpeed * dt;
  if (game.needle > 1) { game.needle = 1; game.needleDir = -1; }
  if (game.needle < 0) { game.needle = 0; game.needleDir = 1; }

  // AI team: varied sine-based rhythm + noise, slightly stronger each round
  game.aiPhase += dt;
  let aiPower = 0;
  for (const p of pullers) {
    if (p.side > 0) {
      aiPower += p.aiSpeed * (0.62 + 0.38 * Math.sin(game.aiPhase * 2.1 + p.phase));
    }
  }
  aiPower /= TEAM_SIZE;
  const aiScale = 0.115 * (1 + (game.round - 1) * 0.12);
  game.vel += aiPower * aiScale * (0.9 + Math.random() * 0.2);

  // player passive drift toward center when idle (rope tension)
  game.vel += -game.offset * 0.02 * dt;
  // friction
  game.vel *= (1 - 0.55 * dt);
  game.vel = THREE.MathUtils.clamp(game.vel, -3, 3);
  game.offset += game.vel * dt * 2.2;

  // flag wave speed follows tension
  if (Math.abs(game.vel) > 1.2 && Math.random() < dt * 2)
    spawn(game.offset + (Math.random() - 0.5) * 8, 0.3, (Math.random() - 0.5) * 3, 3, 0x7a5230, 1.5, 1.5);

  if (game.offset <= -WIN_DIST) endRound('P');
  else if (game.offset >= WIN_DIST) endRound('A');
  else if (game.time <= 0) endRound(game.offset < 0 ? 'P' : (game.offset > 0 ? 'A' : (Math.random() < 0.5 ? 'P' : 'A')));
}

function updateHUD() {
  $('timer').textContent = Math.max(0, Math.ceil(game.time));
  const pct = ((game.offset + WIN_DIST) / (WIN_DIST * 2)) * 100;
  $('marker').style.left = THREE.MathUtils.clamp(pct, 2, 98) + '%';
  $('staminaFill').style.width = (game.stamina * 100).toFixed(0) + '%';
  $('timingNeedle').style.left = (game.needle * 100).toFixed(1) + '%';
  const sz = $('sweetZone');
  sz.style.left = ((game.sweetX - game.sweetW / 2) * 100).toFixed(1) + '%';
  sz.style.width = (game.sweetW * 100).toFixed(1) + '%';
  $('combo').textContent = 'Kombo x' + game.combo.toFixed(1) + (game.stamina <= 0.05 ? ' — CAPEK! / TIRED!' : '');
}

function updateCamera(dt) {
  if (game.orbit) { controls.update(); return; }
  // follow cam: behind player team, drifting with rope offset
  const tx = game.offset * 0.55, tz = 10.5, ty = 4.0;
  camPos.x += (tx - camPos.x) * Math.min(1, dt * 2);
  camPos.y += (ty - camPos.y) * Math.min(1, dt * 2);
  camPos.z += (tz - camPos.z) * Math.min(1, dt * 2);
  camera.position.copy(camPos);
  camera.lookAt(game.offset * 0.7, 1.1, 0);
}

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  updateGame(dt);
  const tension = THREE.MathUtils.clamp(Math.abs(game.vel) * 1.2 + game.playerHeat * 0.5 + 0.35, 0, 1);
  updateRope(game.offset, tension);
  ribbon.position.set(game.offset, 1.0, 0);
  animatePullers(t, dt);
  // flag + bunting flutter
  for (let i = 0; i < waveFlags.length; i++) {
    const f = waveFlags[i];
    f.rotation.y = Math.sin(t * 4 + i * 1.3) * 0.35;
    f.rotation.z = Math.sin(t * 3 + i) * 0.08;
  }
  for (let i = 0; i < buntingFlags.length; i++)
    buntingFlags[i].rotation.x = Math.sin(t * 2.5 + i * 0.7) * 0.25;
  updateParticles(dt);
  updateHUD();
  updateCamera(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// idle attract-mode rope so menu looks alive
updateRope(0, 0.4);
startBtn.onclick = startMatch;
tick();
