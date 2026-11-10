import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { PLATFORM_ZERO, type LevelDef } from '@nishi/shared';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { lockPointer } from '../game/input';
import { fx } from '../game/fx';
import { runtime } from '../game/runtime';
import type { GameSession } from '../game/session';
import { graphicsProfile, type GraphicsProfile } from '../state/settings';
import { audio } from '../audio/engine';
import { music } from '../audio/music';
import { usePerf } from '../perf/store';
import { PerfGovernor } from './PerfGovernor';
import { StaticBatch } from './StaticBatch';
import { app, useApp } from '../state/store';
import { Apparitions, GhostActor, RemoteSurvivors } from './Characters';
import { Decor } from './Decor';
import { Effects } from './Effects';
import { GhostController } from './GhostController';
import { Interactables } from './Interactables';
import { LevelColliders, LevelMeshes, makeMaterials } from './Level';
import { PassageDetail } from './Passage';
import { LightRig } from './Lights';
import { SurvivorController } from './SurvivorController';
import { inCutscene } from '../game/cutscene';
import { cachedTextures } from './textures';
import { Horizon } from './Weather';
import { DustMotes, MistBanks, Moon, useNightSky } from './Atmosphere';
import { StationArchitecture } from './Station';
import { Train } from './Train';
import { Props } from './Props';
import { Watchers } from './Watchers';

function SceneSetup() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__three = { scene, gl, camera };
  }, [scene, gl, camera]);
  useNightSky();
  useFrame(() => {
    const s = app().settings;
    gl.toneMappingExposure = 0.6 * s.brightness;
    // a running cutscene owns the lens
    if (camera.fov !== s.fov && !inCutscene()) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/** Everything visible about the station, shared by the menu backdrop and the game. */
function StationWorld({ level, withPhysics, gp }: { level: LevelDef; withPhysics: boolean; gp: GraphicsProfile }) {
  const lib = cachedTextures();
  const materials = useMemo(() => makeMaterials(lib ?? {}, gp.tier !== 'mobile'), [lib, gp.tier]);
  return (
    <>
      <SceneSetup />
      <LevelMeshes level={level} materials={materials} shadows={gp.shadows} />
      {withPhysics && <LevelColliders level={level} />}
      <StaticBatch>
        <Decor />
        <StationArchitecture shadows={gp.shadows} />
        <Train shadows={gp.shadows} />
        <Props lights={gp.propLights} />
        <PassageDetail />
      </StaticBatch>
      <LightRig level={level} pool={gp.lightPool} shafts={gp.shafts} />
      <MistBanks density={gp.mist} />
      {gp.dust > 0 && <DustMotes count={gp.dust} />}
      <Moon />
      <Horizon />
      {withPhysics && <Interactables level={level} materials={materials} />}
    </>
  );
}

function GameLoop({ session }: { session: GameSession }) {
  useEffect(() => {
    runtime.session = session;
    runtime.menu = false;
    return () => {
      runtime.session = null;
    };
  }, [session]);
  useFrame((_, dt) => {
    // pause the solo simulation while the pause menu or a document is open
    const ov = app().overlay;
    const paused = session.kind === 'solo' && (ov === 'pause' || ov === 'doc' || ov === 'end');
    if (!paused) session.update(Math.min(dt, 0.1));
    runtime.snap = session.snapshot();
  }, -1);
  return null;
}

/**
 * Draws everything once, off-screen, before play: including the ghost, apparitions and watchers that
 * start hidden (tagged `userData.warm`), with culling off so they draw wherever they stand. Otherwise
 * her first appearance freezes the frame for up to a second while her shaders compile (Direct3D
 * finishes compiling on the first real draw, so compiling alone is not enough). With post-processing
 * the scene renders into a buffer, which uses a different shader variant (no tone mapping), so warm
 * into a 1x1 target; without it, draw to a single scissored pixel of the screen.
 */
function Warmup({ post }: { post: boolean }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.warm && !o.visible) hidden.push(o);
    });
    const culled: THREE.Object3D[] = [];
    for (const h of hidden) {
      h.visible = true;
      h.traverse((o) => {
        if (o.frustumCulled) culled.push(o);
        o.frustumCulled = false;
      });
    }
    const target = post ? new THREE.WebGLRenderTarget(1, 1) : null;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    if (!target) {
      gl.setScissor(0, 0, 1, 1);
      gl.setScissorTest(true);
    }
    gl.render(scene, camera);
    gl.setScissorTest(false);
    gl.setRenderTarget(prev);
    target?.dispose();
    for (const o of culled) o.frustumCulled = true;
    for (const o of hidden) o.visible = false;
  }, [gl, scene, camera, post]);
  return null;
}

export function GameCanvas({ session }: { session: GameSession }) {
  const graphics = useApp((s) => s.settings.graphics);
  const gp = graphicsProfile(graphics);
  const level = PLATFORM_ZERO;
  const ghost = session.role === 'ghost';
  const degrade = usePerf((s) => s.degrade);

  // in play the score falls silent: footsteps, breathing and wind carry the fear
  useEffect(() => {
    audio.setQuiet(true);
    music.setMood('silent');
    return () => audio.setQuiet(false);
  }, []);

  useEffect(() => {
    const onLock = () => {
      fx.pointerLocked = !!document.pointerLockElement;
      const s = app();
      // (the testing Studio frees the mouse on purpose: no pause menu then)
      if (!document.pointerLockElement && s.screen === 'game' && !s.overlay && !runtime.studio.open) s.setOverlay('pause');
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  return (
    <Canvas
      className="game-canvas"
      dpr={gp.dpr}
      shadows={gp.shadows ? 'percentage' : false}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, stencil: false }}
      camera={{ fov: 72, near: 0.05, far: 420, position: [-21, 1.6, 4] }}
      onPointerDown={(e) => {
        if (!app().overlay && !document.pointerLockElement) lockPointer(e.target as HTMLCanvasElement);
      }}
    >
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <StationWorld level={level} withPhysics gp={gp} />
          {ghost ? <GhostController session={session} level={level} /> : <SurvivorController session={session} level={level} shadows={gp.shadows} />}
        </Physics>
        {!ghost && <GhostActor />}
        {!ghost && <Watchers />}
        <Apparitions />
        <RemoteSurvivors localId={session.localId} ghostVision={ghost} />
        <GameLoop session={session} />
        {gp.post && <Effects ghostVision={ghost} ao={gp.ao && degrade < 1} />}
        <Warmup post={gp.post} />
        <PerfGovernor profile={gp} />
      </Suspense>
    </Canvas>
  );
}

// ───────────────────────────── menu backdrop ─────────────────────────────

function MenuCamera() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    runtime.menu = true;
    runtime.snap = null;
    return () => {
      runtime.menu = false;
    };
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const x = -26 + ((t * 0.55) % 50);
    camera.position.set(x, 1.55 + Math.sin(t * 0.3) * 0.05, 5.6);
    camera.lookAt(x + 9, 1.25, 3.2 + Math.sin(t * 0.1) * 1.5);
    runtime.eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  });
  return null;
}

export function MenuCanvas() {
  const graphics = useApp((s) => s.settings.graphics);
  const gp = graphicsProfile(graphics);
  return (
    <Canvas
      className="menu-canvas"
      dpr={Math.min(gp.dpr, 1)}
      gl={{ antialias: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, stencil: false }}
      camera={{ fov: 55, near: 0.05, far: 420 }}
    >
      <Suspense fallback={null}>
        <StationWorld level={PLATFORM_ZERO} withPhysics={false} gp={gp} />
        <MenuCamera />
        {gp.post && <Effects ghostVision={false} />}
        <PerfGovernor profile={gp} />
      </Suspense>
    </Canvas>
  );
}
