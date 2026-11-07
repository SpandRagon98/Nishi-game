import { schema, t, type SchemaType } from '@colyseus/schema';

/** One connected player: lobby info + (while playing) the authoritative survivor state. */
export const PlayerState = schema(
  {
    id: t.string().default(''),
    name: t.string().default('Guest'),
    role: t.string().default('survivor'),
    characterId: t.string().default('aditi'),
    ready: t.boolean().default(false),
    connected: t.boolean().default(true),
    isHost: t.boolean().default(false),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.float32().default(0),
    pitch: t.float32().default(0),
    flags: t.uint8().default(0),
    stamina: t.float32().default(1),
    exhausted: t.boolean().default(false),
    status: t.string().default('alive'),
    hiding: t.string().default(''),
    bleedout: t.float32().default(0),
    reviveProgress: t.float32().default(0),
    hasFlashlight: t.boolean().default(false),
    abilityReadyAt: t.float32().default(0),
    abilityActiveUntil: t.float32().default(0),
    noise: t.float32().default(0),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GhostState = schema(
  {
    controllerId: t.string().default(''),
    name: t.string().default('The Caller'),
    ghostId: t.string().default('caller'),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.float32().default(0),
    mode: t.string().default('roam'),
    visible: t.boolean().default(false),
    energy: t.float32().default(0),
    huntUntil: t.float32().default(0),
    warnUntil: t.float32().default(0),
    stunUntil: t.float32().default(0),
    /** small, rarely-changing structures travel as JSON strings (only re-sent when they change) */
    readyAtJson: t.string().default('{}'),
    apparitionJson: t.string().default('null'),
  },
  'GhostState',
);
export type GhostState = SchemaType<typeof GhostState>;

export const NishiState = schema(
  {
    phase: t.string().default('lobby'),
    code: t.string().default(''),
    isPrivate: t.boolean().default(false),
    hostId: t.string().default(''),
    mode: t.string().default('coop'),
    seed: t.uint32().default(0),
    time: t.float32().default(0),
    threat: t.float32().default(0),
    worldJson: t.string().default(''),
    resultJson: t.string().default(''),
    players: t.map(PlayerState),
    ghost: GhostState,
  },
  'NishiState',
);
export type NishiState = SchemaType<typeof NishiState>;
