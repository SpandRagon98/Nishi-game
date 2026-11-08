import { CHAPTERS } from '@nishi/shared';
import { useEffect, useState } from 'react';
import { audio } from '../audio/engine';
import { resetFx } from '../game/fx';
import { LocalSession, NetworkSession } from '../game/session';
import { graphicsProfile, intensityValue } from '../state/settings';
import { useApp } from '../state/store';
import { getTextures } from '../three/textures';
import { Btn, Meter, TapeLines } from './common';

/** Atmospheric loading card: prepares textures, builds the session, waits for a click (audio + pointer lock). */
export function Loading() {
  const start = useApp((s) => s.start);
  const go = useApp((s) => s.go);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [line, setLine] = useState(0);
  const chapter = CHAPTERS[0];

  useEffect(() => {
    let alive = true;
    const s = useApp.getState();
    void getTextures(graphicsProfile(s.settings.graphics).textureSize, (f) => alive && setProgress(f)).then(() => {
      if (!alive) return;
      setProgress(1);
      setTimeout(() => alive && setReady(true), 900);
    });
    const id = setInterval(() => setLine((l) => (l + 1) % chapter.loadingLines.length), 4200);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [chapter]);

  const begin = () => {
    const s = useApp.getState();
    audio.unlock();
    audio.startAmbience();
    resetFx();
    s.resetGameUi();
    s.session?.dispose();
    if (start?.kind === 'multi') {
      useApp.setState({ session: new NetworkSession(start.room) });
    } else {
      useApp.setState({
        session: new LocalSession({ name: s.profile.name, characterId: 'aditi' /* the story is Aditi's; Kabir waits in the car */, intensity: intensityValue(s.settings.intensity) }),
      });
    }
    go('game');
  };

  // multiplayer matches are already running: don't keep teammates waiting
  useEffect(() => {
    if (ready && start?.kind === 'multi') {
      const id = setTimeout(begin, 1500);
      return () => clearTimeout(id);
    }
  });

  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="loading">
      <div className="loading-art" />
      <TapeLines />
      <div className="loading-inner">
        <div className="kicker">Chapter {chapter.index} · {chapter.location}</div>
        <h1 className="loading-title">{chapter.title}</h1>
        <p className="loading-line" key={line}>{chapter.loadingLines[line]}</p>
        <section className="loading-story" aria-label="The story so far">
          <h2>The story so far</h2>
          <p>
            In 1999 your mother, <b>Mrinalini Sen</b>, walked into Nishipur Junction with SHUNYA field unit 4 and never came out.
            Tonight her cassette said she is <i>still on the platform</i>, and that something there copies voices.
          </p>
          <h2>Your goal tonight</h2>
          <ol>
            <li>Find a light, then search the station master's office.</li>
            <li>Recover her three hidden audio reels.</li>
            <li>Restore the power, decode the announcement, open the exit.</li>
          </ol>
          <p className="loading-warn">It will call your name. Do not let it call a third time.</p>
        </section>
        <div className="loading-bar">
          <Meter value={progress} tone="crimson" />
          <span>{ready ? 'The station is waiting.' : progress < 1 ? 'Developing the reels…' : 'Threading the tape…'}</span>
        </div>
        {ready && start?.kind !== 'multi' && <Btn primary onClick={begin}>Enter the station</Btn>}
        {ready && start?.kind === 'multi' && <p className="muted">Joining your team…</p>}
        <div className="controls-hint">
          {[['WASD', 'move'], ['Shift', 'sprint'], ['C', 'crouch'], ['E', 'interact'], ['F', 'flashlight'], ['Q', 'ability'], ['Tab', 'journal'], ['Esc', 'pause']].map(([k, v]) => (
            <span key={k}><kbd>{k}</kbd> {v}</span>
          ))}
        </div>
        <p className="loading-tip">The marker at the top of the screen always points to your next task.</p>
      </div>
    </div>
  );
}

/** First-launch screen while the procedural textures are painted. */
export function Boot({ progress }: { progress: number }) {
  return (
    <div className="loading boot">
      <TapeLines />
      <div className="loading-inner">
        <div className="brand-bengali">নিশি</div>
        <h1 className="brand-title small">NISHI</h1>
        <div className="loading-bar">
          <Meter value={progress} tone="crimson" />
          <span>Painting the station · {Math.round(progress * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
