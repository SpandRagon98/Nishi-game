import { useEffect, useState } from 'react';
import { audio } from '../audio/engine';
import { hasReconnectToken } from '../game/net';
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
    audio.updateAmbience({ indoor: false, underground: false, hum: 0.1, ghostDist: 99, hunting: false, signalRange: 1, menu: true });
  }, []);

  const playSolo = () => {
    useApp.setState({ start: { kind: 'solo' } });
    go(profile.story.prologueDone ? 'loading' : 'prologue');
  };

  const items: { label: string; sub: string; act: () => void }[] = [
    { label: 'Play Solo', sub: profile.story.prologueDone ? 'Chapter 1 · Platform Zero' : 'Begins with the prologue', act: playSolo },
    { label: 'Multiplayer', sub: hasReconnectToken() ? 'Rejoin your last room, or start a new one' : '1–4 survivors · optional playable Caller', act: () => go('lobby') },
    { label: 'Character Selection', sub: 'Survivors and the Caller', act: () => go('characters') },
    { label: 'Story Chapters', sub: 'Eight locations · one voice', act: () => go('chapters') },
    { label: 'Unlocks & Progression', sub: `${profile.achievements.length} achievements · ${profile.collectibles.length} fragments`, act: () => go('unlocks') },
    { label: 'Settings', sub: 'Audio · graphics · accessibility', act: () => openSettings('menu') },
    { label: 'Credits', sub: '', act: () => go('credits') },
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
