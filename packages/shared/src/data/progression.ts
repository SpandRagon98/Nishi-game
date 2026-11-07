import { GHOSTS, SURVIVORS, type UnlockCondition } from './characters';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  secret?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'reel_7731', title: 'Reel 7731', description: 'Complete the prologue.' },
  { id: 'last_train_out', title: 'Last Train Out', description: 'Escape Platform Zero.' },
  { id: 'untouched', title: 'Untouched', description: 'Escape Platform Zero without retrying from a checkpoint.' },
  { id: 'fragments', title: 'Fragments', description: 'Find all three story fragments on Platform Zero.' },
  { id: 'holding_breath', title: 'Holding Breath', description: 'Stay hidden while the Caller hunts within 4 m of you.' },
  { id: 'flashbulb', title: 'Flashbulb', description: 'Stun the Caller with your flashlight.' },
  { id: 'before_dawn', title: 'Before Dawn', description: 'Escape Platform Zero in under 12 minutes.' },
  { id: 'no_one_left', title: 'No One Left Behind', description: 'Revive a teammate.' },
  { id: 'third_call', title: 'The Third Call', description: 'Win a match as the Caller.' },
];

export interface PlayerProfile {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  stats: {
    matches: number;
    escapes: number;
    captures: number;
    ghostWins: number;
    ghostMatches: number;
    stuns: number;
    revives: number;
    bestEscapeSec: number | null;
    playTimeSec: number;
  };
  achievements: string[];
  collectibles: string[];
  chaptersCompleted: string[];
  story: { prologueDone: boolean; choices: Record<string, string> };
  selectedSurvivor: string;
  selectedGhost: string;
}

export type MatchOutcome = 'escaped' | 'captured' | 'ghost_win' | 'ghost_loss' | 'abandoned';

export interface MatchResult {
  chapterId: string;
  mode: 'solo' | 'coop' | 'versus';
  role: 'survivor' | 'ghost';
  characterId: string;
  outcome: MatchOutcome;
  durationSec: number;
  fragments: string[];
  stuns: number;
  revives: number;
  hiddenCloseCalls: number;
  retries: number;
}

export function createProfile(id: string, name: string, now = Date.now()): PlayerProfile {
  return {
    version: 1,
    id,
    name,
    createdAt: now,
    stats: { matches: 0, escapes: 0, captures: 0, ghostWins: 0, ghostMatches: 0, stuns: 0, revives: 0, bestEscapeSec: null, playTimeSec: 0 },
    achievements: [],
    collectibles: [],
    chaptersCompleted: [],
    story: { prologueDone: false, choices: {} },
    selectedSurvivor: 'aditi',
    selectedGhost: 'caller',
  };
}

/** Validate/repair anything loaded from storage so a corrupted save never crashes the game. */
export function sanitizeProfile(raw: unknown, fallbackId: string): PlayerProfile {
  const base = createProfile(fallbackId, 'Guest');
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<PlayerProfile>;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : []);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const s = (r.stats ?? {}) as Partial<PlayerProfile['stats']>;
  return {
    ...base,
    id: typeof r.id === 'string' && r.id ? r.id : fallbackId,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 24) : 'Guest',
    createdAt: num(r.createdAt, base.createdAt),
    stats: {
      matches: num(s.matches, 0), escapes: num(s.escapes, 0), captures: num(s.captures, 0),
      ghostWins: num(s.ghostWins, 0), ghostMatches: num(s.ghostMatches, 0), stuns: num(s.stuns, 0),
      revives: num(s.revives, 0), playTimeSec: num(s.playTimeSec, 0),
      bestEscapeSec: typeof s.bestEscapeSec === 'number' ? s.bestEscapeSec : null,
    },
    achievements: strArr(r.achievements),
    collectibles: strArr(r.collectibles),
    chaptersCompleted: strArr(r.chaptersCompleted),
    story: {
      prologueDone: !!r.story?.prologueDone,
      choices: typeof r.story?.choices === 'object' && r.story?.choices ? { ...r.story.choices } : {},
    },
    selectedSurvivor: SURVIVORS.some((c) => c.id === r.selectedSurvivor && c.playable) ? r.selectedSurvivor! : 'aditi',
    selectedGhost: GHOSTS.some((c) => c.id === r.selectedGhost && c.playable) ? r.selectedGhost! : 'caller',
  };
}

export function isUnlocked(p: PlayerProfile, c: UnlockCondition): boolean {
  switch (c.type) {
    case 'default':
      return true;
    case 'achievement':
      return p.achievements.includes(c.id);
    case 'chapter':
      return p.chaptersCompleted.includes(c.chapterId);
    case 'collectibles':
      return p.collectibles.length >= c.count;
    case 'wins':
      return c.role === 'ghost' ? p.stats.ghostWins >= c.count : p.stats.escapes >= c.count;
  }
}

export function describeUnlock(c: UnlockCondition): string {
  switch (c.type) {
    case 'default':
      return 'Available from the start';
    case 'achievement':
      return `Earn the achievement "${ACHIEVEMENTS.find((a) => a.id === c.id)?.title ?? c.id}"`;
    case 'chapter':
      return `Complete chapter "${c.chapterId}"`;
    case 'collectibles':
      return `Find ${c.count} story fragments`;
    case 'wins':
      return `Win ${c.count} matches as ${c.role === 'ghost' ? 'the ghost' : 'a survivor'}`;
  }
}

function unlockedIds(p: PlayerProfile) {
  return [...SURVIVORS, ...GHOSTS].filter((c) => isUnlocked(p, c.unlock)).map((c) => c.id);
}

export interface ProgressionUpdate {
  profile: PlayerProfile;
  newAchievements: string[];
  newUnlocks: string[];
}

export function grantAchievement(p: PlayerProfile, id: string): ProgressionUpdate {
  if (p.achievements.includes(id) || !ACHIEVEMENTS.some((a) => a.id === id)) return { profile: p, newAchievements: [], newUnlocks: [] };
  const before = unlockedIds(p);
  const next = { ...p, achievements: [...p.achievements, id] };
  return { profile: next, newAchievements: [id], newUnlocks: unlockedIds(next).filter((x) => !before.includes(x)) };
}

/** Pure: apply a finished match to a profile. */
export function applyMatchResult(p: PlayerProfile, r: MatchResult): ProgressionUpdate {
  const before = unlockedIds(p);
  const stats = { ...p.stats };
  stats.matches += 1;
  stats.playTimeSec += Math.max(0, Math.round(r.durationSec));
  stats.stuns += r.stuns;
  stats.revives += r.revives;
  const earned = new Set<string>();
  const chapters = new Set(p.chaptersCompleted);

  if (r.role === 'survivor') {
    if (r.outcome === 'escaped') {
      stats.escapes += 1;
      stats.bestEscapeSec = stats.bestEscapeSec === null ? r.durationSec : Math.min(stats.bestEscapeSec, r.durationSec);
      chapters.add(r.chapterId);
      earned.add('last_train_out');
      if (r.retries === 0) earned.add('untouched');
      if (r.durationSec < 12 * 60) earned.add('before_dawn');
    } else if (r.outcome === 'captured') {
      stats.captures += 1;
    }
    if (r.stuns > 0) earned.add('flashbulb');
    if (r.revives > 0) earned.add('no_one_left');
    if (r.hiddenCloseCalls > 0) earned.add('holding_breath');
  } else {
    stats.ghostMatches += 1;
    if (r.outcome === 'ghost_win') {
      stats.ghostWins += 1;
      earned.add('third_call');
    }
  }

  const collectibles = Array.from(new Set([...p.collectibles, ...r.fragments]));
  if (['note_ticket', 'note_memo', 'note_photo'].every((f) => collectibles.includes(f))) earned.add('fragments');

  const newAchievements = [...earned].filter((a) => !p.achievements.includes(a));
  const profile: PlayerProfile = {
    ...p,
    stats,
    collectibles,
    chaptersCompleted: [...chapters],
    achievements: [...p.achievements, ...newAchievements],
  };
  return { profile, newAchievements, newUnlocks: unlockedIds(profile).filter((x) => !before.includes(x)) };
}
