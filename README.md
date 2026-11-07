# NISHI: THE THIRD CALL

> *The living call your name three times. The dead only call twice. But something has learned to call a third time.*

A first-person Indian supernatural survival-horror game for desktop browsers. Chapter 1, **Platform Zero**, is a complete playable mission at a fictional abandoned railway junction near Kolkata during a monsoon night. You can play it solo against an AI ghost, co-op with up to four survivors, or 4-vs-1 with a player controlling the ghost, **The Caller**.

All characters, places (Nishipur Junction) and Project SHUNYA are original fiction.

---

## Quick start

Requirements: **Node.js 20.19+** (developed on Node 24) and a desktop browser with WebGL 2.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 and choose **Play Solo**. Solo play needs no server.

For multiplayer, also start the game server in a second terminal:

```bash
npm run dev:server
```

### Testing multiplayer locally

1. Run `npm run dev:server` and `npm run dev`.
2. Open http://localhost:5173 in **two browser windows**. Use a normal and a private window if you want separate guest profiles.
3. In window A choose **Multiplayer → Create private room**. Note the 5-character room code.
4. In window B choose **Multiplayer**, type the code, and press **Join**.
5. Pick roles. One player can switch to **The Caller**; with no ghost player, the AI Caller hunts the team. Non-hosts press **Ready**, then the host presses **Start match**.
6. When the match ends, the host can **Return everyone to the lobby**.

To test from another device on your LAN, open `http://<your-ip>:5173`. The client connects to `ws://<same-host>:2567` by default.

---

## Controls

| Key | Survivor | The Caller |
|---|---|---|
| WASD / mouse | Move / look (click the view to capture the mouse) | Move / look. The Caller drifts through doors. |
| Shift | Sprint (limited stamina) | — |
| Ctrl or C | Crouch (quieter, harder to see) | — |
| E | Interact · hide / leave hiding · hold to revive | — |
| F | Flashlight. Hold the beam on a hunting Caller to stun it. | — |
| Q | Character ability | — |
| Tab (hold) | Journal: objectives, inventory, clues, radio log | Journal |
| T | Team radio, with presets (multiplayer) | — |
| 1 / 2 / 3 / 4 | — | Voice Deception / Apparition / Blackout / Echo Trap |
| R | — | Hunt |
| Left click | — | Capture (during a hunt) |
| Esc | Pause / close panel | Pause |

Browsers reserve **Ctrl+W** outside fullscreen. Use **C** to crouch, or use **Pause → Fullscreen**, which also locks Ctrl and Tab.

---

## What is in this build

### Playable now
- **Platform Zero**, a full mission: a deserted platform with stairwells, the station master's office, the signal control room, a parked carriage, the ticket office, an underground passage with an alcove, a maintenance room, five hiding places, a locked collapsible exit gate, and a tunnel blocked by rubble and darkness.
- **Objectives:** find a flashlight → search the office (logbook and drawer key) → recover 3 reels (spawned at random from 9 spots) → solve the fuse-box puzzle → decode the announcement on the keypad → open the gate (this triggers a forced final hunt) → escape.
- **Solo:** checkpoints at each objective, failure with Retry-from-checkpoint or Restart, and a victory screen.
- **Interactive prologue:** a tape deck with a branching choice.
- **AI ghost:** roams, stalks and hunts; sees flashlights, hears sprinting; can be broken off by hiding or losing line of sight; stunned by flashlights.
- **Adaptive horror director:** nine handcrafted events chosen by threat, progress, isolation, cooldowns and priority, from a seeded RNG.
- **Threat escalation:** a 3:13 AM clock, and threat that rises over time and with objectives. At 100 threat the Caller makes "the third call" and hunts permanently.
- **Two survivors:** Aditi Sen has Echo Sense, which reveals the Caller, false sounds and forged radio messages. Kabir Khan revives 2.5× faster, has more endurance, and has Adrenaline.
- **Playable ghost:** five abilities with energy, cooldowns, a 60 s hunt grace period, a warning before each hunt, and server validation.
- **Multiplayer:** real Colyseus rooms. Public quick-match, private room codes, roles and characters, ready/start, server-authoritative movement checks, interactions, puzzles, captures, revives and win conditions, a survivor-only radio, reconnection within 30 s, the AI taking over if the ghost player leaves, and return to lobby.
- **Progression:** a guest profile, nine achievements, collectibles, chapter completion and character unlock conditions, all saved in local storage. Unlocks are earned in play only; there is nothing to buy.
- **Menus:** Play Solo, Multiplayer, Character Selection with a 3D turntable, Story Chapters (all 8 listed, only Chapter 1 playable), Unlocks & Progression, Settings and Credits.
- **Accessibility and settings:** subtitles; separate master, ambience, dialogue and effects volume; brightness; reduced flashing; reduced camera shake; horror intensity; graphics presets; FOV; sensitivity; invert-Y.

### Art and audio approach (be aware)
Everything is **procedural**, and no external assets are bundled:
- Materials are canvas-painted PBR sets (albedo, roughness and normal) with world-space UVs. Examples: wet platform tiles, two-tone railway plaster, terrazzo, rust, brick, ballast, corrugated sheet, coach paint and glazed tiles.
- Lighting is a pooled set of real lights plus emissive fixtures and fake volumetric cones. There is GPU rain, ground fog, lightning, and post-processing (bloom, grain, vignette, and chromatic smear near the Caller).
- Characters are primitive-built humanoids. The Caller uses a custom glitching, spectral shader.
- All sound is synthesised with Web Audio: rain, 50 Hz mains hum, footsteps by surface, the Indian phone-ring cadence, a PA chime, whispers, a drone and heartbeat, thunder and more. Spoken lines use the browser's built-in speech voices. Subtitles always carry every line.

This looks good for a prototype, but it is **not AAA-asset fidelity**. The rendering is built so modelled assets can replace the blockout. See *Next steps*.

### Not done yet (honest list)
- Chapters 2–8, and survivors Meera, Tenzin and Farah. They are registered as data and shown as locked or upcoming.
- Rebindable keys. Bindings are a data table in `apps/client/src/game/input.ts`, but there is no UI for them yet.
- Mobile or touch controls. A notice is shown on touch devices.
- A cloud profile backend. `ProfileRepository` in `apps/client/src/state/profile.ts` is the seam for Supabase or similar.
- Anti-cheat beyond movement, range and cooldown validation. The full world state, including survivor positions, is sent to every client, so a modified ghost client could see hidden players. Colyseus `StateView` filtering is the fix.
- Client-side prediction for remote players is simple interpolation. The local player is predicted, with server corrections.

---

## Architecture

```
packages/shared     Pure TypeScript game rules, used by BOTH the browser (solo) and the server (multiplayer)
  src/level/        Platform Zero as data (boxes, zones, lights, doors, hiding spots, nav graph) + LOS/A*/collision queries
  src/sim/          MatchSimulation (objectives, inventory, puzzles, AI Caller, abilities, revive, win/lose) + horror director
  src/data/         Characters, chapters, ghost abilities, story text, progression/achievements
  test/             34 unit tests (full playthrough, validation, director pacing, abilities, progression, level integrity)

apps/server         Colyseus 0.18 server. NishiRoom wraps MatchSimulation at 20 Hz, mirrors it into schema state
  test/             8 end-to-end tests with real WebSocket clients (codes, roles, start, lock, movement, abilities, AI takeover)

apps/client         Vite + React 19 + React Three Fiber 9 + Rapier 2 + postprocessing + Zustand
  src/game/         GameSession (LocalSession runs the shared sim; NetworkSession talks to the room), input, events, targeting
  src/three/        Level mesh/colliders, lights, weather, decor, characters, controllers, effects, procedural textures
  src/audio/        Procedural Web Audio engine + speech
  src/ui/           Menus, prologue, lobby, HUD, puzzles, journal, end screens
```

**Why this shape:** the same `MatchSimulation` decides everything in solo and multiplayer. The server is the authority online, and the browser runs it locally offline. Adding a chapter means adding a `LevelDef`, a chapter entry and story data. The core systems stay the same.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Client dev server on :5173 |
| `npm run dev:server` | Multiplayer server on :2567 (auto-reload) |
| `npm test` | All tests (shared + client + server) |
| `npm run typecheck` | TypeScript across all packages |
| `npm run build` | Production client build → `apps/client/dist` |
| `npm run start:server` | Run the server (production) |

---

## Deployment

### Frontend (static hosting)
1. Set the server URL at build time: `VITE_SERVER_URL=wss://your-game-server.example.com` (see `apps/client/.env.example`).
2. Run `npm run build`.
3. Deploy `apps/client/dist` to any static host, such as Netlify, Vercel, Cloudflare Pages or GitHub Pages. No secrets are needed or embedded.

### Game server (persistent WebSocket host)
The server needs a long-running Node.js process with WebSockets. It will not run on serverless functions.
- **Render, Railway or Fly.io:** set the start command to `npm run start -w @nishi/server`, and set the `PORT` environment variable if the platform requires it (default 2567). `Dockerfile.server` builds a container for it.
- **Colyseus Cloud** is also compatible.
- Put it behind TLS (`wss://`) when the site is served over HTTPS.
- A single process holds rooms in memory. Scaling out needs Colyseus' Redis presence and driver.

### CI
`.github/workflows/ci.yml` runs typecheck, tests and the build on every push and pull request.

---

## Performance notes
- Graphics presets change the pixel ratio, the number of pooled dynamic lights (4/6/8), the rain density, post-processing, flashlight shadows (High only), and texture resolution (256/512/1024).
- Measured on Intel Iris Xe at 1024×768 (Medium): about **6 ms** for a full scene render and about **4.5 ms** of JS per frame.
- Rapier ships as a large WASM bundle (~1.1 MB gzipped). The first load shows a "Threading the tape…" cover while it initialises.

## Next steps
1. Replace blockout props and characters with modelled, appropriately licensed glTF assets. Use KTX2 textures and add baked lightmaps.
2. Add a rebinding UI and gamepad support.
3. Filter state per client (`StateView`) so the ghost cannot read hidden survivors, and add server-side rate limits per action.
4. Add Supabase-backed profiles through `ProfileRepository`.
5. Build Chapter 2, *The House of Seven Locks*, on the same data-driven systems.
