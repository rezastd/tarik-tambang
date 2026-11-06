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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x9fc3e2, 35, 110);

// ---------- gradient sky dome + drifting clouds + distant silhouettes ----------
const _tmpV = new THREE.Vector3(), _tmpV2 = new THREE.Vector3();
(function skyDome() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#2f6fb4'); gr.addColorStop(0.45, '#87b5e0'); gr.addColorStop(0.75, '#cfe8ff'); gr.addColorStop(1, '#ffe3b3');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(140, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  scene.add(dome);
})();
const clouds = [];
(function makeClouds() {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 10; i++) {
    const grp = new THREE.Group();
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(geo, mat); m.position.set(k * 1.1 - 1.6, (k % 2) * 0.3, (k % 3) * 0.4); m.scale.set(1.6 + k * 0.4, 0.7, 1); grp.add(m); }
    grp.position.set(-60 + i * 13, 22 + (i % 4) * 4, -35 - (i % 3) * 12);
    grp.userData.speed = 0.3 + (i % 5) * 0.12; scene.add(grp); clouds.push(grp);
  }
})();
(function silhouettes() {
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2e5d33, roughness: 1, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e3319, roughness: 1 });
  const cone = new THREE.ConeGeometry(1.6, 4.5, 7), trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6);
  for (let i = 0; i < 22; i++) {
    const grp = new THREE.Group(); const ang = (i / 22) * Math.PI * 2, r = 48 + (i % 4) * 8;
    const t = new THREE.Mesh(trunk, trunkMat); t.position.y = 0.8; grp.add(t);
    const c1 = new THREE.Mesh(cone, treeMat); c1.position.y = 3.6; grp.add(c1);
    grp.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r * 0.8 - 10); grp.scale.setScalar(1 + (i % 3) * 0.5); scene.add(grp);
  }
  const houseMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d1f1f, roughness: 0.8, flatShading: true });
  const box = new THREE.BoxGeometry(4, 2.4, 3), roof = new THREE.ConeGeometry(3.2, 1.8, 4);
  for (let i = 0; i < 6; i++) {
    const grp = new THREE.Group(); const h = new THREE.Mesh(box, i % 2 ? houseMat : roofMat); h.position.y = 1.2; grp.add(h);
    const r1 = new THREE.Mesh(roof, roofMat); r1.position.y = 3.3; r1.rotation.y = Math.PI / 4; grp.add(r1);
    grp.position.set(-42 + i * 16, 0, -34 - (i % 2) * 6); scene.add(grp);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe53935 : 0xffffff, roughness: 0.9, flatShading: true }));
    tent.position.set(-38 + i * 16, 1.1, 30 + (i % 2) * 5); tent.rotation.y = Math.PI / 4; scene.add(tent);
  }
})();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
camera.position.set(0, 4.2, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.enabled = false; // follow-cam by default; toggle with C

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6b4a2f, 0.85));
scene.add(new THREE.AmbientLight(0xffe8c8, 0.25)); // soft ambient bounce
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
  // patches layer
  for (let i = 0; i < 90; i++) { g.globalAlpha = 0.12 + Math.random() * 0.18; g.fillStyle = ['#9c7248', '#5a3a20', '#a8835a'][(Math.random() * 3) | 0]; g.beginPath(); g.ellipse(Math.random() * 512, Math.random() * 512, 18 + Math.random() * 48, 10 + Math.random() * 28, Math.random() * 3, 0, 7); g.fill(); }
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
function mudRoughness() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) { const v = 120 + (Math.random() * 135) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 7, 0, 7); g.fill(); }
  for (let i = 0; i < 28; i++) { g.fillStyle = '#3a3a3a'; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 12 + Math.random() * 26, 7 + Math.random() * 14, Math.random() * 3, 0, 7); g.fill(); } // wet = smooth
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ map: mudTexture(), roughnessMap: mudRoughness(), roughness: 1.0, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);

// scattered props: puddles (low roughness discs), stones, grass tufts, mud furrows, rope barriers
const puddleMat = new THREE.MeshStandardMaterial({ color: 0x9fc3e2, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.78 });
const puddleGeo = new THREE.CircleGeometry(1, 20);
const puddles = [];
for (let i = 0; i < 12; i++) { const p = new THREE.Mesh(puddleGeo, puddleMat); p.rotation.x = -Math.PI / 2; p.position.set(-10 + Math.random() * 20, 0.03, -6 + Math.random() * 12); p.scale.set(0.7 + Math.random() * 1.1, 0.45 + Math.random() * 0.6, 1); p.receiveShadow = true; scene.add(p); puddles.push(p); }
(function props() {
  const stoneGeo = new THREE.IcosahedronGeometry(0.16, 0), stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.95, flatShading: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4e7a35, roughness: 1, side: THREE.DoubleSide });
  const grassGeo = new THREE.ConeGeometry(0.07, 0.5, 4);
  for (let i = 0; i < 60; i++) { const s = new THREE.Mesh(stoneGeo, stoneMat); s.position.set((Math.random() - 0.5) * 36, 0.08, (Math.random() - 0.5) * 22 + (Math.random() < 0.5 ? 8 : -8)); s.castShadow = true; scene.add(s); }
  for (let i = 0; i < 90; i++) { const gr = new THREE.Mesh(grassGeo, grassMat); gr.position.set((Math.random() - 0.5) * 40, 0.22, 6.5 + Math.random() * 8 * (i % 2 ? 1 : -1)); gr.rotation.z = (Math.random() - 0.5) * 0.4; scene.add(gr); }
  const furrowMat = new THREE.MeshStandardMaterial({ color: 0x3d2712, roughness: 1, transparent: true, opacity: 0.55 });
  const furrowGeo = new THREE.PlaneGeometry(2.6, 0.32);
  for (let side of [-1, 1]) for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(furrowGeo, furrowMat); f.rotation.x = -Math.PI / 2; f.rotation.z = Math.PI / 2; f.position.set(side * (2.2 + i * 1.15), 0.025, -2 + i * 1.0); scene.add(f); }
  // rope barriers in front of crowd
  const postGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.9, 8), postMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.6 });
  const ropeBarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  for (const z of [-7.2, 7.2]) for (let x = -12; x <= 12; x += 4) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(x, 0.45, z); p.castShadow = true; scene.add(p); if (x < 12) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 4, 6), ropeBarMat); r.rotation.z = Math.PI / 2; r.position.set(x + 2, 0.78, z); scene.add(r); } }
})();
// fading footprint decal pool
const footprints = [];
(function footPool() {
  const geo = new THREE.PlaneGeometry(0.22, 0.32), mat0 = new THREE.MeshBasicMaterial({ color: 0x2e1c0d, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, mat0.clone()); m.rotation.x = -Math.PI / 2; m.position.y = -5; scene.add(m); footprints.push({ m, life: 0 }); }
})();
let footCursor = 0, footTimer = 0;
function dropFootprint(x, z, rotY) { const f = footprints[footCursor]; footCursor = (footCursor + 1) % footprints.length; f.m.position.set(x, 0.035, z); f.m.rotation.z = rotY; f.life = 4; f.m.material.opacity = 0.5; }

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
      const tri = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46, 3, 2),
        new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 }));
      tri.geometry.userData.base = tri.geometry.attributes.position.array.slice();
      tri.position.set(x, 5.4 - sag - 0.28, -7 + 14 * t);
      tri.rotation.y = Math.PI / 2;
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
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0, 8, 4),
    new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
  cloth.geometry.userData.base = cloth.geometry.attributes.position.array.slice();
  cloth.position.set(0.78, h - 0.7, 0); grp.add(cloth);
  grp.position.set(x, 0, z); scene.add(grp);
  waveFlags.push(cloth);
}
makeFlag(-6, -6.5); makeFlag(6, -6.5); makeFlag(-6, 6.5); makeFlag(6, 6.5);
makeFlag(-11, 0, 5); makeFlag(11, 0, 5);
// vertex sin-wave for flag/bunting cloth (reuses stored base positions, no allocs)
function waveCloth(mesh, t, phase, amp = 0.12) {
  const pos = mesh.geometry.attributes.position, base = mesh.geometry.userData.base;
  if (!base) return;
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3], by = base[i * 3 + 1];
    pos.array[i * 3 + 2] = Math.sin(bx * 4 + t * 6 + phase) * amp * (bx + 0.75);
    pos.array[i * 3 + 1] = by + Math.sin(bx * 3 + t * 5 + phase) * amp * 0.25;
  }
  pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
}

// ---------- thick rope: TubeGeometry + twisted-fiber texture, tension sag + vibration ----------
let ropeMesh = null;
function ropeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#c9a06a'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 5;
  for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x, 34); g.lineTo(x + 20, -2); g.stroke(); }
  g.strokeStyle = '#e8c88a'; g.lineWidth = 2;
  for (let x = -32; x < 160; x += 16) { g.beginPath(); g.moveTo(x + 6, 34); g.lineTo(x + 26, -2); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(14, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ropeMat = new THREE.MeshStandardMaterial({ map: ropeTexture(), roughness: 0.9 });
const ROPE_N = 24;
const ropePts = []; for (let i = 0; i <= ROPE_N; i++) ropePts.push(new THREE.Vector3());
const ropeCurve = new THREE.CatmullRomCurve3(ropePts);
const frayMat = new THREE.MeshStandardMaterial({ color: 0xa8835a, roughness: 1 });
const frays = [];
for (let e = 0; e < 2; e++) for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.35, 4), frayMat); f.rotation.z = (e ? -1 : 1) * (Math.PI / 2 + (k - 2) * 0.18); scene.add(f); frays.push(f); }
let ropeTime = 0;
function updateRope(offset, tension) {
  const sag = THREE.MathUtils.lerp(0.55, 0.08, tension); // slack <-> taut
  const vib = tension > 0.72 ? Math.min(0.035, (tension - 0.72) * 0.1) : 0; // high tension ~ high |vel|
  ropeTime += 0.016;
  for (let i = 0; i <= ROPE_N; i++) {
    const t = i / ROPE_N;
    ropePts[i].set(THREE.MathUtils.lerp(-7.5, 7.5, t) + offset,
      1.0 - Math.sin(t * Math.PI) * sag + (vib ? Math.sin(t * 40 + ropeTime * 55) * vib * Math.sin(t * Math.PI) : 0), 0);
  }
  const geo = new THREE.TubeGeometry(ropeCurve, 32, 0.09, 8, false);
  if (!ropeMesh) { ropeMesh = new THREE.Mesh(geo, ropeMat); ropeMesh.castShadow = true; scene.add(ropeMesh); }
  else { ropeMesh.geometry.dispose(); ropeMesh.geometry = geo; }
  frays.forEach((f, i) => { const end = i < 5 ? ropePts[0] : ropePts[ROPE_N]; f.position.set(end.x + (i < 5 ? -0.18 : 0.18), end.y, end.z + ((i % 5) - 2) * 0.05); });
  return ropePts;
}
// center ribbon marker on rope
const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18),
  new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.5 }));
ribbon.castShadow = true; scene.add(ribbon);

// ---------- low-poly animated humans ----------
const skinTones = [0xc68642, 0x8d5524, 0xe0ac69, 0xa0663a, 0x6b4423];
const shortsCols = [0x37474f, 0x263238, 0x5d4037, 0x1a237e, 0x4a148c];
const _sharedGeo = {
  leg: new THREE.BoxGeometry(0.2, 0.78, 0.22), torso: new THREE.BoxGeometry(0.46, 0.68, 0.38),
  arm: new THREE.BoxGeometry(0.15, 0.6, 0.16), head: new THREE.SphereGeometry(0.2, 14, 12),
  cap: new THREE.CylinderGeometry(0.21, 0.22, 0.09, 12), eye: new THREE.SphereGeometry(0.028, 6, 6),
};
function shirtTexture(shirt, num) {
  if (num == null) return null;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(shirt).getHexString(); g.fillRect(0, 0, 64, 64);
  g.fillStyle = shirt === 0xf5f5f5 ? '#c62828' : '#ffffff'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let humanIdx = 0;
function makeHuman(shirt, skin, num = null) {
  humanIdx++;
  const g = new THREE.Group();
  const tex = shirtTexture(shirt, num);
  const shirtM = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : shirt, map: tex || undefined, roughness: 0.8 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const pantsM = new THREE.MeshStandardMaterial({ color: shortsCols[humanIdx % shortsCols.length], roughness: 0.85 });
  const pivot = (x, y, z, parent = g) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const child = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  // legs pivot at hip, arms at shoulder, torso at waist, head at neck
  const legL = pivot(0, 0.78, -0.13); child(_sharedGeo.leg, pantsM, legL, 0, -0.39, 0);
  const legR = pivot(0, 0.78, 0.13); child(_sharedGeo.leg, pantsM, legR, 0, -0.39, 0);
  const torso = pivot(0, 0.78, 0); child(_sharedGeo.torso, shirtM, torso, 0, 0.34, 0);
  const armL = pivot(0.05, 0.62, -0.3, torso); child(_sharedGeo.arm, skinM, armL, 0, -0.28, 0);
  const armR = pivot(0.05, 0.62, 0.3, torso); child(_sharedGeo.arm, skinM, armR, 0, -0.28, 0);
  const head = pivot(0, 0.74, 0, torso); const headMesh = child(_sharedGeo.head, skinM, head, 0, 0.2, 0);
  // simple face: eyes on +x face
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  child(_sharedGeo.eye, eyeM, head, -0.08, 0.24, 0.17); child(_sharedGeo.eye, eyeM, head, 0.08, 0.24, 0.17); // face = local +z, turned toward rope centre
  // cap or hair variation
  let cap;
  if (humanIdx % 3 === 0) { cap = child(new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.95 }), head, 0, 0.23, 0); }
  else { cap = child(_sharedGeo.cap, new THREE.MeshStandardMaterial({ color: shirt === 0xf5f5f5 ? 0xe53935 : 0xffffff, roughness: 0.6 }), head, 0, 0.38, 0); }
  return { g, legL, legR, torso, armL, armR, head, headMesh, cap };
}

const pullers = []; // {side:-1|1, baseX, human, phase, aiSpeed, slip}
for (let i = 0; i < TEAM_SIZE; i++) {
  for (const side of [-1, 1]) {
    const shirt = side < 0 ? (i % 2 ? 0xe53935 : 0xb71c1c) : 0xf5f5f5;
    const h = makeHuman(shirt, skinTones[(i * 2 + (side > 0 ? 1 : 0)) % skinTones.length], i + 1);
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
// ambient dust/mud motes (capped, reused buffers)
const MOTES = 80; const moteGeo = new THREE.BufferGeometry(); const motePos = new Float32Array(MOTES * 3);
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = (Math.random() - 0.5) * 24; motePos[i * 3 + 1] = 0.3 + Math.random() * 3; motePos[i * 3 + 2] = (Math.random() - 0.5) * 14; }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xd8b98a, size: 0.07, transparent: true, opacity: 0.55 }));
motes.frustumCulled = false; scene.add(motes);
let camShake = 0;
function addShake(v) { camShake = Math.min(0.45, camShake + v); }
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
  addShake(0.3); sfx.whistle(2); // judge whistle + flag raise (animated in animatePullers)
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
    h.torso.rotation.z = -p.side * lean * 0.35; // strain lean away from rope centre
    h.head.position.y = 0.74 - lean * 0.06; // head down under effort
    h.head.rotation.x = lean * 0.35 + Math.sin(p.phase * 0.5) * 0.03; // bob tied to pull phase
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
      spawn(h.g.position.x, 0.2, h.g.position.z, 5, 0x9fc3e2, 2.4, 2.8); // puddle splash on slip
      dropFootprint(h.g.position.x, h.g.position.z, Math.random() * 0.6 - 0.3);
      if (p.side < 0) { addShake(0.12); if (Math.random() < 0.3) sfx.slip(); }
    }
  }
  // judge waves flag when round decided / idle bounce
  judge.head.position.y = 0.74 + Math.abs(Math.sin(t * 2)) * 0.02;
  // judge flag raise on round end
  const flagRaise = (game.phase === 'roundEnd' || game.phase === 'matchEnd') ? 1 : 0;
  judge.armR.rotation.x += ((-2.6 * flagRaise - 0.3 * (1 - flagRaise)) - judge.armR.rotation.x) * 0.12;
  judgeFlag.position.y = 1.9 + flagRaise * 0.5;
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
  if (camShake > 0.003) { // subtle impact/stumble shake
    camera.position.x += (Math.random() - 0.5) * camShake; camera.position.y += (Math.random() - 0.5) * camShake * 0.6;
    camShake *= Math.pow(0.02, dt); // fast decay
  } else camShake = 0;
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
  // flag + bunting: vertex sin-wave cloth
  for (let i = 0; i < waveFlags.length; i++) waveCloth(waveFlags[i], t, i * 1.3, 0.14);
  for (let i = 0; i < buntingFlags.length; i++) waveCloth(buntingFlags[i], t, i * 0.7, 0.06);
  // clouds drift, motes float, footprints fade, periodic footprints while pulling
  for (const cl of clouds) { cl.position.x += cl.userData.speed * dt; if (cl.position.x > 75) cl.position.x = -75; }
  for (let i = 0; i < MOTES; i++) { motePos[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.15; motePos[i * 3 + 1] += Math.sin(t * 0.4 + i * 1.7) * dt * 0.08; }
  moteGeo.attributes.position.needsUpdate = true;
  for (const f of footprints) if (f.life > 0) { f.life -= dt; f.m.material.opacity = Math.max(0, f.life / 4) * 0.5; if (f.life <= 0) f.m.position.y = -5; }
  footTimer -= dt;
  if (game.phase === 'play' && footTimer <= 0) { footTimer = 0.35; const p = pullers[(Math.random() * pullers.length) | 0]; if (p) dropFootprint(p.h.g.position.x, p.h.g.position.z + 0.2, Math.random() - 0.5); }
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
window.__booted = true;
tick();
