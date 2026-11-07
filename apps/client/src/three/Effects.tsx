import { useFrame } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, HueSaturation, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction, type ChromaticAberrationEffect } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime } from '../game/runtime';
import { app } from '../state/store';

/** Cinematic grade: bloom on practical lights, film grain, vignette; chromatic smear near the Caller. */
export function Effects({ ghostVision }: { ghostVision: boolean }) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const offset = useMemo(() => new THREE.Vector2(0.0006, 0.0004), []);
  useFrame(() => {
    if (!ca.current) return;
    const snap = runtime.snap;
    let k = 0;
    if (snap && !ghostVision) {
      const g = snap.ghost;
      const e = runtime.eye;
      const d = Math.hypot(g.pos.x - e.x, g.pos.y + 1.5 - e.y, g.pos.z - e.z);
      k = Math.max(0, 1 - d / 14) * (g.visible ? 1 : 0.35);
    }
    const reduced = app().settings.reducedFlashing;
    const amt = 0.0006 + k * (reduced ? 0.002 : 0.006) + (ghostVision ? 0.0015 : 0);
    offset.set(amt, amt * 0.6);
    ca.current.offset = offset;
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.75} luminanceThreshold={0.62} luminanceSmoothing={0.2} mipmapBlur />
      <ChromaticAberration ref={ca} offset={offset} radialModulation={false} modulationOffset={0} />
      <HueSaturation saturation={ghostVision ? -0.55 : -0.12} hue={ghostVision ? 0.08 : 0} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.22} />
      <Vignette offset={0.22} darkness={ghostVision ? 0.9 : 0.72} eskil={false} />
    </EffectComposer>
  );
}
