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

## Files

- `index.html` — layout, HUD (timer/progress/stamina), bilingual overlays.
- `main.js` — Three.js scene + game loop (ES module).
- `style.css` — HUD, timing bar, touch button, overlay styling.
- `README.md` — this file.
