import { useEffect, useState } from 'react';
import { audio } from './audio/engine';
import { installInput } from './game/input';
import { graphicsProfile } from './state/settings';
import { useApp } from './state/store';
import { getTextures } from './three/textures';
import { GameView } from './ui/GameView';
import { Boot, Loading } from './ui/Loading';
import { Lobby } from './ui/Lobby';
import { MainMenu } from './ui/MainMenu';
import { Prologue } from './ui/Prologue';
import { CharacterSelect, Chapters, Credits, SettingsScreen, Unlocks } from './ui/Screens';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function MenuToasts() {
  const toasts = useApp((s) => s.toasts);
  const screen = useApp((s) => s.screen);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);
  if (screen === 'game') return null;
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

export function App() {
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const [bootProgress, setBootProgress] = useState(0);
  const [booted, setBooted] = useState(false);
  const [gl] = useState(webglAvailable);
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches;

  useEffect(() => {
    installInput();
    void useApp.getState().initProfile();
    void getTextures(graphicsProfile(useApp.getState().settings.graphics).textureSize, setBootProgress).then(() => setBooted(true));
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    audio.setVolumes({ master: settings.master, ambience: settings.ambience, dialogue: settings.dialogue, effects: settings.effects });
  }, [settings.master, settings.ambience, settings.dialogue, settings.effects]);

  // Esc from sub-screens returns to the menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (e.code === 'Escape' && ['characters', 'chapters', 'unlocks', 'credits'].includes(s.screen)) s.go('menu');
      if (e.code === 'Escape' && s.screen === 'settings') s.go(s.settingsReturn);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!gl) {
    return (
      <div className="fatal">
        <h1>NISHI</h1>
        <p>This game needs WebGL. Please use a current desktop version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
      </div>
    );
  }
  if (!booted) return <Boot progress={bootProgress} />;

  return (
    <div className="app">
      {touch && screen === 'menu' && (
        <div className="touch-note">NISHI is built for desktop browsers with a keyboard and mouse. Touch controls are not supported yet.</div>
      )}
      {screen === 'menu' && <MainMenu />}
      {screen === 'prologue' && <Prologue />}
      {screen === 'characters' && <CharacterSelect />}
      {screen === 'chapters' && <Chapters />}
      {screen === 'unlocks' && <Unlocks />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'credits' && <Credits />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'loading' && <Loading />}
      {screen === 'game' && <GameView />}
      <MenuToasts />
    </div>
  );
}
