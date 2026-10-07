# The Block Is Haunted — hunt site

Static site for GitHub Pages. No build step.

```
index.html            the hunt (start screen → stations → finale)
lab/index.html        character lab (debug controls, cue editor)
src/engine.js         Agatha engine: rig, animator, painted layers, compositors
src/actors.js         ghosts (per-character idles, procedural eyes) and the jar (capture, fill states, finale release)
src/hunt.js           hunt: content, state machine, director, scanner, audio, HUD, persistence, dev mode
assets/witch/         witch.json (manifest, landmarks) + layers/*.png (painted layers, 1240×1700 canvas space)
assets/cues/          per-line cue tracks (t filled in from the lab's cue editor)
assets/audio/         opening.mp3, clue_01-08.mp3, correct_01-08.mp3, wrong_1-3.mp3, final.mp3, bg_loop.mp3  (not yet recorded)
assets/scenes/        station photos (00-entrance-wide … 08-office)  (not yet shot)
assets/ghosts/        ghost.json + body.png + props/*.png  (not yet generated; code-drawn placeholders are used until then, see docs/GHOST_DESIGN_BRIEF.md)
assets/vendor/        zxing.min.js (QR fallback when BarcodeDetector is unavailable)
```

## Deploy
Push this folder to a repo and enable GitHub Pages (root). Open `https://<user>.github.io/<repo>/`.
Station QR codes encode `https://<user>.github.io/<repo>/?c=1` … `?c=8` (or the station codes `hb1`…`hb8`).
Dev mode: add `?dev=1`, or tap the top-left corner five times.

## Local test
Any static server, e.g. `python3 -m http.server 8080` in this folder, then open http://localhost:8080/ on a phone on the same Wi-Fi (camera needs https or localhost; on a phone over LAN use https via a tunnel, or test the scanner only once deployed).
