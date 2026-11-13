# NISHI: THE THIRD CALL

> *The living call your name three times. The dead only call twice. But something has learned to call a third time.*

A first-person Indian supernatural survival-horror game for desktop browsers. Chapter 1, **Platform Zero**, is a complete playable mission at a fictional abandoned railway junction near Kolkata on a misty night. You can play it solo against an AI ghost, co-op with up to four survivors, or 4-vs-1 with a player controlling the ghost, **The Caller**.

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
| Shift | Sprint (never runs out) | — |
| Ctrl or C | Crouch (quieter, harder to see) | — |
| E | Interact · hide / leave hiding · hold to revive | — |
| F | Light on/off: the phone torch at first, the flashlight once found. Hold the flashlight beam on a hunting Caller to stun it. | — |
| X | Swap between the phone torch and the flashlight (after you find it). | — |
| Q | Character ability | — |
| Tab (hold) | Journal: objectives, inventory, clues, radio log | Journal |
| T | Team radio, with presets (multiplayer) | — |
| 1 / 2 / 3 / 4 | — | Voice Deception / Apparition / Blackout / Echo Trap |
| R | — | Hunt |
| Left click | — | Capture (during a hunt) |
| Esc | Pause / close panel | Pause |

Browsers reserve **Ctrl+W** outside fullscreen. Use **C** to crouch, or use **Pause → Fullscreen**, which also locks Ctrl and Tab.

### Phones and tablets
Hold the phone sideways. The first tap goes fullscreen (and locks landscape on Android).
- **Left half:** a thumbstick appears wherever your thumb lands. Push it to the rim to sprint.
- **Right half:** drag to look around.
- **Buttons:** Use (hold to revive), Torch, the character ability, Crouch (toggle), Journal and pause.
- **iPhone:** Safari cannot make a web page fullscreen. Tap *Share → Add to Home Screen*; the game then opens from its own icon with no browser bars.

---

## What is in this build

### Playable now
- **Platform Zero**, a full mission: a deserted platform with stairwells, the station master's office, the signal control room, a parked carriage, the ticket office, an underground passage with an alcove, a maintenance room, five hiding places, a locked collapsible exit gate, and a tunnel blocked by rubble and darkness.
- **Objectives:** find a flashlight → search the office (logbook and drawer key) → recover 3 reels (spawned at random from 9 spots) → solve the fuse-box puzzle → decode the announcement on the keypad → open the gate (this triggers a forced final hunt) → escape.
- **Solo:** checkpoints at each objective, failure with Retry-from-checkpoint or Restart, and a victory screen.
- **Story first:** new players start with **Begin the Story** (returning players get Continue / Replay the Prologue; skipping takes a second Esc). The loading screen recaps the story and tonight's goal, and in play every turning point arrives as a story card (her torch, the station master's log, each reel's voice, the first hunt, the escape) that ends with a clear *Next* step. The journal (Tab) keeps "The story so far".
- **Guidance:** the HUD shows the current objective with a plain-language hint, and a marker at the top of the screen points along the walkable route to the next step with its distance (including "take the stairs up/down"). The fuse box shows the logbook ratings once read, and the console shows your reel numbers and the announced order, with a button to replay the announcement (using the console before you have every reel also replays it). It can be turned off in Settings.
- **Cutscenes:** after each task a storyboarded 8–14 s scene plays in 2.39:1 scope, cut like a film (inserts, handheld point-of-view, locked-off wides, long-lens push-ins, hard cuts). Each one is a beat of the story, with the Caller a little closer every time:
  - *Her torch:* the red kit in the beam; she sweeps the platform and the beam finds someone standing in the mist; it swings back and nobody is there.
  - *Ma's note:* the drawer slides open on Ma's handwriting ("Three reels. Three numbers. Do not let it call a third time."), read in her voice; the dead phone rings once; the Caller, barely there, walks past the doorway behind her.
  - *The last reel:* the reel where she found it, with Ma's voice from today on the tape; every light near her dies and something crosses behind her.
  - *Power:* the fuses; the platform waking a light at a time; a long lens on the Caller, faint, waiting under the last tube; the tube stutters, and when it steadies she is gone.
  - *Ma on the speakers:* the console takes the code, the station goes silent, and Ma's voice comes out of the platform horns.
  - *The run:* Kabir's headlights through the open doors; behind her, at the far end of the hall, the Caller says "Aditi." in Ma's voice and runs.

  The torch rides on the lens as the key light (exposure follows the subject's distance, so close-ups never blow out), item markers hide, and solo play pauses.
- **Nishir daak, the night call:** Bengali folklore says the Nishi calls your name at night in the voice of someone you love, and can only call twice, so you answer only the third call. This one has learned the third call. After Ma's note, in a quiet moment, Ma's voice calls "Aditi?" far off in one ear, then nearer and behind, then softly right behind her shoulder. Aditi half-believes it is her mother and talks herself out of it under her breath. Keep facing away and it passes; turn towards the third call and the Caller is standing there, and the hunt starts with a moment to run. It happens up to three times a night.
- **Voices:** Aditi talks to herself now and then when nothing is near, and after each task. Kabir talks to her over the radio from the car. Ma speaks from the cassette, the reels, her note, the phone and the station speakers. The Caller speaks only with Ma's voice. See *Voices* below for how they are recorded.
- **Interactive prologue:** a tape deck with a branching choice.
- **AI ghost:** roams, stalks and hunts; sees flashlights, hears sprinting; can be broken off by hiding or losing line of sight; stunned by flashlights.
- **Adaptive horror director:** nine handcrafted events chosen by threat, progress, isolation, cooldowns and priority, from a seeded RNG.
- **Threat escalation:** a 3:13 AM clock, and threat that rises over time and with objectives. At 100 threat the Caller makes "the third call" and hunts permanently.
- **Two survivors:** Aditi Sen has Echo Sense, which reveals the Caller, false sounds and forged radio messages. Kabir Khan revives 2.5× faster and has Adrenaline (sprint 30% faster for 6 s). Sprinting never tires anyone out.
- **Playable ghost:** five abilities with energy, cooldowns, a 60 s hunt grace period, a warning before each hunt, and server validation.
- **Multiplayer:** real Colyseus rooms. Public quick-match, private room codes, roles and characters, ready/start, server-authoritative movement checks, interactions, puzzles, captures, revives and win conditions, a survivor-only radio, reconnection within 30 s, the AI taking over if the ghost player leaves, and return to lobby.
- **Progression:** a guest profile, nine achievements, collectibles, chapter completion and character unlock conditions, all saved in local storage. Unlocks are earned in play only; there is nothing to buy.
- **Menus:** Play Solo, Multiplayer, Character Selection with a 3D turntable, Story Chapters (all 8 listed, only Chapter 1 playable), Unlocks & Progression, Settings and Credits.
- **Accessibility and settings:** subtitles; separate master, ambience, dialogue and effects volume; brightness; reduced camera shake; horror intensity; graphics presets (Auto/Low/Medium/High); optional FPS readout; FOV; sensitivity; invert-Y.

### Art and audio approach (be aware)
Everything is **procedural**, and no external assets are bundled:
- **Materials:** canvas-painted PBR sets (albedo, roughness and normal) with world-space UVs, broken up by a world-space weathering layer (grime blotches, rust drip streaks down walls, glossy damp patches on floors) so no two metres look alike, such as wet platform tiles, two-tone railway plaster, terrazzo, rust, brick, ballast, corrugated sheet, coach paint and glazed tiles.
- **Atmosphere:** no rain. Height-weighted mist is densest near the ground and in the passage, with drifting fog banks, a moon, moonlight shafts through a broken roof, and dust visible only inside torch beams. A night-sky environment map gives the wet floor its reflections.
- **Station:** a Howrah-style arched cast-iron train shed, public-address horns on the canopy posts, a brick arcade with iron grilles, sodium wall lanterns, cast-iron benches, a coin weighing machine, a shrine with dried marigolds and a diya, dead indicator boards, Bengali graffiti, abandoned belongings and weeds in the ballast.
- **Train:** a three-coach Kolkata suburban EMU rake with livery, barred windows, open doorways, bogies, roof ventilators, a raised pantograph and a cab with a working headlight. The last coach disappears into the tunnel. The walk-through coach has its own dim battery-fed saloon tubes.
- **Rendering:** pooled real lights that crossfade between fixtures, plus emissive fixtures and fake volumetric cones. Nothing strobes: power cuts, brown-outs and the Caller's drain all fade. Post-processing adds bloom on bright practicals only, a filmic grade (cool shadows, warm practicals, a sickly green in the mids), darkening grain, a vignette and SMAA anti-aliasing; SSAO only on High.
- **Underground passage:** deliberately lopsided: service pipes, a sagging cable and a cable tray along one wall only, a peeling green dado and torn notices on the other, tiles fallen off in patches, rubble and a dead light fitting hanging over the walkway.
- **Characters:** primitive-built humanoids. The Caller is a procedural, skinned woman: one 26-bone skeleton drives a single body in four draw calls. Her head is sculpted as one smooth surface (a long skull, high cheekbones over hollow cheeks, deep sockets with lidded milky eyes, a thin nose, thin grey lips that close over rotten teeth and tear open when the jaw drops to scream). She is thin but fleshed: a slender neck with the neck muscles and collarbones under the skin, sloping shoulders in a fitted blouse sleeve, arms that run in one piece from shoulder to wrist with a bony elbow, two-jointed fingers, a starved waist and a bust under the blouse. She wears a torn, grimy white saree with front pleats tucked in at the waist and the pallu over her shoulders. Her long wet black hair covers her whole scalp, layered from the crown down, each strand ending in its own tapered tip; it stays black under a torch, with only a thin wet sheen. A heavy fringe falls over her forehead and hangs in a curtain either side of her face, her eyes and mouth showing through the gap, and the rest falls to her waist. It hangs with gravity as her head moves and drapes along her back as she stoops, and she has grey mottled skin with veins, old bangles and glowing white eyes. She walks with a limp (one leg shorter and stiffer), hunched, her head twitching and snapping. Up close she lunges with her arms reaching and her mouth wide, and when the beam burns her she covers her face. Every apparition (the figures watching from the mist, the shapes crossing a doorway in a cutscene) is the Caller herself, faint and translucent; only a jump scare comes at you solid. In first person only the top of Aditi's phone shows at the bottom of the view; its torch trails your aim slightly and dims near walls so it never whites out the screen. Picking up the emergency flashlight equips it (a long, tight, brighter beam that lights the mist it passes through), held low so only its head, with a faint lit rim, shows in the corner of the view; X swaps back to the phone. Up close during a hunt the Caller lunges, head twitching and snapping, arms reaching for you.
- **Exit:** a pair of riveted steel doors with wired glass and a status lamp (red, amber while the motor runs, green when open) swing out into the exit corridor over the motor's 6 s. Beyond them the street shutter is jammed half up and Kabir's car waits outside, headlights pouring under it through the mist. Lamp cones, roof moon shafts and the headlights carry slowly drifting mist.
- **Prologue:** a 3D desk scene with a 1990s two-in-one radio-cassette player and a handwritten cassette, shot with depth of field.
- **Audio:** all synthesised with Web Audio, through a station-sized convolution reverb and a master limiter.
  - In play the mix is near silent: your footsteps (synthesised heel strike, sole roll and toe push-off in shoes, different on concrete, tile, wood, steel, gravel and water, softer and slower when creeping, a hard slap when running, every step a little different), your own breathing (a woman's for Aditi; synthesised from pink-noise airflow through nose and mouth resonances: calm nasal in-breaths, open-mouth gasps when running, in-breaths that catch when frightened, a faint voiced "hah" under strain, and every breath a little different) and a low whistling wind. The score and the extra ambience only play in menus and the prologue.
  - Menu ambience: wind through the shed, distant Kolkata traffic and horns, crickets, drips, a far-off train horn and dogs howling.
  - Voices: formant-synthesised screams (woman, man, through a telephone), the Caller's ring-modulated shriek, and moans.
  - Score: a detuned tanpura (Karplus-Strong), dissonant strings, trembling high strings, and dhol/tasha chase percussion with a Shepard tone during hunts.
  - Spoken lines play a recorded voice clip when `apps/client/src/assets/voice/<key>.mp3` exists for that exact text; otherwise the browser's speech voice reads them. Subtitles carry every line. The night call places Ma's voice in the world (one ear, far off, then behind her) and keeps panning it as she turns.

The atmosphere and lighting are a big step up, but this is still **not AAA-asset fidelity**. Modelled glTF assets are the next quality jump (see *Next steps*).

### Voices
The spoken lines are generated locally with [OmniVoice](https://huggingface.co/k2-fsa/OmniVoice), the engine behind [VoiceStudio](https://github.com/debpalash/voicestudio), on the CPU. Nothing is played aloud while generating.
- **The cast** (`CAST` in `scripts/voices/generate.py`):
  - Aditi: a young woman, Indian English, frightened and holding herself together, with a whispered variant for her thoughts.
  - Ma: middle-aged, low and warm, tired and urgent, with a whispered variant.
  - Kabir: a young man, low, steady for her sake.
  - The station announcer, and the old voice on the tape.

  Each voice is designed from attributes, and a reference take is recorded in that character's mood. Every line is cloned from it, so a character keeps one voice all the way through.
- **Where a line is heard** shapes it:
  - Kabir's radio is band-limited and saturated.
  - The cassette and reels have hiss and a small room.
  - The station speakers echo down the platform.
  - The Caller's last call is Ma's voice slowed, lowered and doubled with a whisper.
- **Every take is checked without listening.** It is transcribed with Whisper and its pitch is measured. A take that doesn't say its line in the character's register (the model sometimes returns noise) is redone with another seed and punctuation. The scores go to `scripts/voices/report.json`.

Setup (once): create a Python 3.11+ venv with `pip install omnivoice librosa soundfile transformers`, then download `k2-fsa/OmniVoice` and `openai/whisper-base.en` (or let them download on the first run). Then:
```
OMNIVOICE_MODEL=<model folder> WHISPER_MODEL=<whisper folder> python scripts/voices/generate.py
```
It records only lines without a clip. `--all` redoes every line, and `--refs` redoes the reference takes. `npx tsx scripts/voice-lines.ts --missing` lists what is left.

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
| `npm run studio` | Dev server, opened straight into the **Testing Studio** |
| `npm run ship` | Push `main` and publish it to production (GitHub Pages). Nothing ships without this |
| `npm run dev:server` | Multiplayer server on :2567 (auto-reload) |
| `npm test` | All tests (shared + client + server) |
| `npm run typecheck` | TypeScript across all packages |
| `npm run build` | Production client build → `apps/client/dist` |
| `npm run start:server` | Run the server (production) |

---

## Testing mode and production

There are two modes, and they never mix:

- **Testing mode** is the dev server (`npm run studio`, or http://localhost:5173/?studio, or *Testing Studio* in the dev menu). It drops you straight into the station with the **Testing Studio** panel open (press <kbd>`</kbd> to hide or show it; the game doesn't pause while it's open):
  - **Steps:** jump to the start of any of the seven steps. Every earlier step is done for you (flashlight, key, reels, power, code, doors) and you stand next to where that step happens.
  - **Story:** play any task cutscene, show any story card, or play the cassette prologue.
  - **Ghost:** pin the Caller in front of you and pose her (lunge and reach, hair speed, turn, stunned), fire a jump scare, start the night call (keep facing away, or turn to the third call), start or end a hunt, *Calm* (she never hunts) and *God mode* (she can't take you).
  - **World:** free camera (WASD + mouse, Shift fast, Space up, C down: click the view to steer), freeze the world, teleport to any room or object.
  - **Look:** graphics tier, FPS meter, hide the HUD for clean views.
  - **Notes:** write what should change. Each note is saved with where you were, what you were looking at and a screenshot in `studio-notes/` (git-ignored). Then ask Claude to "apply my studio notes".
- **Production** is the published site, https://spandragon98.github.io/Nishi-game/. Pushing to `main` does **not** publish anything. Production only changes when you run `npm run ship` (or press *Run workflow* on the *Deploy to GitHub Pages* action). The Studio only exists in dev builds: the production bundle doesn't contain it.

## Deployment

### GitHub Pages (story mode)
`.github/workflows/deploy.yml` tests, builds and publishes the game to GitHub Pages, only when started by hand (`npm run ship`). That build sets `VITE_SOLO_ONLY=1`, which removes Multiplayer from the menu, because Pages only serves static files. Asset paths are relative (`base: './'`), so the build works from the `/<repo>/` subfolder.

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
The renderer is built to hold 40–60 fps on ordinary laptops, and its tiers are ready for phones later.
- **Device tiers** (`apps/client/src/perf/device.ts`): on first load, *Auto* reads the GPU name, core count and memory and picks Mobile, Low, Medium or High. An Intel Iris Xe laptop gets Medium.
- **Profiles** (`state/settings.ts`): each tier sets the render-resolution range, pooled lights (2/3/4/6), post-processing, SSAO, flashlight shadows (High only), mist density, dust count, light cones, prop lights and texture size (256/512/1024).
- **Adaptive governor** (`three/PerfGovernor.tsx`): measures real frame times. Below about 42 fps it lowers render resolution in small steps, then turns off SSAO once for the rest of the session. With headroom above about 56 fps it raises resolution again. It never switches post-processing or turns SSAO back on mid-game: changing passes recompiles shaders and freezes the frame.
- **Shader warm-up** (`Warmup` in `three/GameScene.tsx`): before play, everything is drawn once off-screen, including the hidden ghost, apparitions and watchers, so her first appearance does not stall the game while shaders compile. *Settings → Show frame rate* displays fps, worst frame, render scale and draw calls.
- **Static batching** (`three/StaticBatch.tsx`): after load, everything in the station scenery that never moves is merged per material in 16 m cells. That is about 1,000 meshes in about 100 draw calls. Fans, flames and swinging lamps are detected and left alone.
- **Measured** on Intel Iris Xe at about 980×850 on Medium: draw calls fell from about 1,300 to 90–360 a frame depending on the view, and the frame rate holds 50–60 fps. Before these changes it was far below that.
- Rapier ships as a large WASM bundle (~1.1 MB gzipped). The first load shows a "Threading the tape…" cover while it initialises.
- **Mobile:** phones get the Mobile tier (half resolution, two lights, no post-processing), touch controls (`ui/TouchControls.tsx`) and a compact layout for short landscape screens. It has been checked in a phone-sized emulator, not yet on a real phone.

## Next steps
1. Replace blockout props and characters with modelled, appropriately licensed glTF assets. Use KTX2 textures and add baked lightmaps.
2. Replace the synthesised screams and breathing with recorded ones, and have a person listen through the generated voice lines.
3. Add a rebinding UI and gamepad support.
4. Filter state per client (`StateView`) so the ghost cannot read hidden survivors, and add server-side rate limits per action.
5. Add Supabase-backed profiles through `ProfileRepository`.
6. Build Chapter 2, *The House of Seven Locks*, on the same data-driven systems.
