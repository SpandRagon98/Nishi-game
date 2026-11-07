import { grantAchievement } from '@nishi/shared';
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import { speak, stopSpeech } from '../audio/speech';
import { music } from '../audio/music';
import { CassetteScene } from './CassetteScene';
import { useApp } from '../state/store';
import { Btn, TapeLines } from './common';

type Step = 'intro' | 'lab' | 'playing' | 'choice' | 'rewind' | 'call' | 'arrival';

const INTRO = [
  '1999.',
  'Project SHUNYA — a government oral-history archive — recorded forty thousand voices across India.',
  'In March, the project was terminated without explanation.',
  'Eleven archivists were never seen again.',
  '2026. Kolkata.',
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
  const timers = useRef<number[]>([]);
  const [typed, finishTyping] = useTyped(step === 'intro' ? INTRO[line] : '', 30);

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
  useEffect(() => {
    music.setMood('silent');
    return () => {
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

  const skip = () => {
    stopSpeech();
    finish(useApp.getState().profile.story.choices.prologue ?? 'skipped');
  };

  const playTape = () => {
    audio.unlock();
    setStep('playing');
    audio.tapeStart();
    const lines = [
      [600, "Aditi... if you're hearing this, I'm still at the station."],
      [5200, "Platform Zero. It isn't on any map. They built it for the recordings."],
      [10400, "It copies voices. It copied mine. Don't answer it when it calls the third time."],
    ] as const;
    for (const [at, text] of lines) {
      later(at, () => {
        setSub(text);
        audio.sfx('tape');
        speak(text, { enabled: settings.voiceLines, voice: 'female', rate: 0.88, pitch: 1.05 });
      });
    }
    // the recording ends in her scream, then the tape runs out
    later(14600, () => {
      setSub('');
      audio.scream('woman', undefined, 0.42, true);
    });
    later(17200, () => {
      audio.tapeStop();
      setStep('choice');
    });
  };

  const rewind = () => {
    setStep('rewind');
    audio.tapeStart(true);
    audio.whisper();
    later(5600, () => audio.tapeStop());
    later(500, () => setSub('(slowed to quarter speed, beneath the hiss) "...she was never alone in the booth. I am still in the booth..."'));
    later(1500, () => speak('I am still in the booth.', { enabled: settings.voiceLines, voice: 'male', rate: 0.5, pitch: 0.2 }));
    later(7000, () => finish('rewind'));
  };

  const callKabir = () => {
    setStep('call');
    audio.radioBurst();
    const lines = [
      [300, 'KABIR: Aditi? It\'s two in the morning.'],
      [3600, 'ADITI: It\'s her, Kabir. Nishipur Junction. I\'m going tonight.'],
      [7600, 'KABIR: Then I\'m driving. And Dev from the archive comes on the radio. No arguments.'],
    ] as const;
    for (const [at, text] of lines) later(at, () => setSub(text));
    later(11500, () => finish('call'));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') skip();
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
      <button className="skip" onClick={(e) => { e.stopPropagation(); skip(); }}>Skip prologue (Esc)</button>
      {step === 'intro' && (
        <div className="prologue-text">
          <p>{typed}<span className="caret">▍</span></p>
          <small>Click or press E to continue</small>
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
