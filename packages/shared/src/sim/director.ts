import { clamp, type Vec3 } from '../math';
import type { Rng } from '../rng';

/**
 * Adaptive horror director. Pure selection logic: given the situation, choose at most one
 * handcrafted event, respecting a global pacing gap, per-event cooldowns and priorities.
 * It only uses in-game state (positions, progress, threat) — never anything about the real player.
 */

export type HorrorEventId =
  | 'lights_flicker'
  | 'footsteps'
  | 'door_slam'
  | 'phone_ring'
  | 'shadow'
  | 'announcement_change'
  | 'radio_whisper'
  | 'private_apparition'
  | 'train_creak';

export interface DirectorSurvivor {
  id: string;
  pos: Vec3;
  zone: string;
  distToGhost: number;
  hiding: boolean;
  /** distance to the nearest other survivor (Infinity when alone) */
  isolation: number;
}

export interface DirectorContext {
  time: number;
  threat: number; // 0..100
  intensity: number; // 0.5 (low) .. 1.5 (high)
  progress: number; // objectives completed 0..7
  power: boolean;
  ghostHunting: boolean;
  survivors: DirectorSurvivor[];
  /** largest distance between any two survivors */
  separation: number;
  openDoorNearby: (pos: Vec3) => boolean;
}

export interface DirectorState {
  lastEventAt: number;
  cooldownUntil: Partial<Record<HorrorEventId, number>>;
  history: HorrorEventId[];
}

export interface HorrorEventDef {
  id: HorrorEventId;
  priority: number;
  weight: number;
  cooldown: number;
  minThreat: number;
  minProgress: number;
  eligible?: (ctx: DirectorContext, target: DirectorSurvivor) => boolean;
  /** situational multiplier */
  bias?: (ctx: DirectorContext, target: DirectorSurvivor) => number;
}

export const HORROR_EVENTS: HorrorEventDef[] = [
  { id: 'train_creak', priority: 1, weight: 1, cooldown: 40, minThreat: 0, minProgress: 0 },
  { id: 'lights_flicker', priority: 2, weight: 1.2, cooldown: 30, minThreat: 0, minProgress: 0, bias: (c) => (c.power ? 1.3 : 1) },
  {
    id: 'footsteps', priority: 2, weight: 1, cooldown: 45, minThreat: 8, minProgress: 0,
    bias: (_c, t) => (t.distToGhost < 25 ? 1.6 : 0.8),
  },
  {
    id: 'door_slam', priority: 3, weight: 0.9, cooldown: 70, minThreat: 12, minProgress: 1,
    eligible: (c, t) => c.openDoorNearby(t.pos),
  },
  { id: 'phone_ring', priority: 3, weight: 0.8, cooldown: 120, minThreat: 10, minProgress: 1 },
  {
    id: 'shadow', priority: 3, weight: 0.8, cooldown: 90, minThreat: 20, minProgress: 1,
    eligible: (_c, t) => !t.hiding,
  },
  { id: 'announcement_change', priority: 2, weight: 0.7, cooldown: 100, minThreat: 5, minProgress: 0 },
  { id: 'radio_whisper', priority: 2, weight: 0.9, cooldown: 75, minThreat: 15, minProgress: 1 },
  {
    id: 'private_apparition', priority: 4, weight: 0.6, cooldown: 110, minThreat: 30, minProgress: 2,
    eligible: (_c, t) => !t.hiding && t.distToGhost > 8,
    // most effective on a survivor who has wandered off alone
    bias: (_c, t) => (t.isolation > 12 ? 1.8 : 0.7),
  },
];

export const createDirectorState = (): DirectorState => ({ lastEventAt: 0, cooldownUntil: {}, history: [] });

/** Seconds that must pass between any two events. Shrinks as threat rises; scaled by horror intensity. */
export function directorGap(ctx: Pick<DirectorContext, 'threat' | 'intensity'>): number {
  const t = clamp(ctx.threat, 0, 100) / 100;
  const base = 34 - 18 * t; // 34s calm → 16s at max threat
  return base / clamp(ctx.intensity, 0.4, 2);
}

export interface DirectorPick {
  event: HorrorEventDef;
  target: DirectorSurvivor;
}

export function selectHorrorEvent(
  ctx: DirectorContext,
  state: DirectorState,
  rng: Rng,
  defs: HorrorEventDef[] = HORROR_EVENTS,
): DirectorPick | null {
  if (ctx.ghostHunting) return null; // never stack scares on top of a hunt
  if (ctx.time - state.lastEventAt < directorGap(ctx)) return null;
  const candidates = ctx.survivors.filter((s) => s.distToGhost > 3);
  if (!candidates.length) return null;

  // Prefer the most isolated survivor, with some randomness.
  const target = rng.weighted(candidates, (s) => 1 + Math.min(s.isolation, 40) / 10)!;

  const last = state.history[state.history.length - 1];
  const options = defs.filter(
    (d) =>
      (state.cooldownUntil[d.id] ?? 0) <= ctx.time &&
      ctx.threat >= d.minThreat &&
      ctx.progress >= d.minProgress &&
      (!d.eligible || d.eligible(ctx, target)),
  );
  const pick = rng.weighted(options, (d) => d.priority * d.weight * (d.bias ? d.bias(ctx, target) : 1) * (d.id === last ? 0.15 : 1));
  if (!pick) return null;

  state.lastEventAt = ctx.time;
  state.cooldownUntil[pick.id] = ctx.time + pick.cooldown / clamp(ctx.intensity, 0.4, 2);
  state.history.push(pick.id);
  if (state.history.length > 12) state.history.shift();
  return { event: pick, target };
}
