/** Wire protocol shared by the Colyseus room and the browser client. */
export const ROOM_NAME = 'nishi';
export const MAX_PLAYERS = 5;
export const MAX_SURVIVORS = 4;
export const TICK_RATE = 20;

export type LobbyRole = 'survivor' | 'ghost';
export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface JoinOptions {
  name: string;
  private?: boolean;
  intensity?: number;
}

/** client → server message payloads */
export interface ClientMessages {
  lobby_role: { role: LobbyRole };
  lobby_character: { characterId: string };
  lobby_ready: { ready: boolean };
  lobby_start: Record<string, never>;
  move: { x: number; y: number; z: number; yaw: number; pitch: number; flags: number };
  interact: { target: string };
  fuse_set: { slot: number; value: number };
  fuse_submit: Record<string, never>;
  keypad: { code: string };
  ability: Record<string, never>;
  ghost_ability: { ability: string; target?: { x: number; y: number; z: number }; targetPlayer?: string };
  ghost_capture: Record<string, never>;
  revive: { target: string | null };
  chat: { text: string };
  return_lobby: Record<string, never>;
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomCode(rand: () => number = Math.random, len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  return s;
}
export const isRoomCode = (s: string) => new RegExp(`^[${ROOM_CODE_ALPHABET}]{5}$`).test(s);
