import { describe, expect, it } from 'vitest';
import {
  GHOST_ABILITIES, GHOST_HUNT_GRACE, SURVIVORS, applyMatchResult, canUseGhostAbility, createProfile, freshReadyAt,
  isUnlocked, sanitizeProfile, spendGhostAbility, type MatchResult,
} from '../src';

const result = (over: Partial<MatchResult> = {}): MatchResult => ({
  chapterId: 'platform-zero', mode: 'solo', role: 'survivor', characterId: 'aditi', outcome: 'escaped',
  durationSec: 900, fragments: [], stuns: 0, revives: 0, hiddenCloseCalls: 0, retries: 0, ...over,
});

describe('progression', () => {
  it('escaping completes the chapter and grants achievements', () => {
    const p = createProfile('x', 'Tester');
    const { profile, newAchievements } = applyMatchResult(p, result({ durationSec: 600 }));
    expect(profile.chaptersCompleted).toContain('platform-zero');
    expect(newAchievements).toEqual(expect.arrayContaining(['last_train_out', 'untouched', 'before_dawn']));
    expect(profile.stats.bestEscapeSec).toBe(600);
  });

  it('retries forfeit Untouched; captures count', () => {
    const p = createProfile('x', 'T');
    expect(applyMatchResult(p, result({ retries: 2 })).newAchievements).not.toContain('untouched');
    expect(applyMatchResult(p, result({ outcome: 'captured' })).profile.stats.captures).toBe(1);
  });

  it('finding all fragments unlocks Meera Iyer (collectibles condition)', () => {
    const meera = SURVIVORS.find((s) => s.id === 'meera')!;
    let p = createProfile('x', 'T');
    expect(isUnlocked(p, meera.unlock)).toBe(false);
    const up = applyMatchResult(p, result({ outcome: 'captured', fragments: ['note_ticket', 'note_memo', 'note_photo'] }));
    p = up.profile;
    expect(isUnlocked(p, meera.unlock)).toBe(true);
    expect(up.newUnlocks).toContain('meera');
    expect(up.newAchievements).toContain('fragments');
  });

  it('ghost wins are tracked separately', () => {
    const up = applyMatchResult(createProfile('x', 'T'), result({ role: 'ghost', outcome: 'ghost_win', characterId: 'caller' }));
    expect(up.profile.stats.ghostWins).toBe(1);
    expect(up.newAchievements).toContain('third_call');
  });

  it('sanitizes corrupted saves', () => {
    const p = sanitizeProfile({ name: '   ', stats: { matches: -5, escapes: 'lots' }, achievements: [1, 'flashbulb'], selectedSurvivor: 'meera' }, 'id1');
    expect(p.name).toBe('Guest');
    expect(p.stats.matches).toBe(0);
    expect(p.achievements).toEqual(['flashbulb']);
    expect(p.selectedSurvivor).toBe('aditi'); // not playable yet
    expect(sanitizeProfile('garbage', 'id2').id).toBe('id2');
  });
});

describe('ghost ability rules', () => {
  const state = () => ({ energy: 100, readyAt: freshReadyAt(), stunUntil: 0, huntUntil: 0, warnUntil: 0 });

  it('costs energy and starts a cooldown', () => {
    const g = state();
    expect(canUseGhostAbility(g, 'blackout', 100).ok).toBe(true);
    spendGhostAbility(g, 'blackout', 100);
    expect(g.energy).toBe(100 - GHOST_ABILITIES.blackout.cost);
    expect(canUseGhostAbility(g, 'blackout', 101)).toEqual({ ok: false, reason: 'Cooling down' });
    expect(canUseGhostAbility(g, 'blackout', 100 + GHOST_ABILITIES.blackout.cooldown).ok).toBe(true);
  });

  it('requires enough energy and blocks while stunned', () => {
    const g = { ...state(), energy: 10 };
    expect(canUseGhostAbility(g, 'apparition', 100)).toEqual({ ok: false, reason: 'Not enough energy' });
    expect(canUseGhostAbility({ ...state(), stunUntil: 200 }, 'echo', 100)).toEqual({ ok: false, reason: 'Stunned' });
  });

  it('hunting is locked during the opening grace period', () => {
    expect(canUseGhostAbility(state(), 'hunt', GHOST_HUNT_GRACE - 1).ok).toBe(false);
    expect(canUseGhostAbility(state(), 'hunt', GHOST_HUNT_GRACE + 1).ok).toBe(true);
  });
});
