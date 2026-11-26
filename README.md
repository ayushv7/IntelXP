# AI PC Quest — 1 Million Minds

An interactive retail kiosk experience that turns "Why an AI PC?" into "I want this AI PC!":
a 60–90 second 3D racing game, a short quiz, a personalized Intel Core Ultra recommendation,
a side-by-side comparison, and a "show this to an associate" end screen.

Static HTML/CSS/vanilla JS + Three.js (r160 via CDN). No build step.

## Run locally

You can double-click `index.html` to open it directly, or serve the folder:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder's contents to the `main` branch at the repo root:
   ```bash
   git init && git add . && git commit -m "AI PC Quest"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages**. Under **Build and deployment**, set **Source: Deploy from a branch**, then **Branch: `main` / `(root)`**, and save.
3. After about a minute the site is live at `https://<you>.github.io/<repo>/`.

All paths are relative, so the site works from a sub-path. `.nojekyll` is included so Pages serves the files as they are.

## Kiosk setup

- Use the fullscreen button in the top-right corner, or launch Chrome in kiosk mode:
  `google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://<you>.github.io/<repo>/`
- After 60 s with no input the experience resets to the landing screen. A "Still there?" warning appears at 50 s.
- The kiosk needs internet access for the Three.js CDN and Google Fonts. If the 3D engine can't load, the game shows a friendly fallback and the journey continues.

## Editing product data — `js/processors.js`

This one file holds every processor name, model, spec, image, explanation, quiz option, tier rule, and comparison row.

- **Everything there is a PLACEHOLDER until you verify it** against official Intel sources and the SKUs your store actually stocks. Competitor names and values are deliberately generic.
- Once the data is verified, set `showPlaceholderBadges: false` to hide the placeholder badges and notes.
- Tier logic: Gaming or Content Creation → `top` (Ultra 9). Work, Studying or Entertainment → `mid` (Ultra 7). Everyday Browsing only → `entry` (Ultra 5). The highest applicable tier wins.

## Visual style

- **Basic PC (stage 1–2):** low-resolution, flat-shaded, no shadows.
- **AI PC look (after the XeSS coin):** a vibrant stylized cartoon world, built for real-time PBR lighting:
  - Hand-painted albedo textures (generated procedurally, so there are no image files to load).
  - Bold outline silhouettes and an exaggerated chunky sports car.
  - A warm sun with soft shadows.
  - Sky-coloured reflections on glossy clear-coat paint, coins and road.
- **Scenery** is placed with spacing and open meadows, so the view stays uncluttered.

## Game design notes

| Beat | What changes | Hardware story (kept accurate) |
|---|---|---|
| Start | Boxy car, ~400 px render, flat colours, simulated 15–20 FPS | "A normal computer" |
| Coin 1 | Frame cap removed | GPU (Intel Arc) renders more frames |
| Coin 2 | Full res, rounded car, PBR lighting, shadows, reflections, headlights | AI upscaling (Intel XeSS) runs on the **GPU** |
| Congested zone | Traffic, obstacles, intentional stutter | Background tasks interfere |
| Coin 3 | Stutter removed; bloom, neon, particles | Hybrid cores + Thread Director; NPU handles AI extras at low power |

- The NPU is **never** credited with raising gaming FPS.
- The performance effects are **simulated** and time-based, so they look the same on every device. The HUD labels them "SIMULATED".
- The **FPS counter always shows real, measured rendered frames**.
- Auto-quality lowers the *real* render resolution and shadow/bloom cost when a device can't hold 50+ FPS. It never adds lag. On a high-refresh display with a capable GPU the game runs uncapped (120+ FPS).
- The three upgrade coins are guaranteed. They spawn in order and home in on the car, so they can't be missed.
- Collisions cost speed and +1 s of race time, but never end the race.

Controls: **W/↑** gas · **S/↓** brake · **A/D or ←/→** steer · **Shift/Space** boost · **Esc** exit. The on-screen touch buttons work with touch and with the mouse.

## Files

```
index.html          all screens
css/styles.css      design system (CSS variables, hex buttons and cards, HUD, responsive)
js/processors.js    editable product data (only file most people need to touch)
js/app.js           navigation, quiz, recommendation, comparison, idle reset, fullscreen
js/game.js          Three.js racing game + HUD
assets/*.svg        generic processor chip illustrations (no third-party logos)
```
