import { useEffect, useRef, useState } from 'react';
import { mouse, sendKey, stick } from '../game/input';
import { useApp } from '../state/store';

/** how far the thumbstick knob travels, in px */
const RADIUS = 56;
/** screen px of drag → the same turn as that many px of mouse movement */
const LOOK = 2.4;

/**
 * Phone controls. The left half of the screen is a floating thumbstick (it appears wherever the thumb
 * lands; pushed to the rim it sprints), the right half is drag-to-look, and the buttons press the same
 * keys a keyboard would, so the game's own key handling does the rest.
 */
export function TouchControls() {
  const prompt = useApp((s) => s.hud.prompt);
  const hiding = useApp((s) => s.hud.hiding);
  const torch = useApp((s) => s.hud.flashlight);
  const hasFlash = useApp((s) => s.hud.hasFlashlight);
  const ability = useApp((s) => s.hud.abilityName);
  const cooldown = useApp((s) => Math.ceil(s.hud.abilityLeft));
  const overlay = useApp((s) => s.overlay);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [crouch, setCrouch] = useState(false);
  const t = useRef({ move: -1, look: -1, ox: 0, oy: 0, lx: 0, ly: 0 });

  const release = () => {
    stick.x = 0;
    stick.y = 0;
    t.current.move = -1;
    t.current.look = -1;
    setKnob(null);
  };
  // let go of everything when the controls go away (pause, a puzzle opening, leaving the game), or
  // she would keep walking afterwards
  const covered = !!overlay && overlay !== 'journal';
  useEffect(() => {
    if (covered) {
      release();
      sendKey('keyup', 'KeyE');
    }
  }, [covered]);
  useEffect(
    () => () => {
      release();
      sendKey('keyup', 'KeyC');
    },
    [],
  );

  const start = (e: React.TouchEvent) => {
    const r = t.current;
    for (const p of Array.from(e.changedTouches)) {
      if (p.clientX < window.innerWidth * 0.45 && r.move < 0) {
        r.move = p.identifier;
        r.ox = p.clientX;
        r.oy = p.clientY;
        setKnob({ ox: p.clientX, oy: p.clientY, x: 0, y: 0 });
      } else if (r.look < 0) {
        r.look = p.identifier;
        r.lx = p.clientX;
        r.ly = p.clientY;
      }
    }
  };
  const move = (e: React.TouchEvent) => {
    const r = t.current;
    for (const p of Array.from(e.changedTouches)) {
      if (p.identifier === r.move) {
        let dx = p.clientX - r.ox;
        let dy = p.clientY - r.oy;
        const d = Math.hypot(dx, dy);
        if (d > RADIUS) {
          dx *= RADIUS / d;
          dy *= RADIUS / d;
        }
        // a small dead zone so a resting thumb doesn't creep
        const live = d > RADIUS * 0.2;
        stick.x = live ? dx / RADIUS : 0;
        stick.y = live ? dy / RADIUS : 0;
        setKnob({ ox: r.ox, oy: r.oy, x: dx, y: dy });
      } else if (p.identifier === r.look) {
        mouse.dx += (p.clientX - r.lx) * LOOK;
        mouse.dy += (p.clientY - r.ly) * LOOK;
        r.lx = p.clientX;
        r.ly = p.clientY;
      }
    }
  };
  const end = (e: React.TouchEvent) => {
    const r = t.current;
    for (const p of Array.from(e.changedTouches)) {
      if (p.identifier === r.move) {
        r.move = -1;
        stick.x = 0;
        stick.y = 0;
        setKnob(null);
      } else if (p.identifier === r.look) r.look = -1;
    }
  };

  /** a button that holds its key while touched (Use also revives while held) */
  const hold = (code: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.stopPropagation();
      sendKey('keydown', code);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.stopPropagation();
      sendKey('keyup', code);
    },
  });

  if (covered) return null;
  const journal = overlay === 'journal';
  const sprint = knob ? Math.hypot(knob.x, knob.y) > RADIUS * 0.92 : false;
  return (
    <div className={`touch-pad${journal ? ' journal-open' : ''}`} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
      {knob && (
        <div className={`stick${sprint ? ' sprint' : ''}`} style={{ left: knob.ox, top: knob.oy }}>
          <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      )}
      {!knob && !journal && <div className="stick-hint">Move</div>}
      <div className="touch-top">
        <button className="tbtn small" onTouchStart={(e) => { e.stopPropagation(); useApp.getState().setOverlay('pause'); }}>❚❚</button>
        <button className={`tbtn small${journal ? ' on' : ''}`} onTouchStart={(e) => { e.stopPropagation(); useApp.getState().setOverlay(journal ? null : 'journal'); }}>Journal</button>
      </div>
      {!journal && (
        <div className="touch-buttons">
          <button className={`tbtn use${prompt || hiding ? ' ready' : ''}`} {...hold('KeyE')}>{hiding ? 'Leave' : 'Use'}</button>
          <button className={`tbtn${torch ? ' on' : ''}`} {...hold('KeyF')}>Torch</button>
          {hasFlash && <button className="tbtn" {...hold('KeyX')}>Swap</button>}
          <button className="tbtn" {...hold('KeyQ')}>{cooldown > 0 ? `${cooldown}s` : ability || 'Echo'}</button>
          <button
            className={`tbtn${crouch ? ' on' : ''}`}
            onTouchStart={(e) => {
              e.stopPropagation();
              sendKey(crouch ? 'keyup' : 'keydown', 'KeyC');
              setCrouch(!crouch);
            }}
          >
            Crouch
          </button>
        </div>
      )}
    </div>
  );
}
