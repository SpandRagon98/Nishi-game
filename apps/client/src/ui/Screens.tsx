import { Canvas, useFrame } from '@react-three/fiber';
import {
  ACHIEVEMENTS, CHAPTERS, GHOSTS, GHOST_ABILITIES, SURVIVORS, describeUnlock, isUnlocked, type GhostDef, type SurvivorDef,
} from '@nishi/shared';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { profileRepository } from '../state/profile';
import { DEFAULT_SETTINGS } from '../state/settings';
import { detectDevice } from '../perf/device';
import { useApp } from '../state/store';
import { Humanoid, spectralMaterial, type AnimState } from '../three/Characters';
import { Btn, ScreenFrame, Segmented, Slider, Toggle } from './common';

// ───────────────────────────── character select ─────────────────────────────

function Turntable({ survivor, ghost }: { survivor?: SurvivorDef; ghost?: GhostDef }) {
  const g = useRef<THREE.Group>(null);
  const anim = useRef<AnimState>({ speed: 0, crouch: false, down: false, phase: 0 });
  const mat = useMemo(() => (ghost ? spectralMaterial(ghost.palette.glow) : undefined), [ghost]);
  useFrame(({ clock }, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.4;
    if (mat) mat.uniforms.uTime.value = clock.elapsedTime;
  });
  const palette = survivor?.palette ?? { coat: '#000', accent: '#000', trousers: '#000', skin: '#000', hair: '#000' };
  return (
    <group ref={g} position={[0, -0.95, 0]}>
      <Humanoid palette={palette} anim={anim} characterId={survivor?.id} spectral={mat} height={ghost ? 0.95 : 1.05} />
    </group>
  );
}

function Portrait({ survivor, ghost, locked }: { survivor?: SurvivorDef; ghost?: GhostDef; locked: boolean }) {
  return (
    <div className={`portrait${locked ? ' locked' : ''}`}>
      <Canvas camera={{ position: [0, 0, 3.5], fov: 38 }} dpr={1} gl={{ antialias: true }}>
        <color attach="background" args={['#0b0b0c']} />
        <ambientLight intensity={0.25} />
        <spotLight position={[1.5, 3, 2]} intensity={40} angle={0.5} penumbra={0.8} color="#ffe3b5" />
        <pointLight position={[-2, 1, -1.5]} intensity={6} color={ghost ? '#7fa6c8' : '#8a2a22'} />
        <Turntable survivor={survivor} ghost={ghost} />
      </Canvas>
      {locked && <div className="lock-badge">LOCKED</div>}
    </div>
  );
}

export function CharacterSelect() {
  const profile = useApp((s) => s.profile);
  const updateProfile = useApp((s) => s.updateProfile);
  const [tab, setTab] = useState<'survivors' | 'ghosts'>('survivors');
  const [sel, setSel] = useState<string>(profile.selectedSurvivor);
  const list = tab === 'survivors' ? SURVIVORS : GHOSTS;
  const current = list.find((c) => c.id === sel) ?? list[0];
  const unlocked = isUnlocked(profile, current.unlock);
  const selectedId = tab === 'survivors' ? profile.selectedSurvivor : profile.selectedGhost;
  const isSurvivor = (c: SurvivorDef | GhostDef): c is SurvivorDef => 'ability' in c;

  return (
    <ScreenFrame title="Character Selection" kicker="Investigators · Entities">
      <div className="tabs">
        <button className={tab === 'survivors' ? 'active' : ''} onClick={() => { setTab('survivors'); setSel(profile.selectedSurvivor); }}>Survivors</button>
        <button className={tab === 'ghosts' ? 'active' : ''} onClick={() => { setTab('ghosts'); setSel(profile.selectedGhost); }}>Ghosts</button>
      </div>
      <div className="char-layout">
        <div className="char-list">
          {list.map((c) => {
            const ok = isUnlocked(profile, c.unlock);
            return (
              <button key={c.id} className={`char-card${c.id === current.id ? ' active' : ''}${!ok || !c.playable ? ' dim' : ''}`} onClick={() => setSel(c.id)}>
                <span className="char-name">{c.name}</span>
                <span className="char-role">{isSurvivor(c) ? c.profession : c.title}</span>
                <span className="char-state">{c.id === selectedId ? 'SELECTED' : !ok ? 'LOCKED' : !c.playable ? 'COMING LATER' : 'AVAILABLE'}</span>
              </button>
            );
          })}
        </div>
        <div className="char-detail">
          <Portrait survivor={isSurvivor(current) ? current : undefined} ghost={!isSurvivor(current) ? current : undefined} locked={!unlocked} />
          <div className="char-info">
            <h2>{current.name}</h2>
            <div className="kicker">{isSurvivor(current) ? `${current.profession} · ${current.origin}` : current.title}</div>
            <p>{isSurvivor(current) ? current.backstory : current.lore}</p>
            {isSurvivor(current) ? (
              <div className="ability-box">
                <div className="ability-head">[{current.ability.key}] {current.ability.name}{current.ability.cooldown ? ` · ${current.ability.cooldown}s cooldown` : ''}</div>
                <p>{current.ability.description}</p>
                <div className="ability-head">Passive</div>
                <p>{current.passive}</p>
              </div>
            ) : (
              <div className="ability-box">
                {current.playable
                  ? Object.values(GHOST_ABILITIES).map((a) => (
                      <p key={a.id}><b>[{a.key}] {a.name}</b> — {a.description} <span className="muted">({a.cost} energy · {a.cooldown}s)</span></p>
                    ))
                  : <p>{current.lore}</p>}
              </div>
            )}
            <div className="unlock-line">{unlocked ? (current.playable ? 'Unlocked' : 'Unlocked · arrives with its chapter') : `Unlock: ${describeUnlock(current.unlock)}`}</div>
            <Btn
              primary
              disabled={!unlocked || !current.playable || current.id === selectedId}
              onClick={() => updateProfile((p) => (tab === 'survivors' ? { ...p, selectedSurvivor: current.id } : { ...p, selectedGhost: current.id }))}
            >
              {current.id === selectedId ? 'Selected' : 'Select'}
            </Btn>
          </div>
        </div>
      </div>
    </ScreenFrame>
  );
}

// ───────────────────────────── chapters ─────────────────────────────

export function Chapters() {
  const profile = useApp((s) => s.profile);
  const go = useApp((s) => s.go);
  return (
    <ScreenFrame title="Story Chapters" kicker="The SHUNYA investigation">
      <div className="chapter-grid">
        {CHAPTERS.map((c) => {
          const done = profile.chaptersCompleted.includes(c.id);
          return (
            <div key={c.id} className={`chapter${c.available ? '' : ' unavailable'}`}>
              <div className="chapter-num">{String(c.index).padStart(2, '0')}</div>
              <h3>{c.title}</h3>
              <div className="kicker">{c.location}</div>
              <p>{c.synopsis}</p>
              <div className="chapter-foot">
                {c.available ? (
                  <>
                    <span>{done ? '✓ Completed' : 'Available'}</span>
                    <div className="row">
                      <Btn small onClick={() => { useApp.setState({ start: { kind: 'solo' } }); go('prologue'); }}>Prologue</Btn>
                      <Btn small primary onClick={() => { useApp.setState({ start: { kind: 'solo' } }); go(profile.story.prologueDone ? 'loading' : 'prologue'); }}>Play</Btn>
                    </div>
                  </>
                ) : (
                  <span className="muted">Not in this build — in development</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScreenFrame>
  );
}

// ───────────────────────────── unlocks ─────────────────────────────

export function Unlocks() {
  const profile = useApp((s) => s.profile);
  const st = profile.stats;
  const fmt = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);
  return (
    <ScreenFrame title="Unlocks & Progression" kicker={`Guest profile · ${profile.name}`}>
      <div className="unlock-layout">
        <section className="panel">
          <h3>Record</h3>
          <dl className="stats">
            <dt>Matches</dt><dd>{st.matches}</dd>
            <dt>Escapes</dt><dd>{st.escapes}</dd>
            <dt>Taken by the Caller</dt><dd>{st.captures}</dd>
            <dt>Best escape</dt><dd>{fmt(st.bestEscapeSec)}</dd>
            <dt>Flashlight stuns</dt><dd>{st.stuns}</dd>
            <dt>Revives</dt><dd>{st.revives}</dd>
            <dt>Wins as the Caller</dt><dd>{st.ghostWins} / {st.ghostMatches}</dd>
            <dt>Time in the dark</dt><dd>{fmt(st.playTimeSec)}</dd>
          </dl>
          <h3>Story fragments</h3>
          <p className="muted">{profile.collectibles.length} of 3 found on Platform Zero.</p>
        </section>
        <section className="panel">
          <h3>Achievements</h3>
          <ul className="achievements">
            {ACHIEVEMENTS.map((a) => {
              const got = profile.achievements.includes(a.id);
              return (
                <li key={a.id} className={got ? 'got' : ''}>
                  <span className="ach-mark">{got ? '●' : '○'}</span>
                  <span><b>{a.title}</b><br /><small>{a.description}</small></span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel">
          <h3>Characters</h3>
          <ul className="achievements">
            {[...SURVIVORS, ...GHOSTS].map((c) => {
              const ok = isUnlocked(profile, c.unlock);
              return (
                <li key={c.id} className={ok ? 'got' : ''}>
                  <span className="ach-mark">{ok ? '●' : '○'}</span>
                  <span><b>{c.name}</b><br /><small>{ok ? (c.playable ? 'Unlocked' : 'Unlocked · arrives with its chapter') : describeUnlock(c.unlock)}</small></span>
                </li>
              );
            })}
          </ul>
          <p className="muted small">No purchases. Every unlock is earned in play.</p>
        </section>
      </div>
    </ScreenFrame>
  );
}

// ───────────────────────────── settings ─────────────────────────────

export function SettingsPanel() {
  const s = useApp((st) => st.settings);
  const autoTier = detectDevice().tier;
  const set = useApp((st) => st.setSettings);
  const profile = useApp((st) => st.profile);
  const updateProfile = useApp((st) => st.updateProfile);
  const [name, setName] = useState(profile.name);
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <div className="settings-grid">
      <section className="panel">
        <h3>Audio</h3>
        <Slider label="Master" value={s.master} onChange={(v) => set({ master: v })} />
        <Slider label="Ambience" value={s.ambience} onChange={(v) => set({ ambience: v })} />
        <Slider label="Dialogue" value={s.dialogue} onChange={(v) => set({ dialogue: v })} />
        <Slider label="Effects" value={s.effects} onChange={(v) => set({ effects: v })} />
        <Slider label="Music" value={s.music} onChange={(v) => set({ music: v })} />
        <Toggle label="Spoken voice lines" hint="Uses your browser's speech voices" value={s.voiceLines} onChange={(v) => set({ voiceLines: v })} />
      </section>
      <section className="panel">
        <h3>Graphics</h3>
        <Segmented label="Preset" value={s.graphics} options={[{ v: 'auto', l: `Auto (${autoTier})` }, { v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }]} onChange={(v) => set({ graphics: v })} />
        <Slider label="Brightness" value={s.brightness} min={0.6} max={1.8} onChange={(v) => set({ brightness: v })} format={(v) => v.toFixed(2)} />
        <Slider label="Field of view" value={s.fov} min={60} max={95} step={1} onChange={(v) => set({ fov: v })} format={(v) => `${v}°`} />
        <Toggle label="Show frame rate" hint="FPS, render scale and draw calls in the corner" value={s.showFps} onChange={(v) => set({ showFps: v })} />
        <p className="muted small">Auto picks a profile for this device; in play, render resolution then adapts to hold 45–60 fps. High adds flashlight shadows and ambient occlusion. Texture quality changes apply on the next load.</p>
      </section>
      <section className="panel">
        <h3>Accessibility</h3>
        <Toggle label="Subtitles" value={s.subtitles} onChange={(v) => set({ subtitles: v })} />
        <Toggle label="Reduced camera shake" hint="Removes head-bob and scare shake" value={s.reducedShake} onChange={(v) => set({ reducedShake: v })} />
        <Segmented label="Horror intensity" value={s.intensity} options={[{ v: 'low', l: 'Low' }, { v: 'normal', l: 'Normal' }, { v: 'high', l: 'High' }]} onChange={(v) => set({ intensity: v })} />
        <p className="muted small">Intensity scales how often scares happen and how aggressive the Caller is. It applies from the next match.</p>
      </section>
      <section className="panel">
        <h3>Controls &amp; profile</h3>
        <Slider label="Mouse sensitivity" value={s.mouseSensitivity} min={0.2} max={3} onChange={(v) => set({ mouseSensitivity: v })} format={(v) => v.toFixed(2)} />
        <Toggle label="Invert Y" value={s.invertY} onChange={(v) => set({ invertY: v })} />
        <label className="field">
          <span className="field-label">Name (spoken by the station)</span>
          <input className="text" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateProfile((p) => ({ ...p, name: name.trim() || 'Guest' }))} />
        </label>
        <div className="row">
          <Btn small onClick={() => set({ ...DEFAULT_SETTINGS })}>Restore defaults</Btn>
          {!confirmReset ? (
            <Btn small onClick={() => setConfirmReset(true)}>Reset progress…</Btn>
          ) : (
            <Btn small onClick={async () => { const p = await profileRepository.reset(); useApp.setState({ profile: p }); setConfirmReset(false); setName(p.name); }}>Confirm: erase all progress</Btn>
          )}
        </div>
        <table className="keys">
          <tbody>
            <tr><td>WASD</td><td>Move</td><td>Shift</td><td>Sprint</td></tr>
            <tr><td>Ctrl / C</td><td>Crouch</td><td>E</td><td>Interact · hide · revive</td></tr>
            <tr><td>F</td><td>Flashlight</td><td>Q</td><td>Ability</td></tr>
            <tr><td>Tab</td><td>Journal</td><td>T</td><td>Radio (multiplayer)</td></tr>
            <tr><td>1–4, R</td><td>Caller powers</td><td>Click</td><td>Caller: capture</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function SettingsScreen() {
  const back = useApp((s) => s.settingsReturn);
  return (
    <ScreenFrame title="Settings" kicker="Saved on this device" back={back}>
      <SettingsPanel />
    </ScreenFrame>
  );
}

// ───────────────────────────── credits ─────────────────────────────

export function Credits() {
  return (
    <ScreenFrame title="Credits" kicker="NISHI: THE THIRD CALL">
      <div className="credits">
        <p>An original work of fiction. All characters, places (including Nishipur Junction) and Project SHUNYA are invented.</p>
        <h3>Built with</h3>
        <p>Three.js · React Three Fiber · drei · Rapier physics · pmndrs postprocessing · Zustand · Colyseus · Vite · TypeScript</p>
        <h3>Art &amp; audio</h3>
        <p>Every texture, model and sound in this build is generated procedurally at runtime — canvas-painted materials, primitive-built props and characters, and Web Audio synthesis. Spoken lines use your browser's built-in speech voices.</p>
        <h3>Inspirations</h3>
        <p>The night-time railway stations of Bengal, monsoon rain on tin roofs, and the old folk belief that a voice which calls your name in the dark should not be answered.</p>
        <p className="muted small">Prototype build · Chapter 1 of 8.</p>
      </div>
    </ScreenFrame>
  );
}
