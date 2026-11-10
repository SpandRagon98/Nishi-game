import { useEffect, useState } from 'react';
import { audio } from '../audio/engine';
import { music } from '../audio/music';
import { hasReconnectToken } from '../game/net';
import { runtime } from '../game/runtime';
import { useApp } from '../state/store';
import { MenuCanvas } from '../three/GameScene';
import { click, TapeLines } from './common';

export function MainMenu() {
  const go = useApp((s) => s.go);
  const openSettings = useApp((s) => s.openSettings);
  const profile = useApp((s) => s.profile);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    audio.startAmbience();
    music.setMood('menu');
    audio.updateAmbience({ indoor: false, underground: false, hum: 0.1, ghostDist: 99, hunting: false, signalRange: 1, menu: true });
  }, []);

  const playSolo = (prologue: boolean) => {
    useApp.setState({ start: { kind: 'solo' } });
    go(prologue ? 'prologue' : 'loading');
  };
  const seen = profile.story.prologueDone;
  // testing mode (dev builds only): straight into the station with the Studio panel open
  const studio = () => {
    runtime.studio.on = true;
    playSolo(false);
  };
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('studio') && !runtime.studio.on) studio();
  }, []);

  const items: { label: string; sub: string; act: () => void }[] = [
    seen
      ? { label: 'Continue the Story', sub: 'Chapter 1 · Platform Zero', act: () => playSolo(false) }
      : { label: 'Begin the Story', sub: 'Start here · the cassette, then Platform Zero', act: () => playSolo(true) },
    ...(seen ? [{ label: 'Replay the Prologue', sub: "Your mother's cassette", act: () => playSolo(true) }] : []),
    // the hosted build (GitHub Pages) has no game server, so it is story-only
    ...(import.meta.env.VITE_SOLO_ONLY ? [] : [{ label: 'Multiplayer', sub: hasReconnectToken() ? 'Rejoin your last room, or start a new one' : '1–4 survivors · optional playable Caller', act: () => go('lobby') }]),
    { label: 'Character Selection', sub: 'Survivors and the Caller', act: () => go('characters') },
    { label: 'Story Chapters', sub: 'Eight locations · one voice', act: () => go('chapters') },
    { label: 'Unlocks & Progression', sub: `${profile.achievements.length} achievements · ${profile.collectibles.length} fragments`, act: () => go('unlocks') },
    { label: 'Settings', sub: 'Audio · graphics · accessibility', act: () => openSettings('menu') },
    { label: 'Credits', sub: '', act: () => go('credits') },
    ...(import.meta.env.DEV ? [{ label: 'Testing Studio', sub: 'Dev only · jump to any step, view the Caller, cutscenes, notes', act: studio }] : []),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowDown') setHover((h) => (h + 1) % items.length);
      else if (e.code === 'ArrowUp') setHover((h) => (h + items.length - 1) % items.length);
      else if (e.code === 'Enter') {
        click();
        items[hover].act();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="menu">
      <MenuCanvas />
      <div className="menu-shade" />
      <TapeLines />
      <div className="menu-inner">
        <header className="brand">
          <div className="brand-bengali">নিশি</div>
          <h1 className="brand-title">NISHI</h1>
          <div className="brand-sub">THE THIRD CALL</div>
          <p className="brand-tag">
            The living call your name three times. The dead only call twice.
            <br />
            But something has learned to call a third time.
          </p>
        </header>
        <nav className="menu-list" aria-label="Main menu">
          {items.map((it, i) => (
            <button
              key={it.label}
              className={`menu-item${i === hover ? ' hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => {
                click();
                it.act();
              }}
            >
              <span className="menu-index">{String(i + 1).padStart(2, '0')}</span>
              <span className="menu-label">{it.label}</span>
              {it.sub && <span className="menu-sub">{it.sub}</span>}
            </button>
          ))}
        </nav>
        <footer className="menu-foot">
          <span>Signed in as guest · {profile.name}</span>
          <span className="rec">● REC 03:13</span>
          <span>Headphones recommended · Desktop, keyboard &amp; mouse</span>
        </footer>
      </div>
    </div>
  );
}
