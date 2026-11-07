import { useFrame } from '@react-three/fiber';
import { Bloom, BrightnessContrast, ChromaticAberration, EffectComposer, HueSaturation, Noise, SSAO, Vignette } from '@react-three/postprocessing';
import { BlendFunction, type ChromaticAberrationEffect } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { runtime } from '../game/runtime';
import { app } from '../state/store';

/** Cinematic grade: bloom on practical lights, film grain, vignette; chromatic smear near the Caller. */
export function Effects({ ghostVision, ao = false }: { ghostVision: boolean; ao?: boolean }) {
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
    <EffectComposer multisampling={0} enableNormalPass={ao}>
      {ao ? (
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={21}
          rings={5}
          radius={0.12}
          intensity={16}
          luminanceInfluence={0.9}
          worldDistanceThreshold={20}
          worldDistanceFalloff={5}
          worldProximityThreshold={0.6}
          worldProximityFalloff={0.3}
          resolutionScale={0.5}
          depthAwareUpsampling
          color="#000000"
        />
      ) : (
        <></>
      )}
      <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
      <ChromaticAberration ref={ca} offset={offset} radialModulation={false} modulationOffset={0} />
      <HueSaturation saturation={ghostVision ? -0.55 : -0.22} hue={ghostVision ? 0.08 : 0} />
      <BrightnessContrast brightness={-0.03} contrast={0.16} />
      <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.3} />
      <Vignette offset={0.18} darkness={ghostVision ? 0.92 : 0.86} eskil={false} />
    </EffectComposer>
  );
}
