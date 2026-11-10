import { ADITI_THOUGHTS, OBJECTIVES, PLATFORM_ZERO, applyMatchResult, type MatchResult, type SimEvent } from '@nishi/shared';
import { audio } from '../audio/engine';
import { speak } from '../audio/speech';
import { app, useApp } from '../state/store';
import { playCutscene } from './cutscene';
import { addApparition, fx, now } from './fx';
import type { GameSession } from './session';

export function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Aditi talking to herself: a quiet subtitle and her voice. */
export function mutter(text: string) {
  const s = app();
  s.subtitle({ speaker: 'ADITI', text, kind: 'thought' }, 1500 + text.length * 55);
  void speak(text, { enabled: s.settings.voiceLines, voice: 'female', rate: 0.95, pitch: 1.05 });
}

/** Routes authoritative simulation events into UI, audio and visual effects. */
export function handleSimEvent(e: SimEvent, session: GameSession) {
  const s = app();
  const voiceOn = s.settings.voiceLines;
  const snap = session.snapshot();
  const me = snap?.survivors.find((x) => x.id === session.localId);
  // story cards are for the survivors' side of the tale
  const story = session.role !== 'ghost';

  switch (e.type) {
    case 'message':
      s.toast({ title: e.text, tone: e.tone ?? 'info' }, 2600);
      break;
    case 'radio': {
      // Aditi's Echo Sense exposes the Caller's forged transmissions
      const exposed = !!e.fake && !!me && snap!.time < me.abilityActiveUntil && me.characterId === 'aditi';
      audio.radioBurst(e.fake);
      s.subtitle({ speaker: e.speaker, text: exposed ? `${e.text}  [FORGED SIGNAL]` : e.text, kind: 'radio', fake: exposed });
      if (!e.speaker.startsWith('RADIO')) speak(e.text, { enabled: voiceOn, voice: 'male', rate: 1.04, pitch: e.fake ? 0.7 : 0.95 });
      break;
    }
    case 'announcement':
      audio.chime();
      s.subtitle({ speaker: 'PUBLIC ADDRESS', text: e.text, kind: 'announcement' });
      setTimeout(() => speak(e.text, { enabled: voiceOn, voice: 'female', rate: e.garbled ? 0.78 : 0.9, pitch: e.garbled ? 0.5 : 0.9 }), 1900);
      break;
    case 'whisper':
      audio.whisper(e.pos);
      s.subtitle({ speaker: '', text: `"${e.text}"`, kind: 'whisper' }, 3200);
      break;
    case 'phone':
      s.subtitle({ speaker: 'TELEPHONE', text: e.text, kind: 'phone' });
      {
        // only the quoted words are a voice on the line; the rest is description
        const quoted = e.text.match(/"([^"]+)"/)?.[1];
        if (quoted) void speak(quoted, { enabled: voiceOn, voice: 'female', rate: 0.85, pitch: 0.8 });
      }
      if (story) s.beat('phone');
      break;
    case 'pickup':
      s.toast({ title: e.label, text: e.detail, tone: 'good' }, e.item.startsWith('reel') ? 9000 : 5000);
      if (story && e.item.startsWith('reel')) {
        const heard = s.storyLog.filter((b) => b.startsWith('reel_')).length;
        if (heard < 3) s.beat(`reel_${heard + 1}` as 'reel_1');
      }
      break;
    case 'doc':
      releasePointer();
      s.showDoc(e.title, e.body);
      break;
    case 'puzzle':
      releasePointer();
      s.setOverlay(e.puzzle);
      break;
    case 'sfx':
      audio.sfx(e.sound, e.pos);
      if (e.sound === 'door_slam') fx.shake = Math.max(fx.shake, 0.25);
      break;
    case 'flicker':
      for (const id of e.lights) fx.flicker.set(id, now() + e.duration);
      break;
    case 'power_on':
      fx.powerOnAt = now();
      s.toast({ title: 'Mains power restored', text: 'The announcement system is waking up.', tone: 'good' });
      break;
    case 'apparition':
      addApparition(e.pos, e.yaw, e.duration, 'apparition');
      audio.whisper(e.pos);
      fx.shake = Math.max(fx.shake, 0.35);
      break;
    case 'shadow':
      addApparition(e.pos, e.yaw, e.duration, 'shadow');
      break;
    case 'hunt':
      if (e.phase === 'warning') fx.huntPhase = 'warning';
      else if (e.phase === 'start') {
        fx.huntPhase = 'hunt';
        if (story) s.beat('first_hunt');
        // the station goes dead quiet, then one distant shriek: the only warning
        audio.silence(1.1);
        setTimeout(() => audio.shriek(session.snapshot()?.ghost.pos, 0.22), 900);
        fx.shake = Math.max(fx.shake, 0.4);
      } else fx.huntPhase = 'none';
      break;
    case 'echo_sense':
      fx.echoSense = { points: e.points, until: now() + e.duration };
      audio.sfx('tape');
      break;
    case 'player': {
      const self = e.playerId === session.localId;
      const text = {
        downed: self ? 'You are down. Hold on — a teammate can revive you.' : `${e.name} is down!`,
        captured: self ? 'The Caller has taken you.' : `${e.name} was taken.`,
        revived: self ? 'You are back on your feet.' : `${e.name} was revived.`,
        escaped: self ? 'You made it out.' : `${e.name} escaped.`,
        stunned_ghost: self ? 'Your beam burned it. RUN.' : `${e.name} stunned the Caller!`,
      }[e.what];
      s.toast({ title: text, tone: e.what === 'downed' || e.what === 'captured' ? 'warn' : 'good' }, 3500);
      if (e.what === 'downed' || e.what === 'captured') {
        fx.shake = Math.max(fx.shake, self ? 0.8 : 0.2);
        const victim = session.snapshot()?.survivors.find((x) => x.id === e.playerId);
        audio.scream(victim?.characterId === 'kabir' ? 'man' : 'woman', self ? undefined : victim?.pos, self ? 0.32 : 0.22);
      }
      break;
    }
    case 'objective': {
      const o = OBJECTIVES.find((x) => x.id === e.id)!;
      const next = OBJECTIVES.find((x) => x.id !== e.id && !session.snapshot()?.world.objectives[x.id]);
      s.toast({ title: `✓ ${o.title}`, text: next && !story ? `Next: ${next.title}` : undefined, tone: 'good' }, 3500);
      if (!story) break;
      // a short cutscene, Aditi's own words over it, then the story card
      const cut = snap && me ? playCutscene(e.id, me, PLATFORM_ZERO, snap) : 0;
      const thought = ADITI_THOUGHTS.after[e.id];
      if (thought && me?.characterId === 'aditi') setTimeout(() => mutter(thought), cut ? 1300 : 600);
      setTimeout(() => app().beat(e.id), cut * 1000);
      break;
    }
    case 'checkpoint':
      s.toast({ title: 'Checkpoint saved', tone: 'info' }, 1800);
      break;
    case 'chat':
      s.chat(e.from, e.text, e.fake);
      audio.radioBurst();
      break;
    case 'ability':
      if (!e.ok && e.reason) s.toast({ title: e.reason, tone: 'warn' }, 1600);
      break;
    case 'match_end':
      finishMatch(e.result, session);
      break;
  }
}

function finishMatch(summary: Extract<SimEvent, { type: 'match_end' }>['result'], session: GameSession) {
  const s = app();
  releasePointer();
  const mine = summary.players.find((p) => p.id === session.localId);
  const role = session.role;
  const won = role === 'ghost' ? summary.winner === 'ghost' : mine?.status === 'escaped';
  const result: MatchResult = {
    chapterId: 'platform-zero',
    mode: session.kind === 'solo' ? 'solo' : session.snapshot()?.mode ?? 'coop',
    role,
    characterId: mine?.characterId ?? 'aditi',
    outcome: role === 'ghost' ? (won ? 'ghost_win' : 'ghost_loss') : won ? 'escaped' : 'captured',
    durationSec: summary.duration,
    fragments: summary.fragments,
    stuns: mine?.stuns ?? 0,
    revives: mine?.revives ?? 0,
    hiddenCloseCalls: mine?.hiddenCloseCalls ?? 0,
    retries: summary.checkpointsUsed,
  };
  const progression = applyMatchResult(s.profile, result);
  s.updateProfile(() => progression.profile);
  // a moment for the capture / escape to land before the screen appears
  setTimeout(() => useApp.setState({ end: { summary, progression, won }, overlay: 'end' }), won ? 1200 : 2200);
}
