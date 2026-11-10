import { Bloom, EffectComposer, Noise, SMAA, SSAO, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect } from 'postprocessing';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * The film grade, in the same merged pass as the rest: desaturate, then split-tone (cold green-teal
 * shadows, warm sodium-fluorescent highlights, a faint green cast in the mids like old tubes on tile),
 * and a filmic contrast curve that keeps the mids readable while the blacks go deep.
 */
class GradeEffect extends Effect {
  constructor() {
    super(
      'Grade',
      /* glsl */ `
      uniform float uSat;
      uniform float uHue;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb, vec3(0.0));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        float hi = smoothstep(0.04, 0.55, l);
        float mid = hi * (1.0 - smoothstep(0.35, 0.9, l));
        c *= mix(vec3(0.84, 0.98, 1.0), vec3(1.07, 1.0, 0.86), hi);
        c *= mix(vec3(1.0), vec3(0.97, 1.03, 0.95), mid);
        c = mix(c, c.gbr, uHue);
        // filmic S: shadows down, highlights up, around a mid grey of 0.18
        vec3 k = pow(max(c / 0.18, vec3(1e-4)), vec3(1.12)) * 0.18;
        c = k / (1.0 + k * 0.12) * 1.1;
        outputColor = vec4(c, inputColor.a);
      }`,
      { uniforms: new Map([['uSat', new THREE.Uniform(0.78)], ['uHue', new THREE.Uniform(0)]]) },
    );
  }
}

function Grade({ ghostVision }: { ghostVision: boolean }) {
  const effect = useMemo(() => new GradeEffect(), []);
  useEffect(() => {
    effect.uniforms.get('uSat')!.value = ghostVision ? 0.45 : 0.78;
    effect.uniforms.get('uHue')!.value = ghostVision ? 0.06 : 0;
  }, [effect, ghostVision]);
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive object={effect} dispose={null} />;
}

/**
 * Cinematic grade in a single merged pass: soft bloom only on genuinely bright practicals (never on
 * a torch-lit wall), a split-toned filmic grade, fine grain that darkens rather than lifts the blacks,
 * and a heavy vignette. AO is a separate pass and only runs on the High profile.
 */
export function Effects({ ghostVision, ao = false }: { ghostVision: boolean; ao?: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={ao}>
      {ao ? (
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={12}
          rings={4}
          radius={0.12}
          intensity={14}
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
      <Bloom intensity={0.55} luminanceThreshold={0.76} luminanceSmoothing={0.18} mipmapBlur levels={5} />
      <Grade ghostVision={ghostVision} />
      <Noise blendFunction={BlendFunction.MULTIPLY} opacity={0.16} />
      <Vignette offset={0.18} darkness={ghostVision ? 0.92 : 0.86} eskil={false} />
      {/* the canvas runs without MSAA; SMAA cleans up the stair-stepping on rails, tiles and cables */}
      <SMAA />
    </EffectComposer>
  );
}
