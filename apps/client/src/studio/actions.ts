import {
  navGraph, nearestNode, OBJECTIVES, PLATFORM_ZERO, STORY_BEATS, type ObjectiveId, type StoryBeatId, type Vec3,
} from '@nishi/shared';
import { playCutscene } from '../game/cutscene';
import { addApparition, fx } from '../game/fx';
import { objectiveStep } from '../game/guidance';
import { runtime } from '../game/runtime';
import { LocalSession } from '../game/session';
import { app } from '../state/store';

/**
 * Testing Studio actions: everything the panel can do to the running solo game. Dev builds only:
 * the panel that calls these is never part of a production build.
 */
const level = PLATFORM_ZERO;

export const local = () => (runtime.session instanceof LocalSession ? runtime.session : null);
const me = () => runtime.snap?.survivors.find((s) => s.id === runtime.session?.localId) ?? null;

/** a walkable spot near `p`: the closest navigation waypoint */
function floorNear(p: Vec3): Vec3 {
  const g = navGraph(level);
  return g.pos.get(nearestNode(g, p))!;
}

/** put the player at `p`, facing `look` */
export function teleport(p: Vec3, look?: Vec3) {
  const s = local();
  if (!s) return;
  s.sim.debugPlace(s.localId, p, true);
  if (look) runtime.debugLook = { yaw: Math.atan2(-(look.x - p.x), -(look.z - p.z)), pitch: -0.05 };
}

export const STEPS = OBJECTIVES.map((o) => ({ id: o.id, title: o.title }));

/** the world as it is at the start of `id`, with the player standing near where that step happens */
export function jumpTo(id: ObjectiveId) {
  const s = local();
  if (!s) return;
  s.sim.debugSkipTo(id);
  const snap = s.sim.snapshot();
  const m = snap.survivors.find((x) => x.id === s.localId)!;
  const step = objectiveStep(level, snap, m);
  if (step) teleport(floorNear(step.target), step.target);
  app().resetGameUi();
  app().toast({ title: `Jumped to: ${OBJECTIVES.find((o) => o.id === id)!.title}`, tone: 'info' }, 2500);
}

export const CUTSCENES = OBJECTIVES.filter((o) => o.id !== 'escape').map((o) => ({ id: o.id, title: STORY_BEATS[o.id].title }));

export function cutscene(id: ObjectiveId) {
  const m = me();
  if (m && runtime.snap) playCutscene(id, m, level, runtime.snap);
}

export const BEATS = (Object.keys(STORY_BEATS) as StoryBeatId[]).map((id) => ({ id, title: STORY_BEATS[id].title }));
export const beat = (id: StoryBeatId) => app().beat(id);

type Three = { gl: import('three').WebGLRenderer; scene: import('three').Scene; camera: import('three').PerspectiveCamera };
const three = () => (window as unknown as { __three?: Three }).__three;

/** a point `d` metres ahead of the camera, on the floor */
function ahead(d: number): Vec3 {
  const e = runtime.eye;
  const m = three()?.camera.matrixWorld.elements;
  // camera forward is -Z of its world matrix
  const fx = m ? -m[8] : 0;
  const fz = m ? -m[10] : -1;
  const n = Math.hypot(fx, fz) || 1;
  return { x: e.x + (fx / n) * d, y: Math.max(0, e.y - 1.6), z: e.z + (fz / n) * d };
}

/** pin the Caller in front of you, posed by the panel's sliders */
export function showGhost(on: boolean) {
  const snap = runtime.snap;
  if (!on || !snap) {
    runtime.debugCaller = null;
    runtime.studio.ghost = null;
    return;
  }
  const p = ahead(2.6);
  const e = runtime.eye;
  runtime.debugCaller = { ...snap.ghost, pos: p, yaw: Math.atan2(-(e.x - p.x), -(e.z - p.z)), mode: 'hunt', visible: true };
  runtime.studio.ghost ??= { scare: 0, speed: 0, stunned: false, spin: 0 };
}

export function jumpScare() {
  const p = ahead(1.9);
  const e = runtime.eye;
  addApparition(p, Math.atan2(-(e.x - p.x), -(e.z - p.z)), 1.4, 'apparition', true);
  fx.shake = Math.max(fx.shake, 0.5);
}

export function ghost(action: 'hunt' | 'calm') {
  local()?.sim.debugGhost(action);
}

export function setDebug(k: 'god' | 'calm', v: boolean) {
  const s = local();
  if (s) s.sim.debug[k] = v;
}

export const PLACES: { label: string; at: Vec3; look?: Vec3 }[] = [
  ...level.zones.map((z) => {
    const c = { x: (z.rect.minX + z.rect.maxX) / 2, y: Math.max(0, z.minY + 0.5), z: (z.rect.minZ + z.rect.maxZ) / 2 };
    return { label: z.name, at: floorNear(c) };
  }),
  ...level.interactables.filter((i) => i.pos && i.kind !== 'note').map((i) => ({ label: i.label, at: floorNear(i.pos!), look: i.pos! })),
];

/** what the tester is looking at, for notes */
export function context() {
  const snap = runtime.snap;
  const m = me();
  const step = snap ? OBJECTIVES.find((o) => !snap.world.objectives[o.id])?.title ?? 'done' : '-';
  const e = runtime.eye;
  return [
    `step: ${step}`,
    `zone: ${app().hud.zone || '-'}`,
    `eye: ${e.x.toFixed(1)}, ${e.y.toFixed(1)}, ${e.z.toFixed(1)}${m ? ` · yaw ${m.yaw.toFixed(2)}` : ''}${runtime.studio.fly ? ' (free camera)' : ''}`,
    `ghost: ${snap?.ghost.mode ?? '-'}${runtime.debugCaller ? ' (viewer pinned)' : ''}`,
    `graphics: ${app().settings.graphics} · ${innerWidth}x${innerHeight}`,
  ].join('\n');
}

/** the current view as a PNG data URL (rendered once more into a target; no post-processing) */
export async function screenshot(): Promise<string | null> {
  const t = three();
  if (!t) return null;
  const THREE = await import('three');
  const W = Math.min(1280, t.gl.domElement.width);
  const H = Math.round((W * t.gl.domElement.height) / t.gl.domElement.width);
  const rt = new THREE.WebGLRenderTarget(W, H);
  const prev = t.gl.getRenderTarget();
  t.gl.setRenderTarget(rt);
  t.gl.render(t.scene, t.camera);
  const px = new Uint8Array(W * H * 4);
  t.gl.readRenderTargetPixels(rt, 0, 0, W, H, px);
  t.gl.setRenderTarget(prev);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const img = c.getContext('2d')!.createImageData(W, H);
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** saves a note (and the screenshot) into studio-notes/ in the repo, through the dev server */
export async function saveNote(text: string, withShot: boolean) {
  const res = await fetch('/__studio/note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, context: context(), image: withShot ? await screenshot() : null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { file: string; count: number };
}
