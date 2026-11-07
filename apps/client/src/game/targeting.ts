import type { LevelDef, SurvivorView, Vec3, WorldSnapshot } from '@nishi/shared';

export interface Target {
  id: string;
  label: string;
  kind: 'item' | 'door' | 'hide' | 'revive';
  pos: Vec3;
}

/** Pick what the survivor is looking at. Ranges are slightly stricter than the server's. */
export function findTarget(level: LevelDef, snap: WorldSnapshot, me: SurvivorView, eye: Vec3, fwd: Vec3): Target | null {
  const w = snap.world;
  const cands: (Target & { range: number; cone: number })[] = [];

  for (const def of level.interactables) {
    const pos = w.itemPos[def.id] ?? def.pos;
    if (!pos) continue;
    let label = '';
    switch (def.kind) {
      case 'flashlight_kit':
        if (me.hasFlashlight) continue;
        label = 'Take a flashlight from the emergency kit';
        break;
      case 'logbook':
        label = w.office.logbook ? 'Read the logbook again' : "Read the station master's logbook";
        break;
      case 'drawer':
        if (w.office.drawer) continue;
        label = 'Open the desk drawer';
        break;
      case 'phone':
        label = w.phoneRingingUntil > snap.time ? 'Answer the ringing telephone' : 'Lift the receiver';
        break;
      case 'reel':
        if (w.collected.includes(def.id)) continue;
        label = `Take ${def.label}`;
        break;
      case 'fuse_box':
        if (w.power) continue;
        label = 'Open the fuse box';
        break;
      case 'pa_console':
        if (w.decoded) continue;
        label = 'Use the announcement console';
        break;
      case 'exit_gate':
        if (w.exitOpen || w.exitOpenAt) continue;
        label = w.decoded ? 'Start the gate motor' : 'Try the exit gate';
        break;
      case 'note':
        label = `Read: ${def.label}`;
        break;
    }
    cands.push({ id: def.id, label, kind: 'item', pos, range: def.kind === 'exit_gate' ? 2.6 : 2.2, cone: def.kind === 'exit_gate' ? 0.6 : 0.82 });
  }

  for (const d of level.doors) {
    const st = w.doors[d.id];
    const pos = { x: (d.gap.minX + d.gap.maxX) / 2, y: 1.1, z: (d.gap.minZ + d.gap.maxZ) / 2 };
    const hasKey = d.lockedBy ? w.inventory.includes(d.lockedBy) : false;
    const label = st.locked ? (hasKey ? `Unlock the ${d.label.toLowerCase()}` : `${d.label} (locked)`) : `${st.open ? 'Close' : 'Open'} the ${d.label.toLowerCase()}`;
    cands.push({ id: d.id, label, kind: 'door', pos, range: 2.3, cone: 0.55 });
  }

  for (const h of level.hidingSpots) {
    if (snap.survivors.some((s) => s.hiding === h.id)) continue;
    const flat = Math.hypot(h.entry.x - me.pos.x, h.entry.z - me.pos.z);
    if (flat > 1.55 || Math.abs(h.entry.y - me.pos.y) > 1) continue;
    cands.push({ id: h.id, label: h.label, kind: 'hide', pos: { x: h.eye.x, y: h.eye.y, z: h.eye.z }, range: 3, cone: 0.35 });
  }

  for (const s of snap.survivors) {
    if (s.id === me.id || s.status !== 'downed') continue;
    const d = Math.hypot(s.pos.x - me.pos.x, s.pos.z - me.pos.z);
    if (d < 2) cands.push({ id: s.id, label: `Hold E to revive ${s.name}`, kind: 'revive', pos: { x: s.pos.x, y: s.pos.y + 0.3, z: s.pos.z }, range: 3, cone: 0.3 });
  }

  let best: Target | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    const dx = c.pos.x - eye.x;
    const dy = c.pos.y - eye.y;
    const dz = c.pos.z - eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > c.range) continue;
    const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / Math.max(d, 1e-3);
    if (dot < c.cone) continue;
    const score = dot - d * 0.08 + (c.kind === 'item' ? 0.1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { id: c.id, label: c.label, kind: c.kind, pos: c.pos };
    }
  }
  return best;
}
