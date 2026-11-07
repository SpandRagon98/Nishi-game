import {
  ACHIEVEMENTS, DOCUMENTS, FUSE_LABELS, FUSE_VALUES, GHOST_ABILITIES, OBJECTIVES, RADIO_PRESETS, SURVIVORS, logbookText,
  type GhostAbilityId, type WorldSnapshot,
} from '@nishi/shared';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { stopSpeech } from '../audio/speech';
import { handleSimEvent } from '../game/events';
import { forgetReconnect } from '../game/net';
import { netState, NetworkSession, type GameSession } from '../game/session';
import { enterFullscreen, lockPointer } from '../game/input';
import { resetFx } from '../game/fx';
import { LocalSession } from '../game/session';
import { intensityValue } from '../state/settings';
import { useApp } from '../state/store';
import { GameCanvas } from '../three/GameScene';
import { Btn, Meter } from './common';
import { SettingsPanel } from './Screens';

function useSnapshot(session: GameSession, ms = 120) {
  const [snap, setSnap] = useState<WorldSnapshot | null>(() => session.snapshot());
  useEffect(() => {
    const id = setInterval(() => setSnap(session.snapshot()), ms);
    return () => clearInterval(id);
  }, [session, ms]);
  return snap;
}

function relock() {
  lockPointer(document.querySelector('.game-canvas canvas'));
}

function closeOverlay() {
  useApp.getState().setOverlay(null);
  relock();
}

export function quitToMenu() {
  const s = useApp.getState();
  const session = s.session;
  session?.dispose();
  if (session instanceof NetworkSession) {
    forgetReconnect();
    void session.room.leave(true).catch(() => undefined);
  }
  audio.stopAllLoops();
  stopSpeech();
  if (document.pointerLockElement) document.exitPointerLock();
  useApp.setState({ session: null, room: null, start: null });
  s.resetGameUi();
  s.go('menu');
}

function restartSolo() {
  const s = useApp.getState();
  s.session?.dispose();
  audio.stopAllLoops();
  stopSpeech();
  resetFx();
  s.resetGameUi();
  useApp.setState({
    session: new LocalSession({ name: s.profile.name, characterId: s.profile.selectedSurvivor, intensity: intensityValue(s.settings.intensity) }),
  });
}

// ───────────────────────────── HUD pieces ─────────────────────────────

function Subtitles() {
  const subs = useApp((s) => s.subtitles);
  const enabled = useApp((s) => s.settings.subtitles);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);
  if (!enabled) return null;
  const t = performance.now();
  const live = subs.filter((s) => s.start <= t && s.end > t).slice(-2);
  return (
    <div className="subtitles">
      {live.map((s) => (
        <div key={s.id} className={`subtitle sub-${s.kind}${s.fake ? ' sub-fake' : ''}`}>
          {s.speaker && <span className="sub-speaker">{s.speaker}</span>}
          <span>{s.text}</span>
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);
  const t = performance.now();
  return (
    <div className="toasts">
      {toasts.filter((x) => x.until > t).map((x) => (
        <div key={x.id} className={`toast toast-${x.tone}`}>
          <div className="toast-title">{x.title}</div>
          {x.text && <div className="toast-text">{x.text}</div>}
        </div>
      ))}
    </div>
  );
}

function ChatFeed() {
  const chat = useApp((s) => s.chatLog);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);
  const t = performance.now();
  const recent = chat.filter((c) => t - c.at < 9000).slice(-5);
  if (!recent.length) return null;
  return (
    <div className="chat-feed">
      {recent.map((c) => (
        <div key={c.id}><b>{c.from}:</b> {c.text}</div>
      ))}
    </div>
  );
}

function SurvivorHud() {
  const h = useApp((s) => s.hud);
  const obj = OBJECTIVES.find((o) => o.id === h.objective);
  const [zoneShown, setZoneShown] = useState('');
  const last = useRef('');
  useEffect(() => {
    if (h.zone && h.zone !== last.current) {
      last.current = h.zone;
      setZoneShown(h.zone);
      const id = setTimeout(() => setZoneShown(''), 3200);
      return () => clearTimeout(id);
    }
  }, [h.zone]);
  return (
    <div className="hud">
      <div className="hud-tl">
        {obj && (
          <>
            <div className="kicker">Objective</div>
            <div className="hud-objective">{obj.title}</div>
          </>
        )}
      </div>
      <div className="hud-tr">
        <div className="tape-clock">{h.clock}<span> AM</span></div>
        <div className="signal" title="Radio interference — rises when the Caller is near">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={h.signal * 8 > i ? 'on' : ''} />
          ))}
        </div>
      </div>
      {zoneShown && <div className="zone-name" key={zoneShown}>{zoneShown}</div>}
      <div className="crosshair" />
      {h.prompt && (
        <div className="prompt">
          <kbd>E</kbd> {h.prompt}
        </div>
      )}
      {h.echo.length > 0 && (
        <div className="echo-ring">
          {h.echo.map((e, i) => (
            <div key={i} className={`echo-mark echo-${e.kind}`} style={{ transform: `rotate(${-e.angle}rad) translateY(-130px)` }}>
              <span style={{ transform: `rotate(${e.angle}rad)` }}>{e.kind === 'ghost' ? '◆' : '◇'} {Math.round(e.dist)}m</span>
            </div>
          ))}
        </div>
      )}
      <div className="hud-bl">
        {(h.stamina < 0.99 || h.exhausted) && (
          <div className="stamina">
            <Meter value={h.stamina} tone={h.exhausted ? 'crimson' : 'neutral'} label="Stamina" />
          </div>
        )}
        <div className="hud-status">
          <span className={h.hasFlashlight ? (h.flashlight ? 'on' : '') : 'off'}><kbd>F</kbd> Flashlight</span>
          <span className={h.abilityActive ? 'on' : h.abilityLeft > 0 ? 'off' : ''}>
            <kbd>Q</kbd> {h.abilityName}{h.abilityLeft > 0 ? ` ${Math.ceil(h.abilityLeft)}s` : ''}
          </span>
        </div>
      </div>
      {h.teammates.length > 0 && (
        <div className="hud-br">
          {h.teammates.map((t) => (
            <div key={t.id} className={`mate mate-${t.status}`}>{t.name} · {t.status === 'alive' ? 'OK' : t.status.toUpperCase()}</div>
          ))}
        </div>
      )}
      {h.hiding && <div className="hiding-slats"><div className="hiding-hint">Hold your breath. <kbd>E</kbd> to leave.</div></div>}
      {h.status === 'downed' && (
        <div className="downed">
          <div>You are down</div>
          <small>A teammate can revive you · {Math.ceil(h.bleedout)}s</small>
          <Meter value={h.reviveProgress} tone="spectral" />
        </div>
      )}
      {(h.status === 'captured' || h.status === 'escaped') && <div className="fade-black">{h.status === 'escaped' ? 'You made it out. Waiting for the others…' : 'The Caller has you. Waiting for the others…'}</div>}
      {h.downedNearby && <div className="revive-hint">Hold <kbd>E</kbd> to revive</div>}
    </div>
  );
}

function GhostHud() {
  const h = useApp((s) => s.hud);
  const g = h.ghost;
  if (!g) return null;
  return (
    <div className="hud ghost-hud">
      <div className="hud-tl">
        <div className="kicker">You are the Caller</div>
        <div className="hud-objective">
          {g.mode === 'hunt' ? `HUNTING · ${Math.ceil(g.huntLeft)}s — click to take a survivor` : g.mode === 'warn' ? 'Manifesting…' : g.mode === 'stunned' ? `Burned by light · ${Math.ceil(g.stunLeft)}s` : 'Stalk them. Deceive them. Hunt.'}
        </div>
      </div>
      <div className="hud-tr">
        <div className="tape-clock">{h.clock}<span> AM</span></div>
      </div>
      <div className="crosshair ghost-cross" />
      <div className="ghost-bar">
        <div className="energy">
          <span>Energy</span>
          <Meter value={g.energy / 100} tone="spectral" />
          <b>{Math.floor(g.energy)}</b>
        </div>
        <div className="abilities">
          {(Object.keys(GHOST_ABILITIES) as GhostAbilityId[]).map((id) => {
            const a = GHOST_ABILITIES[id];
            const cd = g.readyIn[id];
            const locked = id === 'hunt' && g.time < 60;
            const affordable = g.energy >= a.cost;
            return (
              <div key={id} className={`ability${cd > 0 || locked ? ' cooling' : ''}${!affordable ? ' poor' : ''}`} title={a.description}>
                <kbd>{a.key}</kbd>
                <span className="ab-name">{a.name}</span>
                <span className="ab-cost">{a.cost}</span>
                {(cd > 0 || locked) && <span className="ab-cd">{locked ? `${Math.ceil(60 - g.time)}s` : `${Math.ceil(cd)}s`}</span>}
                <div className="ab-fill" style={{ height: `${cd > 0 ? (cd / a.cooldown) * 100 : 0}%` }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="hud-br">
        {h.teammates.map((t) => (
          <div key={t.id} className={`mate mate-${t.status}`}>{t.name} · {t.status === 'alive' ? 'ALIVE' : t.status.toUpperCase()}</div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── overlays ─────────────────────────────

function Journal({ session }: { session: GameSession }) {
  const snap = useSnapshot(session, 300);
  const log = useApp((s) => s.radioLog);
  if (!snap) return null;
  const w = snap.world;
  const me = snap.survivors.find((s) => s.id === session.localId);
  return (
    <div className="overlay journal">
      <div className="journal-inner">
        <section>
          <h3>Objectives</h3>
          <ul className="objectives">
            {OBJECTIVES.map((o) => (
              <li key={o.id} className={w.objectives[o.id] ? 'done' : ''}>
                <span>{w.objectives[o.id] ? '✓' : '○'}</span>
                <div>
                  {o.title}
                  {!w.objectives[o.id] && <small>{o.hint}</small>}
                  {o.id === 'office' && !w.objectives.office && <small>Logbook {w.office.logbook ? '✓' : '○'} · Desk drawer {w.office.drawer ? '✓' : '○'}</small>}
                  {o.id === 'reels' && <small>{['reel_a', 'reel_b', 'reel_c'].filter((r) => w.collected.includes(r)).length}/3 recovered</small>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Inventory</h3>
          <ul className="inv">
            {me?.hasFlashlight && <li>Flashlight</li>}
            {w.inventory.includes('maintenance_key') && <li>Maintenance key</li>}
            {(['reel_a', 'reel_b', 'reel_c'] as const).filter((r) => w.collected.includes(r)).map((r) => (
              <li key={r}>Reel {r.slice(-1).toUpperCase()} — the voice counts <b>{w.reelDigits[r]}</b></li>
            ))}
            {!me?.hasFlashlight && w.inventory.length === 0 && <li className="muted">Nothing yet.</li>}
          </ul>
          <h3>Notes</h3>
          <ul className="inv">
            {w.fuse.clue && <li>Logbook fuse ratings: {w.fuse.clue.map((v, i) => `${FUSE_LABELS[i].toLowerCase()} ${v}A`).join(' · ')}</li>}
            {w.decodeOrder && <li>Announcement order: reel {w.decodeOrder.join(' → reel ')}</li>}
            {w.notes.map((n) => <li key={n}>{DOCUMENTS[n]?.title}</li>)}
            {!w.fuse.clue && !w.decodeOrder && !w.notes.length && <li className="muted">No notes.</li>}
          </ul>
        </section>
        <section>
          <h3>Radio log</h3>
          <div className="radio-log">
            {log.slice(-10).map((l) => (
              <p key={l.id}><b>{l.speaker || '…'}</b> {l.text}</p>
            ))}
          </div>
        </section>
      </div>
      <div className="journal-foot">Release Tab to close</div>
    </div>
  );
}

function DocViewer({ session }: { session: GameSession }) {
  const doc = useApp((s) => s.doc);
  const snap = useSnapshot(session, 500);
  if (!doc) return null;
  // the logbook is regenerated from the authoritative clue so it reads correctly after checkpoints
  const body = doc.title.includes('logbook') && snap?.world.fuse.clue ? logbookText(snap.world.fuse.clue) : doc.body;
  return (
    <div className="overlay doc" onClick={closeOverlay}>
      <div className="paper" onClick={(e) => e.stopPropagation()}>
        <h2>{doc.title}</h2>
        <pre>{body}</pre>
        <Btn onClick={closeOverlay}>Close (Esc)</Btn>
      </div>
    </div>
  );
}

function FusePuzzle({ session }: { session: GameSession }) {
  const snap = useSnapshot(session, 100);
  const w = snap?.world;
  useEffect(() => {
    if (w?.power) {
      const id = setTimeout(closeOverlay, 900);
      return () => clearTimeout(id);
    }
  }, [w?.power]);
  if (!w || !snap) return null;
  const lock = Math.max(0, w.fuse.lockoutUntil - snap.time);
  const cycle = (slot: number, dir: number) => {
    const values = FUSE_VALUES as readonly number[];
    const i = values.indexOf(w.fuse.slots[slot]);
    session.fuseSet(slot, values[(i + dir + values.length) % values.length]);
    audio.sfx('locked');
  };
  return (
    <div className="overlay puzzle">
      <div className="fusebox">
        <div className="kicker">Maintenance · Main distribution board</div>
        <h2>Fuse box</h2>
        <p className="muted">Fit each circuit with the right fuse rating, then close the breaker. The wrong rating will trip it, loudly.</p>
        <div className="fuses">
          {w.fuse.slots.map((v, i) => (
            <div key={i} className="fuse-slot">
              <div className="fuse-label">{FUSE_LABELS[i]}</div>
              <button onClick={() => cycle(i, 1)} aria-label="Increase">▲</button>
              <div className={`fuse fuse-${v}`}>{v}A</div>
              <button onClick={() => cycle(i, -1)} aria-label="Decrease">▼</button>
            </div>
          ))}
        </div>
        <div className="row">
          <Btn primary disabled={lock > 0 || w.power} onClick={() => session.fuseSubmit()}>
            {w.power ? 'Power restored' : lock > 0 ? `Breaker tripped · ${Math.ceil(lock)}s` : 'Close the breaker'}
          </Btn>
          <Btn onClick={closeOverlay}>Step away (Esc)</Btn>
        </div>
        {!w.fuse.clue && <p className="muted small">Somebody must have written down the ratings. The station master kept a log.</p>}
      </div>
    </div>
  );
}

function Keypad({ session }: { session: GameSession }) {
  const snap = useSnapshot(session, 100);
  const [code, setCode] = useState('');
  const w = snap?.world;
  useEffect(() => {
    if (w?.decoded) {
      const id = setTimeout(closeOverlay, 1200);
      return () => clearTimeout(id);
    }
  }, [w?.decoded]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) setCode((c) => (c + e.code.slice(-1)).slice(0, 3));
      if (e.code === 'Backspace') setCode((c) => c.slice(0, -1));
      if (e.code === 'Enter' && code.length === 3) {
        session.keypad(code);
        setCode('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!w || !snap) return null;
  const lock = Math.max(0, w.keypadLockoutUntil - snap.time);
  const press = (d: string) => {
    audio.sfx('keypad_ok');
    setCode((c) => (c + d).slice(0, 3));
  };
  return (
    <div className="overlay puzzle">
      <div className="console">
        <div className="kicker">Signal cabin · Public address</div>
        <h2>Announcement console</h2>
        <p className="muted">Enter the three numbers spoken on the reels, in the order the announcement called them.</p>
        <div className="lcd">{w.decoded ? 'DECODED' : lock > 0 ? `LOCKED ${Math.ceil(lock)}` : code.padEnd(3, '_').split('').join(' ')}</div>
        <div className="keys-grid">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⏎'].map((k) => (
            <button
              key={k}
              disabled={lock > 0 || w.decoded}
              onClick={() => {
                if (k === 'C') setCode('');
                else if (k === '⏎') {
                  if (code.length === 3) session.keypad(code);
                  setCode('');
                } else press(k);
              }}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="row">
          <Btn onClick={closeOverlay}>Step away (Esc)</Btn>
        </div>
        <p className="muted small">Check your journal (Tab) for the reel numbers and the announced order.</p>
      </div>
    </div>
  );
}

function ChatBox({ session }: { session: GameSession }) {
  const [text, setText] = useState('');
  const send = (t: string) => {
    if (t.trim()) session.chat(t.trim());
    closeOverlay();
  };
  return (
    <div className="overlay chatbox">
      <div className="panel">
        <h3>Team radio</h3>
        <div className="presets">
          {RADIO_PRESETS.map((p, i) => (
            <Btn key={p.id} small onClick={() => send(p.text)}>{i + 1}. {p.text}</Btn>
          ))}
        </div>
        <input
          autoFocus
          className="text"
          maxLength={120}
          placeholder="Say something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send(text);
            if (e.key === 'Escape') closeOverlay();
            if (!text && /^[1-6]$/.test(e.key)) {
              e.preventDefault();
              send(RADIO_PRESETS[Number(e.key) - 1].text);
            }
          }}
        />
        <p className="muted small">The Caller can forge radio messages. Aditi's Echo Sense exposes them.</p>
      </div>
    </div>
  );
}

function PauseMenu({ session }: { session: GameSession }) {
  const [settings, setSettings] = useState(false);
  return (
    <div className="overlay pause">
      <div className="pause-inner">
        {!settings ? (
          <>
            <div className="kicker">{session.kind === 'solo' ? 'Paused' : 'Menu — the match continues'}</div>
            <h2>NISHI</h2>
            <div className="col">
              <Btn primary onClick={closeOverlay}>Resume</Btn>
              <Btn onClick={() => setSettings(true)}>Settings</Btn>
              <Btn onClick={() => void enterFullscreen()}>Fullscreen (locks Ctrl / Tab keys)</Btn>
              {session.kind === 'solo' && <Btn onClick={restartSolo}>Restart chapter</Btn>}
              <Btn onClick={quitToMenu}>Quit to main menu</Btn>
            </div>
          </>
        ) : (
          <>
            <div className="row space">
              <h2>Settings</h2>
              <Btn onClick={() => setSettings(false)}>← Back</Btn>
            </div>
            <div className="pause-settings"><SettingsPanel /></div>
          </>
        )}
      </div>
    </div>
  );
}

function EndScreen({ session }: { session: GameSession }) {
  const end = useApp((s) => s.end);
  if (!end) return null;
  const { summary, progression, won } = end;
  const mins = Math.floor(summary.duration / 60);
  const secs = String(Math.round(summary.duration % 60)).padStart(2, '0');
  return (
    <div className={`overlay end ${won ? 'won' : 'lost'}`}>
      <div className="end-inner">
        <div className="kicker">{session.role === 'ghost' ? 'The Caller' : 'Platform Zero'}</div>
        <h1>{won ? (session.role === 'ghost' ? 'The third call was answered' : 'You escaped') : session.role === 'ghost' ? 'They got away' : 'Taken'}</h1>
        <p className="end-reason">{summary.reason}</p>
        <div className="end-stats">
          <span>Time {mins}:{secs}</span>
          <span>Fragments {summary.fragments.length}/3</span>
          {session.kind === 'solo' && <span>Checkpoints used {summary.checkpointsUsed}</span>}
        </div>
        {summary.players.length > 1 && (
          <table className="players">
            <tbody>
              {summary.players.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.role === 'ghost' ? 'The Caller' : SURVIVORS.find((s) => s.id === p.characterId)?.name}</td>
                  <td>{p.status === 'ghost' ? '' : p.status}</td>
                  <td>{p.stuns ? `${p.stuns} stun(s)` : ''} {p.revives ? `${p.revives} revive(s)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {progression && (progression.newAchievements.length > 0 || progression.newUnlocks.length > 0) && (
          <div className="end-unlocks">
            {progression.newAchievements.map((a) => (
              <div key={a} className="unlock">● Achievement: {ACHIEVEMENTS.find((x) => x.id === a)?.title}</div>
            ))}
            {progression.newUnlocks.map((u) => (
              <div key={u} className="unlock">◆ Unlocked: {SURVIVORS.find((s) => s.id === u)?.name ?? u}</div>
            ))}
          </div>
        )}
        <div className="row">
          {session.kind === 'solo' && !won && session.canRetry() && (
            <Btn primary onClick={() => {
              session.retry();
              resetFx();
              useApp.setState({ overlay: null, end: null });
              relock();
            }}>Retry from checkpoint</Btn>
          )}
          {session.kind === 'solo' && <Btn onClick={restartSolo}>{won ? 'Play again' : 'Restart chapter'}</Btn>}
          {session.kind === 'multi' && session.isHost() && <Btn primary onClick={() => session.returnToLobby()}>Return everyone to the lobby</Btn>}
          {session.kind === 'multi' && !session.isHost() && <span className="muted">Waiting for the host to return to the lobby…</span>}
          <Btn onClick={quitToMenu}>Main menu</Btn>
        </div>
      </div>
    </div>
  );
}

export function GameView() {
  const session = useApp((s) => s.session);
  const overlay = useApp((s) => s.overlay);
  // event routing lives at the DOM layer so it works even before the 3D canvas has mounted
  useEffect(() => (session ? session.onEvent((e) => handleSimEvent(e, session)) : undefined), [session]);
  // multiplayer: follow the room back to the lobby even if the end screen was never shown
  useEffect(() => {
    if (!(session instanceof NetworkSession)) return;
    const id = setInterval(() => {
      if (netState(session.room).phase === 'lobby') {
        session.dispose();
        useApp.setState({ session: null });
        useApp.getState().resetGameUi();
        useApp.getState().go('lobby');
      }
    }, 500);
    return () => clearInterval(id);
  }, [session]);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const on = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', on);
    return () => document.removeEventListener('pointerlockchange', on);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const ov = useApp.getState().overlay;
      if (ov === 'doc' || ov === 'fuse' || ov === 'keypad' || ov === 'chat') closeOverlay();
      else if (ov === 'pause') closeOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const sceneReady = useApp((s) => !!s.hud.zone);
  if (!session) return null;
  return (
    <div className="game">
      {!sceneReady && <div className="scene-cover"><span>Threading the tape…</span></div>}
      <GameCanvas key={session instanceof LocalSession ? session.sim.seed : session.localId} session={session} />
      {session.role === 'ghost' ? <GhostHud /> : <SurvivorHud />}
      <ChatFeed />
      <Subtitles />
      <Toasts />
      {!locked && !overlay && <div className="click-hint">Click to take control</div>}
      {overlay === 'journal' && <Journal session={session} />}
      {overlay === 'doc' && <DocViewer session={session} />}
      {overlay === 'fuse' && <FusePuzzle session={session} />}
      {overlay === 'keypad' && <Keypad session={session} />}
      {overlay === 'chat' && <ChatBox session={session} />}
      {overlay === 'pause' && <PauseMenu session={session} />}
      {overlay === 'end' && <EndScreen session={session} />}
    </div>
  );
}
