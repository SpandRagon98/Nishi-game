import { Canvas } from '@react-three/fiber';
import { Component, Suspense, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { audio } from '../../audio/engine';
import '../cine.css';
import { Layers } from './Preview';
import { CineScene } from './Scene';
import { END, makeTimeline, type Overlay } from './script';
import { sound } from './sound';

/** if the cutscene cannot load (its models are kept out of the repo), the game goes straight on to its end screen */
class SkipOnError extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[nishi] the ending cutscene could not play', error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * "You're Not Alone": Aditi's ending, played in the game when she escapes the station, before the end
 * screen. Starts on its own (the player is already in the game, so sound may play); Space pauses,
 * S or Esc skips; when it ends or is skipped, `onDone` hands back to the game.
 */
export function Ending({ onDone, lite }: { onDone: () => void; lite: boolean }) {
  const overlay = useMemo<Overlay>(() => ({ black: 1, title: 0, line: 0, nar: -1, narAlpha: 0 }), []);
  const tl = useMemo(() => makeTimeline({ onPause: () => sound.pause(), onResume: () => sound.resume(), onSeek: (t) => sound.hush(t) }), []);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => tl.subscribe(rerender), [tl]);
  const [subs, setSubs] = useState(true);
  const [idle, setIdle] = useState(false);
  const done = useRef(false);
  const finish = useRef(() => {});
  finish.current = () => {
    if (done.current) return;
    done.current = true;
    tl.pause();
    sound.hush(END);
    sound.resume(); // pausing suspends the shared audio context: the game needs it back
    onDone();
  };

  useEffect(() => {
    audio.stopAllLoops(); // the station's heartbeat, tape and drones stop: she is outside now
    sound.start();
    tl.restart();
    return () => {
      tl.pause();
      sound.hush(END);
      sound.resume();
    };
  }, [tl]);

  // the last title card has faded: back to the game
  useEffect(() => {
    if (tl.ended) finish.current();
  });

  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2600);
    };
    const key = (e: KeyboardEvent) => {
      wake();
      if (e.code === 'Space') (e.preventDefault(), tl.toggle());
      else if (e.code === 'KeyS' || e.code === 'Escape') (e.preventDefault(), e.stopPropagation(), finish.current());
      else if (e.code === 'KeyC') setSubs((v) => !v);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', key, true);
    wake();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', key, true);
    };
  }, [tl]);

  return (
    <div className={`cine cine-ending${idle && tl.playing ? ' cine-idle' : ''}`}>
      <div className="cine-frame">
        <SkipOnError onError={() => finish.current()}>
          <Canvas
            className="cine-canvas"
            dpr={lite ? 1 : [1, 1.5]}
            shadows={lite ? false : 'percentage'}
            gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, stencil: false }}
            camera={{ fov: 40, near: 0.03, far: 140, position: [6, 1.5, 8] }}
          >
            <Suspense fallback={null}>
              <CineScene tl={tl} overlay={overlay} lite={lite} />
            </Suspense>
          </Canvas>
        </SkipOnError>
        <Layers tl={tl} overlay={overlay} subs={subs} />
      </div>
      <div className="cine-controls">
        <button onClick={() => tl.toggle()}>{tl.playing ? 'Pause' : 'Resume'}</button>
        <button onClick={() => finish.current()}>Skip</button>
        <button onClick={() => setSubs((v) => !v)} aria-pressed={subs}>Subtitles {subs ? 'on' : 'off'}</button>
      </div>
    </div>
  );
}
