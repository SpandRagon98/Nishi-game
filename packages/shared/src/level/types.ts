import type { Rect2, Vec3 } from '../math';

export type MaterialId =
  | 'concrete'
  | 'platform'
  | 'plaster'
  | 'mosaic'
  | 'rust'
  | 'wood'
  | 'brick'
  | 'ballast'
  | 'corrugated'
  | 'stone'
  | 'carriage'
  | 'ceiling'
  | 'tile'
  | 'metal'
  | 'darkness';

export type BoxKind = 'floor' | 'wall' | 'prop' | 'ceiling' | 'ramp' | 'stairs';

export interface BoxDef {
  id?: string;
  /** centre */
  c: [number, number, number];
  /** full size */
  s: [number, number, number];
  mat: MaterialId;
  kind: BoxKind;
  /** rotation about Z (ramps along X). */
  rotZ?: number;
  /** blocks line of sight (defaults to true for walls). */
  los?: boolean;
  /** physics collider (defaults to true). */
  collide?: boolean;
  /** renderer hint: do not draw (collision only). */
  hidden?: boolean;
}

export type Surface = 'concrete' | 'tile' | 'wood' | 'metal' | 'gravel' | 'water';

export interface ZoneDef {
  id: string;
  name: string;
  rect: Rect2;
  minY: number;
  maxY: number;
  surface: Surface;
  indoor: boolean;
}

export interface LightDef {
  id: string;
  pos: Vec3;
  color: string;
  intensity: number;
  distance: number;
  circuit: 'emergency' | 'main';
  zone: string;
  kind: 'tube' | 'bulb' | 'sign' | 'lamp' | 'lantern';
  /** base flicker amount 0..1 */
  faulty?: number;
}

export interface DoorDef {
  id: string;
  zone: string;
  gap: Rect2;
  axis: 'x' | 'z';
  height: number;
  /** swing direction into the room (+1 / -1 along the perpendicular axis) */
  swing: 1 | -1;
  open: boolean;
  lockedBy?: string;
  label: string;
}

export interface HidingSpotDef {
  id: string;
  label: string;
  entry: Vec3;
  eye: Vec3;
  yaw: number;
  zone: string;
}

export type InteractableKind =
  | 'flashlight_kit'
  | 'logbook'
  | 'drawer'
  | 'phone'
  | 'reel'
  | 'fuse_box'
  | 'pa_console'
  | 'exit_gate'
  | 'note';

export interface InteractableDef {
  id: string;
  kind: InteractableKind;
  label: string;
  /** fixed position; reels / flashlight use spawn candidate lists instead */
  pos?: Vec3;
  candidates?: Vec3[];
  zone: string;
  radius: number;
}

export interface WaypointDef {
  id: string;
  pos: Vec3;
}

export interface LevelDef {
  id: string;
  name: string;
  boxes: BoxDef[];
  zones: ZoneDef[];
  lights: LightDef[];
  doors: DoorDef[];
  hidingSpots: HidingSpotDef[];
  interactables: InteractableDef[];
  waypoints: WaypointDef[];
  edges: [string, string][];
  survivorSpawns: Vec3[];
  ghostSpawn: Vec3;
  escapeZone: Rect2;
  exitGate: BoxDef;
  checkpoints: Record<string, Vec3>;
  /** roofed rectangles: no rain inside */
  roofs: Rect2[];
  bounds: { min: Vec3; max: Vec3 };
}
