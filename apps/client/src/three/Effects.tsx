import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, Noise, SMAA, SSAO, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

/**
 * Cinematic grade in a single merged pass: soft bloom only on genuinely bright practicals (never on
 * a torch-lit wall), a cold desaturated grade, fine grain that darkens rather than lifts the blacks,
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
      <Bloom intensity={0.45} luminanceThreshold={0.82} luminanceSmoothing={0.15} mipmapBlur levels={5} />
      <HueSaturation saturation={ghostVision ? -0.55 : -0.22} hue={ghostVision ? 0.08 : 0} />
      <BrightnessContrast brightness={-0.04} contrast={0.14} />
      <Noise blendFunction={BlendFunction.MULTIPLY} opacity={0.16} />
      <Vignette offset={0.18} darkness={ghostVision ? 0.92 : 0.86} eskil={false} />
      {/* the canvas runs without MSAA; SMAA cleans up the stair-stepping on rails, tiles and cables */}
      <SMAA />
    </EffectComposer>
  );
}
