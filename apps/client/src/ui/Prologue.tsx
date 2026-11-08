import { PROLOGUE_CALL as CALL, PROLOGUE_TAPE as TAPE, grantAchievement } from '@nishi/shared';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { speak, stopSpeech } from '../audio/speech';
import { music } from '../audio/music';
import { CassetteScene } from './CassetteScene';
import { useApp } from '../state/store';
import { Btn, TapeLines } from './common';

type Step = 'intro' | 'lab' | 'playing' | 'choice' | 'rewind' | 'call' | 'arrival';

const INTRO = [
  '1999. Project SHUNYA, a government sound archive, recorded forty thousand voices across India.',
  'On the night of 13 March its last field unit went into Nishipur Junction, a station outside Kolkata, to record something that answered back.',
  'None of the four came back. One of them was Mrinalini Sen.',
  'Your mother.',
  'Twenty-seven years later, a parcel with no stamp arrives at your lab. Inside is one cassette, labelled in her handwriting.',
];

function useTyped(text: string, speed = 28) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 1)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return [text.slice(0, n), () => setN(text.length)] as const;
}

export function Prologue() {
  const go = useApp((s) => s.go);
  const updateProfile = useApp((s) => s.updateProfile);
  const settings = useApp((s) => s.settings);
  const [step, setStep] = useState<Step>('intro');
  const [line, setLine] = useState(0);
  const [sub, setSub] = useState('');
  const [armed, setArmed] = useState(false);
  const armTimer = useRef(0);
  const timers = useRef<number[]>([]);
  const [typed, finishTyping] = useTyped(step === 'intro' ? INTRO[line] : '', 30);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  const gone = useRef(false);
  const pause = (ms: number) => new Promise<void>((r) => later(ms, r));
  /** plays the lines one after another, each subtitle staying up while its voice speaks */
  const dialogue = async (lines: readonly (readonly [string, string, 'female' | 'male'])[]) => {
    for (const [who, text, voice] of lines) {
      if (gone.current) return false;
      setSub(who ? `${who}: ${text}` : text);
      await speak(text, { enabled: settings.voiceLines, voice, rate: who ? 1 : 0.88, pitch: who === 'KABIR' ? 0.95 : 1.05 });
      await pause(450);
    }
    return !gone.current;
  };
  useEffect(() => {
    music.setMood('silent');
    return () => {
      gone.current = true;
      timers.current.forEach(clearTimeout);
      stopSpeech();
      audio.tapeStop();
    };
  }, []);

  const finish = (choice: string) => {
    updateProfile((p) => {
      const withStory = { ...p, story: { prologueDone: true, choices: { ...p.story.choices, prologue: choice } } };
      return grantAchievement(withStory, 'reel_7731').profile;
    });
    useApp.getState().toast({ title: 'Achievement: Reel 7731', text: 'You completed the prologue.', tone: 'unlock' });
    setStep('arrival');
    later(5200, () => go('loading'));
  };

  // skipping is permanent for this profile, so it takes a second press
  const requestSkip = () => {
    if (step === 'arrival') return;
    if (!armed) {
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    skip();
  };

  const skip = () => {
    gone.current = true;
    stopSpeech();
    finish(useApp.getState().profile.story.choices.prologue ?? 'skipped');
  };

  const playTape = () => {
    audio.unlock();
    setStep('playing');
    audio.tapeStart();
    void (async () => {
      await pause(600);
      audio.sfx('tape');
      const ok = await dialogue(TAPE);
      if (!ok) return;
      // the recording ends in her scream, then the tape runs out
      setSub('');
      audio.scream('woman', undefined, 0.42, true);
      later(2600, () => {
        audio.tapeStop();
        setStep('choice');
      });
    })();
  };

  const rewind = () => {
    setStep('rewind');
    audio.tapeStart(true);
    audio.whisper();
    later(5600, () => audio.tapeStop());
    later(500, () => setSub('(slowed to quarter speed, beneath the hiss) "...she was never alone in the booth. I am still in the booth..."'));
    later(1500, () => void speak('I am still in the booth.', { enabled: settings.voiceLines, voice: 'male', rate: 0.5, pitch: 0.2 }));
    later(7000, () => finish('rewind'));
  };

  const callKabir = () => {
    setStep('call');
    audio.radioBurst();
    void (async () => {
      await pause(700);
      if (await dialogue(CALL)) later(800, () => finish('call'));
    })();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') requestSkip();
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        if (step === 'intro') next();
        else if (step === 'lab') playTape();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const next = () => {
    audio.unlock();
    if (typed.length < INTRO[line].length) return finishTyping();
    if (line < INTRO.length - 1) setLine(line + 1);
    else setStep('lab');
  };

  return (
    <div className="prologue" onClick={() => step === 'intro' && next()}>
      <TapeLines />
      {step !== 'arrival' && (
        <button className={`skip${armed ? ' armed' : ''}`} onClick={(e) => { e.stopPropagation(); requestSkip(); }}>
          {armed ? 'Skip the story? Press again (Esc)' : 'Skip prologue (Esc)'}
        </button>
      )}
      {step === 'intro' && (
        <div className="prologue-text">
          <p>{typed}<span className="caret">▍</span></p>
          <small>{line + 1} / {INTRO.length} · Click or press E to continue</small>
        </div>
      )}
      {(step === 'lab' || step === 'playing' || step === 'choice' || step === 'rewind' || step === 'call') && (
        <div className="lab">
          <CassetteScene state={step} />
          <div className="lab-caption">Aditi Sen's forensic audio lab · Salt Lake, Kolkata · 01:52 AM</div>
          {step === 'lab' && (
            <div className="lab-actions">
              <p>An unmarked parcel. One cassette. Your mother's handwriting on the label.</p>
              <Btn primary onClick={playTape}>▶ Play the cassette (E)</Btn>
            </div>
          )}
          {step === 'choice' && (
            <div className="lab-actions">
              <p>The tape runs out into hiss. Something is underneath it.</p>
              <div className="row">
                <Btn onClick={rewind}>◀◀ Rewind and slow it down</Btn>
                <Btn onClick={callKabir}>☎ Call Kabir</Btn>
              </div>
            </div>
          )}
          {settings.subtitles && sub && <div className="subtitle prologue-sub">{sub}</div>}
        </div>
      )}
      {step === 'arrival' && (
        <div className="arrival">
          <div className="arrival-time">3:13 AM</div>
          <div className="arrival-place">Nishipur Junction</div>
          <div className="arrival-bn">নিশিপুর জংশন</div>
        </div>
      )}
    </div>
  );
}
