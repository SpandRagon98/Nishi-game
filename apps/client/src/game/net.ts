import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, isRoomCode } from '@nishi/shared';

/** Server endpoint comes from the build environment, never hard-coded secrets. */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;

const RECONNECT_KEY = 'nishi.reconnect';

let client: Client | null = null;
const getClient = () => (client ??= new Client(SERVER_URL));

function remember(room: Room) {
  try {
    sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
  } catch {
    /* ignore */
  }
}

export function forgetReconnect() {
  try {
    sessionStorage.removeItem(RECONNECT_KEY);
  } catch {
    /* ignore */
  }
}

export function hasReconnectToken() {
  try {
    return !!sessionStorage.getItem(RECONNECT_KEY);
  } catch {
    return false;
  }
}

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/fetch|ECONNREFUSED|Failed|NetworkError|websocket/i.test(msg)) {
    return new Error(`Cannot reach the multiplayer server at ${SERVER_URL}. Is it running? (npm run dev:server)`);
  }
  if (/not found|invalid|locked|progress/i.test(msg)) return new Error('That room does not exist, is full, or its match has already started.');
  return new Error(msg);
}

export async function createRoom(name: string, isPrivate: boolean, intensity: number) {
  try {
    const room = await getClient().create(ROOM_NAME, { name, private: isPrivate, intensity });
    remember(room);
    return room;
  } catch (e) {
    throw friendly(e);
  }
}

export async function quickJoin(name: string, intensity: number) {
  try {
    const room = await getClient().joinOrCreate(ROOM_NAME, { name, intensity });
    remember(room);
    return room;
  } catch (e) {
    throw friendly(e);
  }
}

export async function joinByCode(code: string, name: string) {
  const c = code.trim().toUpperCase();
  if (!isRoomCode(c)) throw new Error('Room codes are 5 characters, e.g. K7Q2M.');
  try {
    const room = await getClient().joinById(c, { name });
    remember(room);
    return room;
  } catch (e) {
    throw friendly(e);
  }
}

export async function reconnect(): Promise<Room | null> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(RECONNECT_KEY);
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const room = await getClient().reconnect(token);
    remember(room);
    return room;
  } catch {
    forgetReconnect();
    return null;
  }
}
