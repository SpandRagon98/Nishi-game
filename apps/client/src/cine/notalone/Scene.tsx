import { useFrame, useThree } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from '@react-three/postprocessing';
import { BlendFunction, DepthOfFieldEffect } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import '../../three/Atmosphere'; // installs the game's height fog before any shader compiles
import { GradeEffect } from '../../three/Effects';
import type { Timeline } from '../timeline';
import { CineAditi, makeDrive } from './aditi';
import { breathPlan, direct, lensAt, makeAnchors, makeLens, type Lens, type Overlay } from './script';
import { GroundMist, LightShafts, NightLight, StationSet, makeSetDrive } from './set';
import { MotionBlurEffect } from './motionblur';
import { sound } from './sound';

const MIST = '#1b272c';
const WARM = [5, 20, 31, 46, 56, 66, 76, 88, 96, 118, 127, 129, 0];
const tmpV = new THREE.Vector3();

/** runs the clock and poses everything, before anything else this frame */
function Director({ tl, overlay, lens }: { tl: Timeline; overlay: Overlay; lens: Lens }) {
  const aditi = useRef(makeDrive());
  const set = useRef(makeSetDrive());
  const anchors = useRef(makeAnchors());
  const around = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.FogExp2(MIST, 0.06), []);
  const cam = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, fp: true });

  useEffect(() => {
    scene.fog = fog;
    return () => void (scene.fog = null);
  }, [scene, fog]);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__cine = { tl, aditi, set, anchors, lens, overlay, camera, scene };
  }, [tl, lens, overlay, camera, scene]);

  const warm = useRef(0);
  useFrame((_, dt) => {
    tl.update(Math.min(dt, 0.1));
    // before the first play, pose one frame of each act behind black, so every shader and canvas
    // texture is compiled and uploaded up front instead of hitching mid-scene
    const warming = !tl.playing && tl.time === 0 && warm.current < WARM.length;
    const t = warming ? WARM[warm.current++] : tl.time;
    const a = aditi.current;
    direct(t, a, set.current, overlay, anchors.current);
    if (warming) overlay.black = 1;
    a.time = t;
    around.current.copy(a.pos);
    fog.density = set.current.fog;
    sound.update(tl.time, tl.playing, { breath: breathPlan });
  }, -2);

  // the lens, once her body is posed this frame (in first person it sits at her eyes, so it must not lag them)
  const dir = useRef(new THREE.Vector3(0, 0, 1));
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const a = aditi.current;
    lensAt(a.time, a, anchors.current, lens);
    const c = cam.current;
    const want = tmpV.subVectors(lens.look, lens.pos).normalize();
    const cut = !c.init || c.fp !== lens.fp || (!lens.fp && (c.pos.distanceTo(lens.pos) > 0.45 || c.look.distanceTo(lens.look) > 1.2));
    if (cut) {
      c.pos.copy(lens.pos);
      c.look.copy(lens.look);
      dir.current.copy(want);
      c.init = true;
      c.fp = lens.fp;
    } else if (lens.fp) {
      // her eyes: exactly where her head is; the gaze turns like a head (quick, not instant)
      c.pos.copy(lens.pos);
      dir.current.lerp(want, 1 - Math.exp(-7 * dt)).normalize();
    } else {
      // within a shot the lens glides
      const k = 1 - Math.exp(-14 * dt);
      c.pos.lerp(lens.pos, k);
      c.look.lerp(lens.look, k);
    }
    camera.position.copy(c.pos);
    if (lens.fp) camera.lookAt(tmpV.copy(c.pos).add(dir.current));
    else camera.lookAt(c.look);
    // dev QA: window.__cineCam = { pos: [x, y, z], look: [x, y, z] } views the set from anywhere
    const fc = import.meta.env.DEV ? (window as unknown as { __cineCam?: { pos: number[]; look: number[] } }).__cineCam : undefined;
    if (fc) {
      camera.position.fromArray(fc.pos);
      camera.lookAt(tmpV.fromArray(fc.look));
    }
    if (Math.abs(camera.fov - lens.fov) > 1e-3) {
      camera.fov = lens.fov;
      camera.updateProjectionMatrix();
    }
  }, 0.5);

  return (
    <>
      <NightLight />
      <StationSet drive={set} />
      <CineAditi drive={aditi} anchors={anchors} />
      <GroundMist drive={set} around={around} />
      <LightShafts drive={set} />
    </>
  );
}

/** the game's grade, with a depth of field that follows what the shot is about */
function CineEffects({ lens, dof: withDof }: { lens: Lens; dof: boolean }) {
  const camera = useThree((s) => s.camera);
  const dof = useMemo(() => new DepthOfFieldEffect(camera, { focusDistance: 3, focusRange: 1.5, bokehScale: 1, resolutionScale: 0.5 }), [camera]);
  const grade = useMemo(() => {
    const g = new GradeEffect();
    g.uniforms.get('uSat')!.value = 0.62; // colder and greyer than the station's interior
    return g;
  }, []);
  const blur = useMemo(() => new MotionBlurEffect(camera), [camera]);
  useEffect(() => () => (dof.dispose(), grade.dispose(), blur.dispose()), [dof, grade, blur]);
  useFrame(() => {
    dof.target = lens.focus;
    const dist = camera.position.distanceTo(lens.focus);
    dof.cocMaterial.focusRange = Math.max(0.06, dist * 0.3);
    dof.bokehScale = lens.bokeh * 2.4;
  }, 0.6);
  return (
    <EffectComposer multisampling={0}>
      {withDof ? <primitive object={dof} dispose={null} /> : <></>}
      {/* heavy motion blur on every camera move (her head whipping round, the run in, the zoom) */}
      <primitive object={blur} dispose={null} />
      <Bloom intensity={0.6} luminanceThreshold={0.72} luminanceSmoothing={0.2} mipmapBlur levels={5} />
      <primitive object={grade} dispose={null} />
      <Noise blendFunction={BlendFunction.MULTIPLY} opacity={0.2} />
      <Vignette offset={0.2} darkness={0.82} eskil={false} />
      <SMAA />
    </EffectComposer>
  );
}

export function CineScene({ tl, overlay, lite }: { tl: Timeline; overlay: Overlay; lite: boolean }) {
  const lens = useMemo(makeLens, []);
  return (
    <>
      {/* percentage-closer soft shadows: each pixel ray-marches the lamp's shadow map for the blocker's distance,
          so a shadow is sharp where things touch (her feet, the bag on her hip) and spreads as it falls away */}
      {lite ? <></> : <SoftShadows size={18} samples={12} focus={0.6} />}
      <Director tl={tl} overlay={overlay} lens={lens} />
      <CineEffects lens={lens} dof={!lite} />
    </>
  );
}
