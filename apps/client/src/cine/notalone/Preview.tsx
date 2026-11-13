import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { CineScene } from './Scene';
import { END, NARRATION, SUBTITLES, makeTimeline, type Overlay } from './script';
import { sound } from './sound';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** the letterboxed frame, the subtitles and the title cards, written straight to the DOM each frame */
export function Layers({ tl, overlay, subs }: { tl: ReturnType<typeof makeTimeline>; overlay: Overlay; subs: boolean }) {
  const black = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const nar = useRef<HTMLDivElement>(null);
  const sub = useRef<HTMLDivElement>(null);
  const who = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLDivElement>(null);
  const en = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = -1;
    let narShown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = tl.time;
      if (black.current) black.current.style.opacity = String(overlay.black);
      if (title.current) title.current.style.opacity = String(overlay.title);
      if (line.current) line.current.style.opacity = String(overlay.line);
      if (nar.current) {
        nar.current.style.opacity = String(overlay.narAlpha);
        if (overlay.nar !== narShown && overlay.nar >= 0) nar.current.textContent = NARRATION[overlay.nar].text;
        narShown = overlay.nar;
      }
      // the clock shows real playback time (quiet stretches run a little faster than the script)
      if (bar.current) bar.current.style.transform = `scaleX(${tl.realAt(t) / tl.realAt(END)})`;
      if (clock.current) clock.current.textContent = `${fmt(tl.realAt(t))} / ${fmt(tl.realAt(END))}`;
      const i = SUBTITLES.findIndex((s) => t >= s.t0 && t < s.t1);
      if (i !== shown) {
        shown = i;
        const s = SUBTITLES[i];
        if (sub.current) sub.current.style.opacity = s ? '1' : '0';
        if (s && who.current && said.current && en.current) {
          who.current.textContent = s.who;
          said.current.textContent = s.said;
          en.current.textContent = s.en;
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [tl, overlay]);
  return (
    <>
      <div ref={black} className="cine-fade" />
      <div ref={sub} className="cine-sub" style={{ display: subs ? undefined : 'none' }}>
        <div ref={who} className="cine-sub-who" />
        <div ref={said} className="cine-sub-said" />
        <div ref={en} className="cine-sub-en" />
      </div>
      <div ref={title} className="cine-title">
        <div className="cine-title-name">NISHI: THE THIRD CALL</div>
        <div className="cine-title-chapter">CHAPTER 1 COMPLETE</div>
      </div>
      <div ref={nar} className="cine-nar" />
      <div ref={line} className="cine-title cine-title-line">Some things should never be brought back.</div>
      <div className="cine-progress"><div ref={bar} /></div>
      <span ref={clock} className="cine-clock" />
    </>
  );
}

export function Preview() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const lite = params.has('lite') || matchMedia('(pointer: coarse)').matches;
  const overlay = useMemo<Overlay>(() => ({ black: 1, title: 0, line: 0, nar: -1, narAlpha: 0 }), []);
  const tl = useMemo(() => makeTimeline({ onPause: () => sound.pause(), onResume: () => sound.resume(), onSeek: (t) => sound.hush(t) }), []);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => tl.subscribe(rerender), [tl]);
  const [started, setStarted] = useState(false);
  const [subs, setSubs] = useState(true);
  const [idle, setIdle] = useState(false);

  const start = () => {
    sound.start(); // inside the click: browsers only let sound start from a gesture
    setStarted(true);
    tl.restart();
  };
  const skip = () => {
    tl.pause();
    tl.seek(END);
  };
  useEffect(() => {
    if (params.has('autoplay')) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keys: space pause, R restart, S skip, C subtitles; the controls fade when the mouse is still
  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 2600);
    };
    const key = (e: KeyboardEvent) => {
      wake();
      if (!started) return;
      if (e.code === 'Space') (e.preventDefault(), tl.toggle());
      else if (e.code === 'KeyR') tl.restart();
      else if (e.code === 'KeyS') skip();
      else if (e.code === 'KeyC') setSubs((v) => !v);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', key);
    wake();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, tl]);

  return (
    <div className={`cine${idle && tl.playing ? ' cine-idle' : ''}`}>
      <div className="cine-frame">
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
        <Layers tl={tl} overlay={overlay} subs={subs} />
        {!started && (
          <div className="cine-card">
            <div className="kicker">Cutscene preview · not part of the game yet</div>
            <h1>You're Not Alone</h1>
            <p className="muted">Outside Platform Zero · 3:14 AM · about {Math.round(tl.realAt(END) / 60 * 10) / 10} min with titles</p>
            <button className="cine-play" onClick={start}>▶ Play</button>
            <p className="muted small">Headphones recommended. Space pause · R restart · S skip · C subtitles</p>
          </div>
        )}
        {started && tl.ended && (
          <div className="cine-card">
            <div className="kicker">End of preview</div>
            <h1>You're Not Alone</h1>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="cine-play" onClick={() => tl.restart()}>↺ Replay</button>
              <a className="cine-exit" href="./">Exit preview</a>
            </div>
          </div>
        )}
      </div>
      {started && !tl.ended && (
        <div className="cine-controls">
          <button onClick={() => tl.toggle()}>{tl.playing ? 'Pause' : 'Resume'}</button>
          <button onClick={() => tl.restart()}>Restart</button>
          <button onClick={skip}>Skip</button>
          <button onClick={() => setSubs((v) => !v)} aria-pressed={subs}>Subtitles {subs ? 'on' : 'off'}</button>
        </div>
      )}
      <div className="cine-badge">PREVIEW · temporary AI voices (placeholders) · not integrated</div>
    </div>
  );
}
