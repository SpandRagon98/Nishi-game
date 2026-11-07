import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { PLATFORM_ZERO, type LevelDef } from '@nishi/shared';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { lockPointer } from '../game/input';
import { fx } from '../game/fx';
import { runtime } from '../game/runtime';
import type { GameSession } from '../game/session';
import { graphicsProfile } from '../state/settings';
import { app, useApp } from '../state/store';
import { Apparitions, GhostActor, RemoteSurvivors } from './Characters';
import { Decor } from './Decor';
import { Effects } from './Effects';
import { GhostController } from './GhostController';
import { Interactables } from './Interactables';
import { LevelColliders, LevelMeshes, makeMaterials } from './Level';
import { LightRig } from './Lights';
import { SurvivorController } from './SurvivorController';
import { cachedTextures } from './textures';
import { GroundFog, Horizon, Rain } from './Weather';

function SceneSetup() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__three = { scene, gl, camera };
  }, [scene, gl, camera]);
  useEffect(() => {
    scene.background = new THREE.Color('#05070a');
    scene.fog = new THREE.FogExp2('#0a0d12', 0.034);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.09;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);
  useFrame(() => {
    const s = app().settings;
    gl.toneMappingExposure = 0.85 * s.brightness;
    if (camera.fov !== s.fov) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/** Everything visible about the station, shared by the menu backdrop and the game. */
function StationWorld({ level, withPhysics }: { level: LevelDef; withPhysics: boolean }) {
  const graphics = useApp((s) => s.settings.graphics);
  const gp = graphicsProfile(graphics);
  const lib = cachedTextures();
  const materials = useMemo(() => makeMaterials(lib ?? {}), [lib]);
  return (
    <>
      <SceneSetup />
      <LevelMeshes level={level} materials={materials} shadows={gp.shadows} />
      {withPhysics && <LevelColliders level={level} />}
      <Decor />
      <LightRig level={level} pool={gp.lightPool} />
      <Rain count={gp.rain} level={level} />
      <GroundFog />
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

export function GameCanvas({ session }: { session: GameSession }) {
  const graphics = useApp((s) => s.settings.graphics);
  const gp = graphicsProfile(graphics);
  const level = PLATFORM_ZERO;
  const ghost = session.role === 'ghost';

  useEffect(() => {
    const onLock = () => {
      fx.pointerLocked = !!document.pointerLockElement;
      const s = app();
      if (!document.pointerLockElement && s.screen === 'game' && !s.overlay) s.setOverlay('pause');
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  return (
    <Canvas
      className="game-canvas"
      dpr={gp.dpr}
      shadows={gp.shadows ? 'soft' : false}
      gl={{ antialias: !gp.post, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 72, near: 0.05, far: 260, position: [-21, 1.6, 4] }}
      onPointerDown={(e) => {
        if (!app().overlay && !document.pointerLockElement) lockPointer(e.target as HTMLCanvasElement);
      }}
    >
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]} timeStep="vary">
          <StationWorld level={level} withPhysics />
          {ghost ? <GhostController session={session} level={level} /> : <SurvivorController session={session} level={level} shadows={gp.shadows} />}
        </Physics>
        {!ghost && <GhostActor />}
        <Apparitions />
        <RemoteSurvivors localId={session.localId} ghostVision={ghost} />
        <GameLoop session={session} />
        {gp.post && <Effects ghostVision={ghost} />}
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
      dpr={Math.min(gp.dpr, 1.25)}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 55, near: 0.05, far: 260 }}
    >
      <Suspense fallback={null}>
        <StationWorld level={PLATFORM_ZERO} withPhysics={false} />
        <MenuCamera />
        {gp.post && <Effects ghostVision={false} />}
      </Suspense>
    </Canvas>
  );
}
