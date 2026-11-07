import type { GhostAbilityId } from '../data/abilities';
import type { ObjectiveId } from '../data/story';
import type { Vec3 } from '../math';

export type Mode = 'solo' | 'coop' | 'versus';
export type SurvivorStatus = 'alive' | 'downed' | 'captured' | 'escaped';
export type GhostMode = 'roam' | 'warn' | 'hunt' | 'stunned';

export const FLAG_SPRINT = 1;
export const FLAG_CROUCH = 2;
export const FLAG_FLASHLIGHT = 4;
export const FLAG_MOVING = 8;

export interface MoveInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flags: number;
}

export interface SurvivorView {
  id: string;
  name: string;
  characterId: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  flags: number;
  stamina: number;
  exhausted: boolean;
  status: SurvivorStatus;
  hiding: string | null;
  bleedout: number;
  reviveProgress: number;
  hasFlashlight: boolean;
  abilityReadyAt: number;
  abilityActiveUntil: number;
  noise: number;
  connected: boolean;
}

export interface GhostView {
  controllerId: string | null;
  name: string;
  ghostId: string;
  pos: Vec3;
  yaw: number;
  mode: GhostMode;
  visible: boolean;
  energy: number;
  readyAt: Record<GhostAbilityId, number>;
  huntUntil: number;
  warnUntil: number;
  stunUntil: number;
  apparition: { pos: Vec3; yaw: number; until: number } | null;
}

export interface WorldView {
  doors: Record<string, { open: boolean; locked: boolean }>;
  lightsOff: Record<string, number>;
  power: boolean;
  inventory: string[];
  collected: string[];
  itemPos: Record<string, Vec3>;
  objectives: Record<ObjectiveId, boolean>;
  office: { logbook: boolean; drawer: boolean };
  fuse: { slots: number[]; solved: boolean; lockoutUntil: number; clue: number[] | null };
  reelDigits: Record<string, number>;
  decodeOrder: string[] | null;
  keypadLockoutUntil: number;
  decoded: boolean;
  /** time at which the gate finishes opening (0 = not started) */
  exitOpenAt: number;
  exitOpen: boolean;
  phoneRingingUntil: number;
  notes: string[];
  echoes: { pos: Vec3; until: number; sound: 'footsteps' | 'phone' }[];
}

export interface MatchPlayerSummary {
  id: string;
  name: string;
  role: 'survivor' | 'ghost';
  characterId: string;
  status: SurvivorStatus | 'ghost';
  stuns: number;
  revives: number;
  hiddenCloseCalls: number;
}

export interface MatchSummary {
  winner: 'survivors' | 'ghost';
  reason: string;
  duration: number;
  fragments: string[];
  checkpointsUsed: number;
  players: MatchPlayerSummary[];
}

export interface WorldSnapshot {
  time: number;
  threat: number;
  mode: Mode;
  ended: boolean;
  survivors: SurvivorView[];
  ghost: GhostView;
  world: WorldView;
  result: MatchSummary | null;
}

export type SfxId =
  | 'door_open' | 'door_close' | 'door_slam' | 'locked' | 'unlock' | 'spark' | 'power_up'
  | 'gate_motor' | 'phone_ring' | 'footsteps' | 'creak' | 'train_creak' | 'keypad_ok' | 'keypad_fail'
  | 'capture' | 'revive' | 'stun' | 'pickup' | 'tape' | 'hide' | 'unhide' | 'paper' | 'scream_distant' | 'train_horn';

type To = { to?: string[] };

export type SimEvent = To &
  (
    | { type: 'message'; text: string; tone?: 'info' | 'warn' | 'good' }
    | { type: 'radio'; speaker: string; text: string; fake?: boolean }
    | { type: 'announcement'; text: string; garbled?: boolean }
    | { type: 'whisper'; text: string; pos?: Vec3 }
    | { type: 'phone'; text: string }
    | { type: 'pickup'; item: string; label: string; detail?: string }
    | { type: 'doc'; docId: string; title: string; body: string }
    | { type: 'puzzle'; puzzle: 'fuse' | 'keypad' }
    | { type: 'sfx'; sound: SfxId; pos?: Vec3 }
    | { type: 'flicker'; lights: string[]; duration: number }
    | { type: 'power_on' }
    | { type: 'apparition'; pos: Vec3; yaw: number; duration: number }
    | { type: 'shadow'; pos: Vec3; yaw: number; duration: number }
    | { type: 'hunt'; phase: 'warning' | 'start' | 'end' }
    | { type: 'echo_sense'; points: { pos: Vec3; kind: 'ghost' | 'echo' | 'apparition' }[]; duration: number }
    | { type: 'player'; what: 'downed' | 'captured' | 'revived' | 'escaped' | 'stunned_ghost'; playerId: string; name: string }
    | { type: 'objective'; id: ObjectiveId }
    | { type: 'checkpoint'; key: string }
    | { type: 'chat'; from: string; fromId: string; text: string; fake?: boolean }
    | { type: 'ability'; ability: string; ok: boolean; reason?: string }
    | { type: 'match_end'; result: MatchSummary }
  );

export type SimEventType = SimEvent['type'];
