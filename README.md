# Tarik Tambang 3D — 17 Agustus Simulator 🇮🇩

Realistic 3D browser tug-of-war game for Indonesia's Independence Day (17 Agustus).
5 vs 5, mud field, rhythmic SPACE mashing, best-of-3 rounds.

## Run

No build step. Three.js loads from CDN (unpkg `three@0.160.0` via importmap), so you need internet access.

```bash
cd tarik-tambang
python3 -m http.server 8000
# then open http://localhost:8000
```

> `file://` will NOT work (ES modules + importmap require http).

## Controls

| Input | Action |
|---|---|
| `SPACE` (rhythm) | Pull / Tarik |
| `C` | Toggle follow-cam ↔ free orbit cam (mouse drag / wheel when orbit is ON) |
| `ENTER` | Start / next round |
| **TARIK! 🪢 button** | Touch / mouse pull |

Hit the **green sweet zone** on the timing bar for 1.5× power + combo.
Spamming drains **stamina** — when `CAPEK! / TIRED!` appears, rest a second to regen.

## Gameplay

- 5 red pullers (you) vs 5 white AI pullers with varied rhythm speeds.
- Pull the gold ribbon marker 🪢 past the rival line to win a round.
- Best-of-3, 60 s per round (closest side wins on timeout).
- AI gets +12% stronger each round.

## Scene

- Hemisphere + directional (shadow-mapped) lighting, fog, PBR-ish standard materials.
- Canvas-generated mud ground texture, gold center line, red/white win lines.
- Thick rope as `TubeGeometry` rebuilt each frame with tension-based sag.
- 10 animated low-poly pullers (lean + arm/leg swing), judge with waving flag, 46 jumping crowd members.
- Red-white bunting triangles, waving Indonesian flags, `MERDEKA • 17 AGUSTUS` gate banner.
- Mud-splash particles when slipping, gold sparks on sweet-zone hits, confetti on wins.
- Sound 100% WebAudio oscillators: pulls, whistle, win/lose jingles, crowd.

## Realism upgrade

- Renderer: `ACESFilmicToneMapping` (exposure 1.1), sRGB, `PCFSoftShadowMap`; warm sun + hemisphere + soft ambient bounce.
- Sky: gradient canvas sky dome, drifting low-poly clouds, distant tree/house/tent silhouettes.
- Ground: multi-layer mud canvas texture (base + speckles + patches) with a canvas `roughnessMap` (wet = smooth), puddle discs with low roughness, stones, grass tufts, mud furrows, rope barriers in front of the crowd.
- Rope: `TubeGeometry` along `CatmullRomCurve3` with twisted-fiber canvas texture repeated along its length, sag inverse to tension, high-frequency vibration at high tension, frayed cone ends.
- Characters: articulated pivot groups (hip/shoulder/waist/neck), varied skin tones, red-vs-white numbered shirts (canvas texture), varied shorts, eyes, cap/hair variation; strain lean, arm pull cycle, leg brace, head-down bob all driven by rope velocity/heat; foot-slide drops footprint decals.
- Flags/bunting: plane geometry with per-vertex sine-wave cloth (`waveCloth`), red-white.
- Feedback: mud + puddle-splash particles on slips, gold sparks, ambient dust/mud motes, fading footprint trail decals (pooled, 40), subtle camera shake on slip/round-end, confetti on wins, judge whistle + flag raise on round end.
- Performance: shared geometries, pooled particles/footprints, pre-allocated rope points and temp vectors, capped particle counts (400 + 80 motes), no per-frame allocations in the hot loop except the rebuilt rope tube (disposed each frame).

## Realism pass 2

- **Image-based lighting:** sky + sun + earth prefiltered with
  `PMREMGenerator` into `scene.environment`.
- **Procedural normal maps:** mud, rope and shirts get Sobel normals; the
  rope is a normal-mapped twisted-fibre tube.
- **Shadows:** 2048 PCFSoft, blurred, normal-biased.
- **People:** rounded torsos, capsule limbs, hands, feet, shoes, necks and
  printed jersey numbers on front and back (no more numbers smeared over
  the box sides). Feet sink into the mud under load.
- **Rope:** the centre marker is now a red-white cloth band with fluttering
  tails that lags behind the pull (elastic stretch), and the rope sags
  toward the middle.
- **Ambience:** synthesised wind / crowd murmur / cicadas; `M` mutes.
- **Atmosphere:** wind gusts, circling birds, drifting leaves, soft round
  mud and dust sprites, handheld camera micro-sway.


## Files

- `index.html` — layout, HUD (timer/progress/stamina), bilingual overlays.
- `main.js` — Three.js scene + game loop (ES module).
- `style.css` — HUD, timing bar, touch button, overlay styling.
- `README.md` — this file.
