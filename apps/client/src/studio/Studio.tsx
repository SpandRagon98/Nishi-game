import { useEffect, useState } from 'react';
import { runtime } from '../game/runtime';
import { useApp } from '../state/store';
import type { GraphicsPreset } from '../state/settings';
import * as A from './actions';

const TABS = ['Steps', 'Story', 'Ghost', 'World', 'Look', 'Notes'] as const;
type Tab = (typeof TABS)[number];

/**
 * Testing Studio: a side panel over the running game (dev builds only). ` (backquote) opens and
 * closes it; while it is open the mouse is free and the game does not pause.
 */
export function Studio() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('Steps');
  const [, redraw] = useState(0);
  const refresh = () => redraw((n) => n + 1);

  useEffect(() => {
    runtime.studio.open = open;
    if (open) document.exitPointerLock();
  }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Backquote') return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // live readouts (ghost mode, power, objective) refresh a few times a second
  useEffect(() => {
    const id = setInterval(refresh, 400);
    return () => clearInterval(id);
  }, []);

  if (!open) {
    return (
      <button className="studio-tab-btn" onClick={() => setOpen(true)} title="Testing Studio ( ` )">
        STUDIO
      </button>
    );
  }
  return (
    <aside className="studio" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <header>
        <b>Testing Studio</b>
        <span className="studio-dim">dev only · ` to hide</span>
        <button onClick={() => setOpen(false)}>×</button>
      </header>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <div className="studio-body">
        {tab === 'Steps' && <Steps />}
        {tab === 'Story' && <Story />}
        {tab === 'Ghost' && <Ghost refresh={refresh} />}
        {tab === 'World' && <World refresh={refresh} />}
        {tab === 'Look' && <Look />}
        {tab === 'Notes' && <Notes />}
      </div>
    </aside>
  );
}

function Steps() {
  const done = runtime.snap?.world.objectives;
  return (
    <>
      <p className="studio-help">Jump to the start of any step: every earlier step is done for you and you stand next to where this one happens.</p>
      {A.STEPS.map((s, i) => (
        <button key={s.id} className={`studio-row${done?.[s.id] ? ' done' : ''}`} onClick={() => A.jumpTo(s.id)}>
          <span>{i + 1}</span> {s.title}
        </button>
      ))}
    </>
  );
}

function Story() {
  return (
    <>
      <h4>Cutscenes</h4>
      <p className="studio-help">Plays the sequence from where you stand (the "next goal" shots follow the current step).</p>
      {A.CUTSCENES.map((c) => (
        <button key={c.id} className="studio-row" onClick={() => A.cutscene(c.id)}>▶ {c.title}</button>
      ))}
      <h4>Story cards</h4>
      {A.BEATS.map((b) => (
        <button key={b.id} className="studio-row" onClick={() => A.beat(b.id)}>{b.title}</button>
      ))}
      <h4>Prologue</h4>
      <button className="studio-row" onClick={() => useApp.getState().go('prologue')}>Play the cassette prologue (leaves the station)</button>
    </>
  );
}

function Ghost({ refresh }: { refresh: () => void }) {
  const pinned = !!runtime.debugCaller;
  const pose = runtime.studio.ghost;
  const sim = A.local()?.sim;
  const set = (k: 'scare' | 'speed' | 'spin', v: number) => {
    if (pose) pose[k] = v;
    refresh();
  };
  return (
    <>
      <h4>Viewer</h4>
      <button className={`studio-row${pinned ? ' on' : ''}`} onClick={() => (A.showGhost(!pinned), refresh())}>
        {pinned ? 'Hide the Caller' : 'Show the Caller in front of me'}
      </button>
      {pinned && pose && (
        <div className="studio-sliders">
          <label>Lunge / reach <input type="range" min={0} max={1} step={0.01} value={pose.scare} onChange={(e) => set('scare', +e.target.value)} /></label>
          <label>Speed (hair, hem) <input type="range" min={0} max={1} step={0.01} value={pose.speed} onChange={(e) => set('speed', +e.target.value)} /></label>
          <label>Turn <input type="range" min={-3.14} max={3.14} step={0.01} value={pose.spin} onChange={(e) => set('spin', +e.target.value)} /></label>
          <label className="studio-check"><input type="checkbox" checked={pose.stunned} onChange={(e) => ((pose.stunned = e.target.checked), refresh())} /> Stunned (burned by the beam)</label>
          <button className="studio-row" onClick={() => (A.showGhost(true), refresh())}>Bring her in front of me again</button>
        </div>
      )}
      <h4>Scares</h4>
      <button className="studio-row" onClick={A.jumpScare}>Jump scare, right now</button>
      <h4>AI</h4>
      <p className="studio-help">Caller: <b>{runtime.snap?.ghost.mode ?? '-'}</b></p>
      <button className="studio-row" onClick={() => A.ghost('hunt')}>Start a hunt</button>
      <button className="studio-row" onClick={() => A.ghost('calm')}>End the hunt</button>
      <label className="studio-check"><input type="checkbox" checked={!!sim?.debug.calm} onChange={(e) => (A.setDebug('calm', e.target.checked), refresh())} /> Calm: she never hunts</label>
      <label className="studio-check"><input type="checkbox" checked={!!sim?.debug.god} onChange={(e) => (A.setDebug('god', e.target.checked), refresh())} /> God mode: she can't take you</label>
    </>
  );
}

function World({ refresh }: { refresh: () => void }) {
  const st = runtime.studio;
  return (
    <>
      <label className="studio-check"><input type="checkbox" checked={st.fly} onChange={(e) => ((st.fly = e.target.checked), refresh())} /> Free camera (WASD + mouse, Shift fast, Space/C up/down)</label>
      <label className="studio-check"><input type="checkbox" checked={st.paused} onChange={(e) => ((st.paused = e.target.checked), refresh())} /> Freeze the world (Caller, timers)</label>
      <p className="studio-help">Power is {runtime.snap?.world.power ? 'on' : 'off'}: jump to step 5 or later to see the station lit.</p>
      <h4>Go to</h4>
      {A.PLACES.map((p) => (
        <button key={p.label} className="studio-row" onClick={() => A.teleport(p.at, p.look)}>{p.label}</button>
      ))}
    </>
  );
}

function Look() {
  const graphics = useApp((s) => s.settings.graphics);
  const showFps = useApp((s) => s.settings.showFps);
  const [clean, setClean] = useState(document.body.classList.contains('studio-clean'));
  return (
    <>
      <h4>Graphics</h4>
      <div className="studio-seg">
        {(['auto', 'low', 'medium', 'high'] as GraphicsPreset[]).map((g) => (
          <button key={g} className={g === graphics ? 'on' : ''} onClick={() => useApp.getState().setSettings({ graphics: g })}>{g}</button>
        ))}
      </div>
      <label className="studio-check"><input type="checkbox" checked={showFps} onChange={(e) => useApp.getState().setSettings({ showFps: e.target.checked })} /> FPS meter</label>
      <label className="studio-check">
        <input type="checkbox" checked={clean} onChange={(e) => (document.body.classList.toggle('studio-clean', e.target.checked), setClean(e.target.checked))} /> Hide the HUD (clean view)
      </label>
    </>
  );
}

function Notes() {
  const [text, setText] = useState('');
  const [shot, setShot] = useState(true);
  const [status, setStatus] = useState('');
  const save = async () => {
    if (!text.trim()) return;
    setStatus('Saving…');
    try {
      const r = await A.saveNote(text.trim(), shot);
      setText('');
      setStatus(`Saved to ${r.file} (${r.count} notes so far)`);
    } catch (e) {
      setStatus(`Could not save: ${(e as Error).message}`);
    }
  };
  return (
    <>
      <p className="studio-help">
        Write what should change. Each note is saved with where you are, what you're looking at and a screenshot, in <b>studio-notes/</b>. Then ask
        Claude to "apply my studio notes".
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. the door lamp is too bright; make the ghost slower here…" rows={6} />
      <label className="studio-check"><input type="checkbox" checked={shot} onChange={(e) => setShot(e.target.checked)} /> Attach a screenshot of this view</label>
      <button className="studio-row on" onClick={save}>Save note</button>
      {status && <p className="studio-help">{status}</p>}
      <pre className="studio-ctx">{A.context()}</pre>
    </>
  );
}
