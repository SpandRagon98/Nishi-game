import { v3 } from '../math';
import { box, door, slope, wallX, wallZ } from './builders';
import type { BoxDef, LevelDef } from './types';

/**
 * PLATFORM ZERO — Nishipur Junction (fictional), outskirts of Kolkata.
 *
 * Coordinate system: metres, +X east along the platform, +Z south towards the tracks, +Y up.
 * Building & platform floor top = 0. Track bed = -1.2. Underground passage floor = -3.5.
 *
 *            z=-22  [street shutter]
 *                   | exit corridor |
 *   z=-14 ┌──ticket──┬──concourse─[GATE]──┬─office─┬─signal─┬─maint─┐
 *         │          │                    │        │        │       │
 *   z=0   └───d──────┴────arch────────────┴──d─────┴──d─────┴──d────┘
 *   z=0..8   PLATFORM (stairwells at both ends down to the passage below)
 *   z=8..19.5 track bed, parked carriage on track 1, tunnel portal to the east
 */

const T = 0.3; // outer wall thickness
const P = 0.25; // partition thickness
const H = 4.2; // interior wall height

const boxes: BoxDef[] = [];
const add = (...b: BoxDef[]) => boxes.push(...b);

// ───────────────────────── Floors ─────────────────────────
add(box(-30.3, -0.6, -14.3, 30.3, 0, 0, 'mosaic', 'floor')); // building floor
add(box(-12, -0.6, -22, -8, 0, -14.3, 'mosaic', 'floor')); // exit corridor floor
// platform slab pieces around the two stairwells (x -36..-30 and 30..36, z 2..5)
add(box(-40, -0.6, 0, 40, 0, 2, 'platform', 'floor'));
add(box(-40, -0.6, 5, 40, 0, 8, 'platform', 'floor', { id: 'platform_edge' }));
add(box(-40, -0.6, 2, -36, 0, 5, 'platform', 'floor'));
add(box(-30, -0.6, 2, 30, 0, 5, 'platform', 'floor'));
add(box(36, -0.6, 2, 40, 0, 5, 'platform', 'floor'));
// platform face down to the tracks
add(box(-40, -1.2, 7.7, 40, -0.6, 8, 'concrete', 'wall', { los: false }));
// ramps at platform ends down to track level
add(slope(40, 0, 44, -1.2, 0, 8, 0.3, 'concrete', 'ramp'));
add(slope(-40, 0, -44, -1.2, 0, 8, 0.3, 'concrete', 'ramp'));
// ground / track bed
add(box(-50, -1.5, 8, 56, -1.2, 19.5, 'ballast', 'floor'));
add(box(-50, -1.5, -2, -40, -1.2, 8, 'ballast', 'floor'));
add(box(40, -1.5, -2, 56, -1.2, 8, 'ballast', 'floor'));
// underground passage + alcove + stairs
add(box(-30, -3.8, 2, 30, -3.5, 5, 'tile', 'floor'));
add(box(-4, -3.8, 5, 2, -3.5, 7.5, 'tile', 'floor'));
add(slope(-36, 0, -30, -3.5, 2, 5, 0.35, 'concrete', 'stairs'));
add(slope(30, -3.5, 36, 0, 2, 5, 0.35, 'concrete', 'stairs'));

// ───────────────────────── Station building ─────────────────────────
// south wall facing the platform
add(...wallX(-T, 0, -30.3, 30.3, 0, H, 'plaster', [
  door(-26, -24.6),
  door(-14, -6, 3.4), // concourse arch
  door(4, 5.2),
  door(14, 15.2),
  door(24, 25.2),
]));
// north wall with the exit gate opening
add(...wallX(-14.3, -14, -30.3, 30.3, 0, H, 'plaster', [door(-12, -8, 3.2)]));
add(...wallZ(-30.3, -30, -14.3, 0, 0, H, 'plaster'));
add(...wallZ(30, 30.3, -14.3, 0, 0, H, 'plaster'));
// partitions
add(...wallZ(-20 - P / 2, -20 + P / 2, -14, -T, 0, H, 'plaster', [door(-4, -2.6)]));
add(...wallZ(-P / 2, P / 2, -14, -T, 0, H, 'plaster', [door(-9, -7.8)]));
add(...wallZ(10 - P / 2, 10 + P / 2, -14, -T, 0, H, 'plaster', [door(-11, -9.8)]));
add(...wallZ(20 - P / 2, 20 + P / 2, -14, -T, 0, H, 'plaster'));
// ceiling
add(box(-30.3, H, -14.3, 30.3, H + 0.3, 0, 'ceiling', 'ceiling'));
// exit corridor
add(...wallZ(-12.3, -12, -22, -14.3, 0, 3.2, 'brick'));
add(...wallZ(-8, -7.7, -22, -14.3, 0, 3.2, 'brick'));
add(box(-12.3, 3.2, -22.3, -7.7, 3.4, -14.3, 'ceiling', 'ceiling'));
// the street shutter is jammed half-up: Kabir's headlights shine in under it
add(box(-12.3, 1.45, -22.3, -7.7, 3.2, -22, 'rust', 'wall', { id: 'street_shutter' }));

// ───────────────────────── Boundaries ─────────────────────────
add(box(-40, -1.2, -T, -30.3, 3, 0, 'brick', 'wall'));
add(box(30.3, -1.2, -T, 40, 3, 0, 'brick', 'wall'));
add(box(-40.3, -1.2, -2.3, -40, 3, 0, 'brick', 'wall'));
add(box(40, -1.2, -2.3, 40.3, 3, 0, 'brick', 'wall'));
add(box(-50, -1.2, -2.3, -40, 2.5, -2, 'brick', 'wall'));
add(box(40, -1.2, -2.3, 56, 2.5, -2, 'brick', 'wall'));
add(box(-50.3, -1.2, -2.3, -50, 2.5, 19.8, 'brick', 'wall'));
// far boundary: rendered as a brick arcade with iron grilles (apps/client Station.tsx)
add(box(-50, -1.2, 19.5, 56, 5, 19.8, 'brick', 'wall', { hidden: true }));
// tunnel portal and inaccessible tunnel
add(...wallZ(56, 57, -2.3, 19.8, -1.2, 6, 'stone', [{ a: 8.5, b: 14.5, top: 5.6 }]));
add(box(57, -1.5, 8.5, 64, -1.2, 14.5, 'ballast', 'floor'));
add(box(57, -1.2, 8.2, 64, 5.4, 8.5, 'stone', 'wall'));
add(box(57, -1.2, 14.5, 64, 5.4, 14.8, 'stone', 'wall'));
add(box(57, 4.4, 8.2, 64, 5.4, 14.8, 'stone', 'ceiling'));
add(box(59.6, -1.2, 8.5, 59.8, 4.4, 14.5, 'wood', 'wall', { id: 'tunnel_barrier' }));
add(box(60.5, -1.2, 8.5, 63, 3.0, 14.5, 'stone', 'wall', { id: 'tunnel_debris' }));
add(box(63.5, -1.2, 8.5, 64, 4.4, 14.5, 'darkness', 'wall'));

// ───────────────────────── Platform furniture ─────────────────────────
add(box(-38, 5, -T, 38, 5.15, 7.6, 'corrugated', 'ceiling', { id: 'canopy' }));
for (let x = -36; x <= 36; x += 8) add(box(x - 0.18, 0, 6.32, x + 0.18, 5, 6.68, 'rust', 'prop', { los: false }));
for (const x of [-32, -16, 16, 32]) add(box(x - 1.2, 0, 5.6, x + 1.2, 0.5, 6.1, 'wood', 'prop', { los: false }));
add(box(-1.5, 0, 5.4, 1.5, 2.4, 7.0, 'corrugated', 'prop', { id: 'tea_stall' }));
add(box(23.2, 0, 5.7, 25, 0.9, 6.3, 'rust', 'prop', { id: 'trolley', los: false }));
add(box(-24.3, 0, 6.2, -23.7, 1.0, 6.6, 'concrete', 'prop', { id: 'water_tap', los: false }));
// stairwell railings
for (const [x0, x1] of [[-36, -30], [30, 36]] as const) {
  add(box(x0, 0, 1.9, x1, 1.05, 2, 'metal', 'prop', { los: false }));
  add(box(x0, 0, 5, x1, 1.05, 5.1, 'metal', 'prop', { los: false }));
}
add(box(-30, 0, 2, -29.9, 1.05, 5, 'metal', 'prop', { los: false }));
add(box(29.9, 0, 2, 30, 1.05, 5, 'metal', 'prop', { los: false }));

// ───────────────────────── Underground passage ─────────────────────────
add(box(-36, -3.8, 1.7, 36, -0.6, 2, 'tile', 'wall'));
add(box(-36, -3.8, 5, -4, -0.6, 5.3, 'tile', 'wall'));
add(box(2, -3.8, 5, 36, -0.6, 5.3, 'tile', 'wall'));
add(box(-36.3, -3.8, 2, -36, -0.6, 5, 'tile', 'wall'));
add(box(36, -3.8, 2, 36.3, -0.6, 5, 'tile', 'wall'));
add(box(-4.3, -3.8, 5, -4, -0.6, 7.8, 'tile', 'wall'));
add(box(2, -3.8, 5, 2.3, -0.6, 7.8, 'tile', 'wall'));
add(box(-4, -3.8, 7.5, 2, -0.6, 7.8, 'tile', 'wall'));
add(box(0.6, -3.5, 6.6, 1.9, -1.5, 7.5, 'rust', 'prop', { id: 'passage_cabinet' }));
add(box(-3.6, -3.5, 6.7, -2.4, -3.0, 7.4, 'wood', 'prop', { id: 'passage_crate', los: false }));

// ───────────────────────── Carriage (track 1) ─────────────────────────
add(box(-12, -0.15, 8.0, 12, 0.05, 11.6, 'carriage', 'floor', { id: 'carriage_floor' }));
add(box(-11.5, -1.2, 8.4, 11.5, -0.15, 11.6, 'metal', 'wall', { los: false, id: 'undercarriage', hidden: true }));
// coach shell: collision only — the detailed EMU body is drawn by the client (Train.tsx)
add(...wallX(8.4, 8.5, -12, 12, 0.05, 2.7, 'carriage', [door(-10, -9, 2.05), door(9, 10, 2.05)], { hidden: true }));
add(box(-12, 0.05, 11.5, 12, 2.7, 11.6, 'carriage', 'wall', { hidden: true }));
add(box(-12, 0.05, 8.4, -11.9, 2.7, 11.6, 'carriage', 'wall', { hidden: true }));
add(box(11.9, 0.05, 8.4, 12, 2.7, 11.6, 'carriage', 'wall', { hidden: true }));
add(box(-12, 2.7, 8.4, 12, 2.9, 11.6, 'carriage', 'ceiling', { hidden: true }));
for (const x of [-10.5, -7, -3.5, 0, 3.5, 7]) add(box(x - 0.03, 0.05, 9.8, x + 0.03, 2.0, 11.5, 'wood', 'wall'));
for (const x of [-8.75, -5.25, -1.75, 1.75, 5.25, 8.6]) {
  add(box(x - 1.4, 0.05, 10.6, x + 1.4, 0.5, 11.5, 'wood', 'prop', { los: false }));
}
add(box(10.5, 0.05, 10.4, 11.9, 2.4, 11.5, 'metal', 'prop', { id: 'carriage_toilet' }));
// the rest of the parked EMU rake, running into the tunnel (drawn by the client)
add(box(12.25, -1.2, 8.45, 57, 3.1, 11.55, 'carriage', 'wall', { hidden: true, id: 'emu_rake' }));
// EMU driving-cab nose at the west end (drawn by the client)
add(box(-12.7, -0.15, 8.45, -12, 2.85, 11.55, 'carriage', 'wall', { hidden: true, id: 'emu_cab' }));

// ───────────────────────── Room furniture ─────────────────────────
// ticket office
add(box(-28, 0, -6.5, -22, 1.1, -5.8, 'wood', 'prop', { id: 'ticket_counter', los: false }));
add(box(-29.6, 0, -14, -24, 2.2, -13.5, 'wood', 'prop', { id: 'ticket_shelf' }));
// concourse benches
for (const [cx, cz] of [[-15.5, -8.8], [-4.5, -8.8], [-15.5, -4.5], [-4.5, -4.5]] as const) {
  add(box(cx - 2.5, 0, cz - 0.25, cx + 2.5, 0.5, cz + 0.25, 'wood', 'prop', { los: false }));
}
// station master's office
add(box(3, 0, -8, 7, 0.8, -7, 'wood', 'prop', { id: 'desk', los: false }));
add(box(8.4, 0, -13.9, 9.8, 2.2, -12.9, 'wood', 'prop', { id: 'office_cupboard' }));
add(box(1, 0, -13.9, 2, 1.4, -13.3, 'metal', 'prop', { id: 'filing_cabinet', los: false }));
// signal control room
add(box(11, 0, -13.5, 19, 1.2, -12.6, 'rust', 'prop', { id: 'lever_frame', los: false }));
add(box(18.6, 0, -9, 19.7, 0.95, -6, 'metal', 'prop', { id: 'pa_desk', los: false }));
// maintenance room
add(box(29.2, 0, -7, 29.75, 2, -3, 'metal', 'prop', { id: 'lockers' }));
add(box(21, 0, -13.9, 24, 0.9, -13, 'wood', 'prop', { id: 'workbench', los: false }));
add(box(21, 0, -4, 23, 1.2, -2, 'rust', 'prop', { id: 'generator', los: false }));
add(box(24.4, 0.9, -14, 25.6, 2.1, -13.75, 'metal', 'prop', { id: 'fuse_box_body', los: false }));

const exitGate = box(-12, 0, -14.3, -8, 3.2, -14, 'rust', 'wall', { id: 'exit_gate' });

export const PLATFORM_ZERO: LevelDef = {
  id: 'platform-zero',
  name: 'Nishipur Junction — Platform Zero',
  boxes,
  exitGate,
  zones: [
    { id: 'passage', name: 'Underground Passage', rect: { minX: -36, minZ: 2, maxX: 36, maxZ: 7.8 }, minY: -4, maxY: -0.7, surface: 'water', indoor: true },
    { id: 'carriage', name: 'Abandoned Carriage', rect: { minX: -12, minZ: 8.4, maxX: 12, maxZ: 11.6 }, minY: -0.3, maxY: 3, surface: 'metal', indoor: true },
    { id: 'ticket', name: 'Ticket Office', rect: { minX: -30, minZ: -14, maxX: -20, maxZ: -0.3 }, minY: -0.5, maxY: 4.5, surface: 'tile', indoor: true },
    { id: 'concourse', name: 'Waiting Hall', rect: { minX: -20, minZ: -14, maxX: 0, maxZ: -0.3 }, minY: -0.5, maxY: 4.5, surface: 'tile', indoor: true },
    { id: 'office', name: "Station Master's Office", rect: { minX: 0, minZ: -14, maxX: 10, maxZ: -0.3 }, minY: -0.5, maxY: 4.5, surface: 'wood', indoor: true },
    { id: 'signal', name: 'Signal Control Room', rect: { minX: 10, minZ: -14, maxX: 20, maxZ: -0.3 }, minY: -0.5, maxY: 4.5, surface: 'wood', indoor: true },
    { id: 'maintenance', name: 'Maintenance Room', rect: { minX: 20, minZ: -14, maxX: 30, maxZ: -0.3 }, minY: -0.5, maxY: 4.5, surface: 'concrete', indoor: true },
    { id: 'exit', name: 'Exit Corridor', rect: { minX: -12, minZ: -22, maxX: -8, maxZ: -14 }, minY: -0.5, maxY: 4, surface: 'tile', indoor: true },
    { id: 'tunnel', name: 'Tunnel Mouth', rect: { minX: 56, minZ: 8.5, maxX: 64, maxZ: 14.5 }, minY: -2, maxY: 5, surface: 'gravel', indoor: true },
    { id: 'platform', name: 'Platform Zero', rect: { minX: -44, minZ: -0.3, maxX: 44, maxZ: 8.2 }, minY: -1.3, maxY: 6, surface: 'concrete', indoor: false },
    { id: 'tracks', name: 'Track Bed', rect: { minX: -50, minZ: -2, maxX: 64, maxZ: 19.5 }, minY: -2, maxY: 6, surface: 'gravel', indoor: false },
  ],
  lights: [
    // emergency circuit (battery) — on from the start, faulty
    { id: 'l_plat_flicker', pos: v3(-20, 4.7, 4), color: '#cfeef0', intensity: 9, distance: 16, circuit: 'emergency', zone: 'platform', kind: 'tube', faulty: 0.55 },
    { id: 'l_sign', pos: v3(-10, 4.2, 0.9), color: '#ffcf7a', intensity: 4, distance: 9, circuit: 'emergency', zone: 'platform', kind: 'sign', faulty: 0.25 },
    { id: 'l_concourse_em', pos: v3(-10, 3.9, -7), color: '#ffe0a0', intensity: 6, distance: 12, circuit: 'emergency', zone: 'concourse', kind: 'tube', faulty: 0.35 },
    { id: 'l_passage_em', pos: v3(-15, -0.9, 3.5), color: '#cfe8ff', intensity: 4, distance: 10, circuit: 'emergency', zone: 'passage', kind: 'tube', faulty: 0.7 },
    { id: 'l_maint_em', pos: v3(25, 3.9, -8), color: '#ffc070', intensity: 5, distance: 11, circuit: 'emergency', zone: 'maintenance', kind: 'bulb', faulty: 0.2 },
    // cast-iron wall lanterns on the station front (battery circuit, sodium-warm)
    ...[-28, -17.5, 7.5, 19, 27].map((x, i) => ({
      id: `l_lantern_${i}`, pos: v3(x, 2.9, 0.32), color: '#ffa04a', intensity: 2.4, distance: 7.5,
      circuit: 'emergency' as const, zone: 'platform', kind: 'lantern' as const, faulty: [0.15, 0.5, 0.05, 0.3, 0.6][i],
    })),
    // the parked EMU's battery-fed saloon tubes: cold, dim, one of them failing
    { id: 'l_carriage_em_w', pos: v3(-6.5, 2.5, 10), color: '#d8f0ec', intensity: 11, distance: 11, circuit: 'emergency', zone: 'carriage', kind: 'tube', faulty: 0.35 },
    { id: 'l_carriage_em_e', pos: v3(6.5, 2.5, 10), color: '#d8f0ec', intensity: 9, distance: 11, circuit: 'emergency', zone: 'carriage', kind: 'tube', faulty: 0.12 },
    { id: 'l_signal_red', pos: v3(15, 2.4, -13.2), color: '#ff3b2a', intensity: 2.5, distance: 7, circuit: 'emergency', zone: 'signal', kind: 'lamp', faulty: 0.1 },
    // main circuit — restored by the fuse puzzle
    { id: 'l_plat_w', pos: v3(-32, 4.7, 4), color: '#fff1c4', intensity: 10, distance: 18, circuit: 'main', zone: 'platform', kind: 'tube', faulty: 0.1 },
    { id: 'l_plat_c', pos: v3(-6, 4.7, 4), color: '#fff1c4', intensity: 10, distance: 18, circuit: 'main', zone: 'platform', kind: 'tube', faulty: 0.15 },
    { id: 'l_plat_e', pos: v3(12, 4.7, 4), color: '#fff1c4', intensity: 10, distance: 18, circuit: 'main', zone: 'platform', kind: 'tube', faulty: 0.05 },
    { id: 'l_plat_ee', pos: v3(32, 4.7, 4), color: '#fff1c4', intensity: 10, distance: 18, circuit: 'main', zone: 'platform', kind: 'tube', faulty: 0.3 },
    { id: 'l_ticket', pos: v3(-25, 3.9, -7), color: '#fff4d6', intensity: 7, distance: 12, circuit: 'main', zone: 'ticket', kind: 'tube', faulty: 0.1 },
    { id: 'l_office', pos: v3(5, 3.9, -7), color: '#ffe8b0', intensity: 7, distance: 12, circuit: 'main', zone: 'office', kind: 'bulb', faulty: 0.05 },
    { id: 'l_signal', pos: v3(15, 3.9, -7), color: '#fff4d6', intensity: 7, distance: 12, circuit: 'main', zone: 'signal', kind: 'tube', faulty: 0.1 },
    { id: 'l_passage', pos: v3(15, -0.9, 3.5), color: '#e2f0ff', intensity: 5, distance: 12, circuit: 'main', zone: 'passage', kind: 'tube', faulty: 0.2 },
    { id: 'l_carriage', pos: v3(0, 2.5, 10), color: '#fff0c8', intensity: 12, distance: 13, circuit: 'main', zone: 'carriage', kind: 'bulb', faulty: 0.25 },
    { id: 'l_exit', pos: v3(-10, 3.0, -18), color: '#ffe5b0', intensity: 5, distance: 10, circuit: 'main', zone: 'exit', kind: 'bulb', faulty: 0.1 },
  ],
  doors: [
    { id: 'd_ticket', zone: 'ticket', gap: { minX: -26, minZ: -T, maxX: -24.6, maxZ: 0 }, axis: 'x', height: 2.2, swing: -1, open: true, label: 'Ticket office door' },
    { id: 'd_ticket_side', zone: 'concourse', gap: { minX: -20 - P / 2, minZ: -4, maxX: -20 + P / 2, maxZ: -2.6 }, axis: 'z', height: 2.2, swing: 1, open: true, label: 'Side door' },
    { id: 'd_office', zone: 'office', gap: { minX: 4, minZ: -T, maxX: 5.2, maxZ: 0 }, axis: 'x', height: 2.2, swing: -1, open: true, label: "Station master's door" },
    { id: 'd_office_side', zone: 'office', gap: { minX: -P / 2, minZ: -9, maxX: P / 2, maxZ: -7.8 }, axis: 'z', height: 2.2, swing: 1, open: false, label: 'Office side door' },
    { id: 'd_signal', zone: 'signal', gap: { minX: 14, minZ: -T, maxX: 15.2, maxZ: 0 }, axis: 'x', height: 2.2, swing: -1, open: true, label: 'Signal room door' },
    { id: 'd_signal_side', zone: 'signal', gap: { minX: 10 - P / 2, minZ: -11, maxX: 10 + P / 2, maxZ: -9.8 }, axis: 'z', height: 2.2, swing: 1, open: true, label: 'Connecting door' },
    { id: 'd_maint', zone: 'maintenance', gap: { minX: 24, minZ: -T, maxX: 25.2, maxZ: 0 }, axis: 'x', height: 2.2, swing: -1, open: false, lockedBy: 'maintenance_key', label: 'Maintenance door' },
  ],
  hidingSpots: [
    { id: 'h_counter', label: 'Hide under the ticket counter', entry: v3(-25, 0, -7.3), eye: v3(-25, 0.75, -6.15), yaw: Math.PI, zone: 'ticket' },
    { id: 'h_cupboard', label: 'Hide in the cupboard', entry: v3(9.1, 0, -12.2), eye: v3(9.1, 1.5, -13.4), yaw: Math.PI, zone: 'office' },
    { id: 'h_locker', label: 'Hide in the locker', entry: v3(28.5, 0, -5), eye: v3(29.48, 1.55, -5), yaw: Math.PI / 2, zone: 'maintenance' },
    { id: 'h_toilet', label: 'Hide in the carriage toilet', entry: v3(11.2, 0.05, 9.6), eye: v3(11.2, 1.5, 10.95), yaw: 0, zone: 'carriage' },
    { id: 'h_cabinet', label: 'Hide in the rusted cabinet', entry: v3(1.25, -3.5, 5.9), eye: v3(1.25, -2.0, 7.05), yaw: 0, zone: 'passage' },
  ],
  interactables: [
    {
      // always on the bench a few steps from where you arrive, so the first task is easy to find
      id: 'flashlight_kit', kind: 'flashlight_kit', label: 'Red emergency kit', zone: 'platform', radius: 3,
      candidates: [v3(-16, 0.55, 5.85)],
    },
    { id: 'logbook', kind: 'logbook', label: "Station master's logbook", pos: v3(4, 0.83, -7.4), zone: 'office', radius: 2.5 },
    { id: 'drawer', kind: 'drawer', label: 'Desk drawer', pos: v3(5.6, 0.6, -6.95), zone: 'office', radius: 2.5 },
    { id: 'phone', kind: 'phone', label: 'Old telephone', pos: v3(6.4, 0.86, -7.5), zone: 'office', radius: 2.5 },
    ...(['a', 'b', 'c'] as const).map((k) => ({
      id: `reel_${k}`, kind: 'reel' as const, label: `Audio reel ${k.toUpperCase()}`, zone: 'any', radius: 2.8,
    })),
    { id: 'fuse_box', kind: 'fuse_box', label: 'Fuse box', pos: v3(25, 1.5, -13.6), zone: 'maintenance', radius: 2.7 },
    { id: 'pa_console', kind: 'pa_console', label: 'Announcement console', pos: v3(18.5, 1.05, -7.5), zone: 'signal', radius: 2.7 },
    { id: 'exit_gate', kind: 'exit_gate', label: 'Exit doors: start the motor', pos: v3(-10, 1.2, -13.7), zone: 'concourse', radius: 2.6 },
    { id: 'note_ticket', kind: 'note', label: 'Old ticket stub', pos: v3(-27.2, 1.12, -6.2), zone: 'ticket', radius: 2.5 },
    { id: 'note_memo', kind: 'note', label: 'Typed memorandum', pos: v3(12.5, 1.22, -12.9), zone: 'signal', radius: 2.5 },
    { id: 'note_photo', kind: 'note', label: 'Faded photograph', pos: v3(-4.2, 0.52, 11), zone: 'carriage', radius: 2.5 },
  ],
  waypoints: [
    // platform north row
    ...[-38, -32, -25.3, -18, -10, -2, 4.6, 10, 14.6, 20, 24.6, 32, 38].map((x) => ({ id: `p${x}`, pos: v3(x, 0, 1.1) })),
    // platform middle row
    ...[-24, -12, 0, 12, 24].map((x) => ({ id: `m${x}`, pos: v3(x, 0, 4) })),
    { id: 'cd1', pos: v3(-9.5, 0, 7.4) },
    { id: 'cd2', pos: v3(9.5, 0, 7.4) },
    ...[-9.5, -4, 2, 9.5].map((x) => ({ id: `c${x}`, pos: v3(x, 0.05, 9.1) })),
    // ramps / track bed / tunnel
    { id: 'rw', pos: v3(-42, -0.6, 4) },
    { id: 're', pos: v3(42, -0.6, 4) },
    { id: 'gw', pos: v3(-46, -1.2, 4) },
    { id: 'ge', pos: v3(46, -1.2, 4) },
    ...[-46, -30, -14, 0, 14, 30, 46].map((x) => ({ id: `t${x}`, pos: v3(x, -1.2, 14) })),
    { id: 'tun', pos: v3(57.8, -1.2, 13.4) },
    // ticket office
    { id: 'tk_in', pos: v3(-25.3, 0, -1.5) },
    { id: 'tk_c', pos: v3(-25, 0, -4) },
    { id: 'tk_back', pos: v3(-21, 0, -8) },
    { id: 'tk_side', pos: v3(-21, 0, -3.3) },
    // concourse
    { id: 'cc_arch', pos: v3(-10, 0, -1.5) },
    { id: 'cc_c', pos: v3(-10, 0, -6.8) },
    { id: 'cc_w', pos: v3(-18.5, 0, -3.3) },
    { id: 'cc_e', pos: v3(-1.2, 0, -8.4) },
    { id: 'cc_gate', pos: v3(-10, 0, -12.8) },
    { id: 'ex1', pos: v3(-10, 0, -16) },
    { id: 'ex2', pos: v3(-10, 0, -20) },
    // office
    { id: 'of_in', pos: v3(4.6, 0, -1.5) },
    { id: 'of_c', pos: v3(8, 0, -5) },
    { id: 'of_sw', pos: v3(1.5, 0, -5) },
    { id: 'of_desk', pos: v3(4.5, 0, -6.2) },
    { id: 'of_w', pos: v3(1.2, 0, -8.4) },
    { id: 'of_back', pos: v3(8, 0, -11) },
    { id: 'of_e', pos: v3(9, 0, -10.4) },
    // signal
    { id: 'sg_w', pos: v3(11, 0, -10.4) },
    { id: 'sg_in', pos: v3(14.6, 0, -1.5) },
    { id: 'sg_c', pos: v3(15, 0, -7) },
    { id: 'sg_back', pos: v3(15, 0, -11.5) },
    // maintenance
    { id: 'mt_in', pos: v3(24.6, 0, -1.5) },
    { id: 'mt_c', pos: v3(25, 0, -7) },
    { id: 'mt_back', pos: v3(25, 0, -12) },
    // stairs & passage
    { id: 'sw_top', pos: v3(-36.3, 0, 3.5) },
    { id: 'sw_mid', pos: v3(-33, -1.75, 3.5) },
    { id: 'se_top', pos: v3(36.3, 0, 3.5) },
    { id: 'se_mid', pos: v3(33, -1.75, 3.5) },
    ...[-29, -20, -10, -1, 10, 20, 29].map((x) => ({ id: `u${x}`, pos: v3(x, -3.5, 3.5) })),
    { id: 'u_alc', pos: v3(-1, -3.5, 6.2) },
  ],
  edges: [
    ['p-38', 'p-32'], ['p-32', 'p-25.3'], ['p-25.3', 'p-18'], ['p-18', 'p-10'], ['p-10', 'p-2'], ['p-2', 'p4.6'],
    ['p4.6', 'p10'], ['p10', 'p14.6'], ['p14.6', 'p20'], ['p20', 'p24.6'], ['p24.6', 'p32'], ['p32', 'p38'],
    ['p-25.3', 'm-24'], ['p-18', 'm-24'], ['p-18', 'm-12'], ['p-10', 'm-12'], ['p-2', 'm0'], ['p4.6', 'm0'],
    ['p10', 'm12'], ['p14.6', 'm12'], ['p20', 'm24'], ['p24.6', 'm24'],
    ['m-24', 'm-12'], ['m-12', 'm0'], ['m0', 'm12'], ['m12', 'm24'],
    ['m-12', 'cd1'], ['m12', 'cd2'], ['cd1', 'c-9.5'], ['cd2', 'c9.5'],
    ['c-9.5', 'c-4'], ['c-4', 'c2'], ['c2', 'c9.5'],
    ['p-38', 'rw'], ['rw', 'gw'], ['p38', 're'], ['re', 'ge'],
    ['gw', 't-46'], ['t-46', 't-30'], ['t-30', 't-14'], ['t-14', 't0'], ['t0', 't14'], ['t14', 't30'], ['t30', 't46'], ['t46', 'tun'],
    ['p-25.3', 'tk_in'], ['tk_in', 'tk_c'], ['tk_c', 'tk_side'], ['tk_back', 'tk_side'], ['tk_side', 'cc_w'],
    ['p-10', 'cc_arch'], ['cc_arch', 'cc_c'], ['cc_c', 'cc_w'], ['cc_c', 'cc_e'], ['cc_c', 'cc_gate'], ['cc_gate', 'ex1'], ['ex1', 'ex2'],
    ['cc_e', 'of_w'], ['p4.6', 'of_in'], ['of_in', 'of_c'], ['of_c', 'of_sw'], ['of_sw', 'of_w'], ['of_sw', 'of_desk'], ['of_c', 'of_desk'], ['of_c', 'of_back'], ['of_back', 'of_e'], ['of_e', 'sg_w'],
    ['sg_w', 'sg_back'], ['sg_w', 'sg_c'], ['p14.6', 'sg_in'], ['sg_in', 'sg_c'], ['sg_c', 'sg_back'],
    ['p24.6', 'mt_in'], ['mt_in', 'mt_c'], ['mt_c', 'mt_back'],
    ['p-38', 'sw_top'], ['sw_top', 'sw_mid'], ['sw_mid', 'u-29'], ['p38', 'se_top'], ['se_top', 'se_mid'], ['se_mid', 'u29'],
    ['u-29', 'u-20'], ['u-20', 'u-10'], ['u-10', 'u-1'], ['u-1', 'u10'], ['u10', 'u20'], ['u20', 'u29'], ['u-1', 'u_alc'],
  ],
  survivorSpawns: [v3(-22, 0, 3.4), v3(-20.5, 0, 3.4), v3(-22, 0, 4.6), v3(-20.5, 0, 4.6)],
  ghostSpawn: v3(57.8, -1.2, 13.4),
  escapeZone: { minX: -12, minZ: -22, maxX: -8, maxZ: -19 },
  checkpoints: {
    start: v3(-21, 0, 4),
    flashlight: v3(-21, 0, 4),
    office: v3(5, 0, -4),
    reels: v3(-10, 0, -4),
    power: v3(25, 0, -4),
    decode: v3(15, 0, -4),
    exit: v3(-10, 0, -10),
  },
  roofs: [
    { minX: -30.5, minZ: -22.5, maxX: 30.5, maxZ: 0.1 },
    { minX: -38, minZ: -0.3, maxX: 38, maxZ: 7.6 },
    { minX: -12, minZ: 8.4, maxX: 12, maxZ: 11.6 },
    { minX: 57, minZ: 8.2, maxX: 64, maxZ: 14.8 },
  ],
  bounds: { min: v3(-50, -4, -22), max: v3(64, 8, 19.8) },
};

export const REEL_CANDIDATES = [
  v3(-28.5, 0.12, -11.5), // ticket office floor by the shelf
  v3(-4.5, 0.55, -8.8), // waiting hall bench
  v3(17.5, 1.25, -13.0), // lever frame
  v3(5.25, 0.55, 11.0), // carriage berth
  v3(-3.0, -2.95, 7.05), // passage crate
  v3(0, 1.0, 5.25), // tea stall counter
  v3(22.5, 0.95, -13.4), // maintenance workbench
  v3(32, 0.55, 5.85), // far platform bench
  v3(-11.4, 0.17, 9.3), // carriage end floor
];
