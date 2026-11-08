import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { GraphicsProfile } from '../state/settings';
import { usePerf } from '../perf/store';

/** frame rate the governor defends, and the rate above which it may spend headroom on sharpness */
const FLOOR = 42;
const CEIL = 56;

/**
 * Adaptive quality: measures real frame times and trades render resolution (then AO) for frame rate,
 * so the game holds ~45–60 fps from gaming laptops down to integrated graphics. Resolution changes are
 * small steps and rate-limited so they are not noticed. AO goes off at most once and never comes back
 * mid-game, and post-processing is never toggled here: switching passes recompiles shaders, which
 * freezes the frame for a third of a second and pops the look (the Caller's eyes stop glowing).
 */
export function PerfGovernor({ profile }: { profile: GraphicsProfile }) {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const st = useRef({ frames: 0, acc: 0, worst: 0, slow: 0, fast: 0, warm: 0, dpr: profile.dpr, degrade: 0, lastChange: 0, clock: 0 });

  // count every render pass of a frame (post-processing renders several), not just the last one
  const counts = useRef({ calls: 0, tris: 0 });
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    counts.current = { calls: gl.info.render.calls, tris: gl.info.render.triangles };
    gl.info.reset();
  }, -1000);

  useEffect(() => {
    st.current.dpr = profile.dpr;
    st.current.degrade = 0;
    // a profile change recompiles shaders: give it a few seconds before judging the frame rate
    st.current.warm = 0;
    setDpr(profile.dpr);
    usePerf.setState({ dpr: profile.dpr, degrade: 0 });
  }, [profile.tier, profile.dpr, setDpr]);

  useFrame((_, dt) => {
    const s = st.current;
    // ignore hitches while the tab is hidden or shaders are still compiling
    if (document.hidden || dt > 0.5) return;
    s.clock += dt;
    s.warm += dt;
    s.frames++;
    s.acc += dt;
    s.worst = Math.max(s.worst, dt);
    if (s.acc < 1) return;
    const fps = s.frames / s.acc;
    usePerf.setState({ fps: Math.round(fps), worst: Math.round(s.worst * 1000), calls: counts.current.calls, tris: counts.current.tris });
    s.frames = 0;
    s.acc = 0;
    s.worst = 0;
    if (s.warm < 4) return;

    s.slow = fps < FLOOR ? s.slow + 1 : 0;
    s.fast = fps > CEIL ? s.fast + 1 : 0;
    const since = s.clock - s.lastChange;
    if (s.slow >= 2 && since > 1.5) {
      s.slow = 0;
      s.lastChange = s.clock;
      if (s.dpr > profile.minDpr + 0.01) {
        // bigger steps when far below the floor
        s.dpr = Math.max(profile.minDpr, s.dpr * (fps < FLOOR * 0.7 ? 0.8 : 0.9));
        setDpr(s.dpr);
      } else if (s.degrade < 1) s.degrade++;
      usePerf.setState({ dpr: s.dpr, degrade: s.degrade });
    } else if (s.fast >= 5 && since > 4) {
      s.fast = 0;
      s.lastChange = s.clock;
      if (s.dpr < profile.dpr - 0.01) {
        s.dpr = Math.min(profile.dpr, s.dpr + 0.05);
        setDpr(s.dpr);
      }
      usePerf.setState({ dpr: s.dpr, degrade: s.degrade });
    }
  });
  return null;
}
