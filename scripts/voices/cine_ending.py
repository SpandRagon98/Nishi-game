"""
Aditi's scream and her black-screen narration for the cutscene preview "You're Not Alone".

Same engine and the same cloned voice as the rest of the game (generate.py). Every narration take is
transcribed with Whisper and must say its line in her register (never listened to). The scream has
no words to check: a take counts as a scream when it is long, loud, held, voiced and pitched far
above her speaking voice (a woman's scream sits around 400-1000 Hz, not a man's 150-300).

  python scripts/voices/cine_ending.py
"""
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import CAST, REFS, SR_OUT, Judge, best_take, finish, room  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/src/cine/notalone/voice"

# afterwards, still shaken: slow at first, then faster
NARRATION = [
    ("nar_ran", "I ran from there.", 0.82),
    ("nar_fast", "I ran as fast as I could...", 0.9),
    ("nar_kabir", "Until I found Kabir waiting beside the car.", 0.97),
    ("nar_back", "I didn't look back.", 0.8),
]
SCREAMS = [
    ("aditi", "Aaaaaaaaaaah!"),
    ("aditi", "Aaaaaaaaaaaaaaah!!"),
    ("design", "Aaaaaaaaaaaaah!"),
    ("aditi", "Aaaaah! Aaaaaaaaaah!"),
    ("design", "Aaaaaaaaaaaaaaaaah!!"),
    ("aditi", "Aaaaaaaaaaaaaaaah!"),
]
DESIGN = "female, young adult, very high pitch, indian accent"


def scream_score(x, sr):
    import librosa

    y = librosa.resample(np.asarray(x, np.float32), orig_sr=sr, target_sr=16000)
    a = np.abs(y)
    on = np.where(a > 0.05 * a.max())[0]
    y = y[on[0]: on[-1]] if len(on) else y
    secs = len(y) / 16000
    p, v, _ = librosa.pyin(y, fmin=150, fmax=1400, sr=16000, frame_length=1024)
    voiced = p[v & np.isfinite(p)]
    ratio = len(voiced) / max(1, len(p))
    f0 = float(np.median(voiced)) if len(voiced) > 8 else 0.0
    # held: loudness stays up for most of it, not one syllable and silence
    env = librosa.feature.rms(y=y, frame_length=400, hop_length=160)[0]
    held = float((env > 0.35 * env.max()).mean())
    score = min(ratio, 0.8) + held + (0.8 if 380 <= f0 <= 1100 else 0.3 if 300 <= f0 < 380 else -1) + (0.3 if 1.0 <= secs <= 3.5 else -0.5)
    return score, {"secs": round(secs, 2), "f0": round(f0), "voiced": round(ratio, 2), "held": round(held, 2)}


def main():
    from omnivoice import OmniVoice

    model = OmniVoice.from_pretrained(os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"), device_map="cpu", dtype=torch.float32)
    sr = model.sampling_rate
    OUT.mkdir(parents=True, exist_ok=True)
    clone = model.create_voice_clone_prompt(ref_audio=str(REFS / "aditi.wav"), ref_text=CAST["aditi"][1])

    # the scream
    top = (-9, None, None)
    for k, (how, text) in enumerate(SCREAMS):
        torch.manual_seed(301 + 1000 * k)
        if how == "aditi":
            x = model.generate(text=text, language="English", voice_clone_prompt=clone, speed=0.8, num_step=32)[0]
        else:
            x = model.generate(text=text, language="English", instruct=DESIGN, speed=0.8, num_step=32)[0]
        x = np.asarray(x, np.float32).reshape(-1)
        s, info = scream_score(x, sr)
        print(f"   scream try {k + 1} ({how}): score {s:.2f} {info}", flush=True)
        if s > top[0]:
            top = (s, x, info)
    s, x, info = top
    # the engine screams like someone talking loudly (~310 Hz); a woman's scream sits higher
    import librosa
    x = librosa.effects.pitch_shift(x, sr=sr, n_steps=4.5)
    s, info = scream_score(x, sr)
    # out in the open: a little of the night's echo off the station front
    y = room(x, sr, 1.2, 0.18, bright=7000)
    sf.write(OUT / "aditi_scream.mp3", finish(y, sr), SR_OUT, format="MP3")
    print(f"  aditi_scream: score {s:.2f} {info}", flush=True)

    # the narration
    judge = Judge()
    for i, (key, text, speed) in enumerate(NARRATION):
        make = lambda t, sp=speed: model.generate(text=t, language="English", voice_clone_prompt=clone, speed=sp, num_step=32)[0]
        s, x, info = best_take(make, judge, text, "aditi", False, 401 + i, key)
        # close to the microphone, a small dry room: remembered, told afterwards
        y = room(x, sr, 0.3, 0.05)[: len(x) + sr // 4]
        sf.write(OUT / f"{key}.mp3", finish(y, sr), SR_OUT, format="MP3")
        print(f"  {key}: score {s:.2f} {info}", flush=True)


if __name__ == "__main__":
    main()
