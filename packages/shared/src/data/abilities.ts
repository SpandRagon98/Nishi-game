export type GhostAbilityId = 'voice' | 'apparition' | 'blackout' | 'echo' | 'hunt';

export interface GhostAbilityDef {
  id: GhostAbilityId;
  name: string;
  key: string;
  cost: number;
  cooldown: number;
  duration: number;
  range: number;
  description: string;
}

export const GHOST_ENERGY_MAX = 100;
export const GHOST_ENERGY_START = 40;
export const GHOST_ENERGY_REGEN = 3.5; // per second, outside hunts
export const GHOST_HUNT_GRACE = 60; // seconds into a match before the first hunt is allowed
export const GHOST_HUNT_WARNING = 2.5;
export const GHOST_CAPTURE_RANGE = 1.7;
export const GHOST_SPEED = { roam: 3.3, hunt: 4.5 } as const;

export const GHOST_ABILITIES: Record<GhostAbilityId, GhostAbilityDef> = {
  voice: { id: 'voice', name: 'Voice Deception', key: '1', cost: 20, cooldown: 18, duration: 0, range: 25, description: "Send a forged radio message, in a teammate's voice, to the survivor nearest your sights." },
  apparition: { id: 'apparition', name: 'Apparition', key: '2', cost: 25, cooldown: 22, duration: 3, range: 16, description: 'Manifest at the point you are looking at. Survivors who see it lose stamina.' },
  blackout: { id: 'blackout', name: 'Blackout', key: '3', cost: 30, cooldown: 35, duration: 12, range: 12, description: 'Kill every light within 12 m for 12 seconds.' },
  echo: { id: 'echo', name: 'Echo Trap', key: '4', cost: 15, cooldown: 12, duration: 6, range: 22, description: 'Plant a false sound (footsteps, a ringing phone) at the point you are looking at.' },
  hunt: { id: 'hunt', name: 'Hunt', key: 'R', cost: 50, cooldown: 60, duration: 16, range: 0, description: 'After a short warning, manifest for 16 s. You move faster and can capture survivors (left click). Flashlights can stun you.' },
};

export interface GhostAbilityState {
  energy: number;
  readyAt: Record<GhostAbilityId, number>;
  stunUntil: number;
  huntUntil: number;
  warnUntil: number;
}

export type AbilityCheck = { ok: true } | { ok: false; reason: string };

export function canUseGhostAbility(g: GhostAbilityState, id: GhostAbilityId, now: number): AbilityCheck {
  const def = GHOST_ABILITIES[id];
  if (!def) return { ok: false, reason: 'Unknown ability' };
  if (g.stunUntil > now) return { ok: false, reason: 'Stunned' };
  if (g.readyAt[id] > now) return { ok: false, reason: 'Cooling down' };
  if (g.energy < def.cost) return { ok: false, reason: 'Not enough energy' };
  if (id === 'hunt') {
    if (g.huntUntil > now || g.warnUntil > now) return { ok: false, reason: 'Already hunting' };
    if (now < GHOST_HUNT_GRACE) return { ok: false, reason: `Hunt unlocks after ${GHOST_HUNT_GRACE}s` };
  }
  return { ok: true };
}

export function spendGhostAbility(g: GhostAbilityState, id: GhostAbilityId, now: number) {
  const def = GHOST_ABILITIES[id];
  g.energy -= def.cost;
  g.readyAt[id] = now + def.cooldown;
}

export const freshReadyAt = (): Record<GhostAbilityId, number> => ({ voice: 0, apparition: 0, blackout: 0, echo: 0, hunt: 0 });
