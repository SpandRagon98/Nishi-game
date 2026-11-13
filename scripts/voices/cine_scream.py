"""
Aditi's last scream for the cutscene preview "You're Not Alone": a real, horrified scream, not a loud "aah".

The engine's screams come out like someone shouting a vowel (~300 Hz, clean). What makes a scream read
as terror is (measured in the literature on human screams) a high pitch, and "roughness": fast loudness
flutter at 30-150 Hz from the vocal folds straining, plus harsh upper harmonics and breath noise. So the
best of several cloned takes is raised, layered with detuned copies (a raw, tearing voice), given that
flutter and strain, and breaks at the end. Judged by pitch, how held it is and its roughness, never by
listening.

  python scripts/voices/cine_scream.py
"""
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cine_ending import DESIGN, scream_score  # noqa: E402
from generate import CAST, REFS, SR_OUT, band, finish, room  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/src/cine/notalone/voice"

TAKES = [
    ("design", "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!!"),
    ("aditi", "AAAAAAAAAAAAAAAAAAH!!!"),
    ("design", "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!!!"),
    ("design", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH!!!"),
    ("aditi", "Aaaaaaaaaaaaaaaaaaaaaaah!"),
    ("design", "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!!"),
    ("design", "Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaah!"),
    ("aditi", "AAAAAAAAAAAAAAAAAAAAAAAAH!!!"),
]
TARGET_F0 = 640  # a woman's scream; each take is raised towards it (2-6 semitones, no chipmunk)
MIN_SECS = 1.6  # held, not a yelp


def roughness(x, sr):
    """share of the loudness envelope's movement that is fast flutter (30-150 Hz): high in real screams"""
    import librosa

    y = librosa.resample(np.asarray(x, np.float32), orig_sr=sr, target_sr=16000)
    env = np.abs(y)
    # envelope at 1 kHz, then its modulation spectrum
    env = env[: len(env) // 16 * 16].reshape(-1, 16).mean(1)
    spec = np.abs(np.fft.rfft(env - env.mean()))
    f = np.fft.rfftfreq(len(env), 1 / 1000)
    return float(spec[(f > 30) & (f < 150)].sum() / (spec[(f > 1) & (f < 150)].sum() + 1e-9))


def horrify(x, sr, steps):
    import librosa

    x = np.asarray(x, np.float32)
    a = np.abs(x)
    on = np.where(a > 0.04 * a.max())[0]
    x = x[on[0]: on[-1]] / (a.max() + 1e-6)
    n = len(x)
    t = np.arange(n) / sr
    rng = np.random.default_rng(13)

    # the voice raised, and two detuned copies a few ms behind it: a ragged, tearing sound
    y = librosa.effects.pitch_shift(x, sr=sr, n_steps=steps)
    for cents, delay, gain in [(-22, 0.009, 0.55), (27, 0.017, 0.45)]:
        z = librosa.effects.pitch_shift(x, sr=sr, n_steps=steps + cents / 100)
        z = np.concatenate([np.zeros(int(sr * delay), np.float32), z])[:n]
        y = y + gain * z

    # roughness: the folds straining, a fast irregular flutter (its rate wandering between 45 and 85 Hz)
    drift = np.interp(t, np.linspace(0, t[-1], 24), rng.uniform(45, 85, 24))
    phase = 2 * np.pi * np.cumsum(drift) / sr
    depth = np.clip(0.25 + 0.3 * (t / t[-1]), 0, 0.6)
    y = y * (1 + depth * np.sin(phase)).astype(np.float32)

    # strain: harsh upper harmonics driven hard, then the whole voice pushed into the red
    hi = band(y, sr, 1300, 6500)
    y = y + 0.7 * np.tanh(hi * 5)
    y = np.tanh(y * 2.2)

    # air forced through a raw throat, following the voice
    env = np.convolve(np.abs(y), np.ones(int(sr * 0.02)) / int(sr * 0.02), mode="same")
    air = band(rng.standard_normal(n).astype(np.float32), sr, 2200, 9500)
    y = y + 0.35 * air * env / (env.max() + 1e-6)

    # a hard onset, and the voice cracking and giving out at the end
    att = np.minimum(1, t / 0.03)
    tail = t[-1] - t
    crack = np.where(tail < 0.45, 1 - 0.55 * (1 - tail / 0.45) * (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)), 1)
    return (y * att * crack).astype(np.float32)


def main():
    from omnivoice import OmniVoice

    model = OmniVoice.from_pretrained(os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"), device_map="cpu", dtype=torch.float32)
    sr = model.sampling_rate
    clone = model.create_voice_clone_prompt(ref_audio=str(REFS / "aditi.wav"), ref_text=CAST["aditi"][1])
    top = (-9, None, None)
    # SCREAM_TAKE=n regenerates just that take (same seed); SCREAM_STRETCH=1.5 holds it half as long again
    only = int(os.environ.get("SCREAM_TAKE", "0"))
    stretch = float(os.environ.get("SCREAM_STRETCH", "1"))
    for k, (how, text) in enumerate(TAKES):
        if only and k + 1 != only:
            continue
        torch.manual_seed(501 + 1000 * k)
        kw = {"voice_clone_prompt": clone} if how == "aditi" else {"instruct": DESIGN}
        x = np.asarray(model.generate(text=text, language="English", speed=0.6, num_step=32, **kw)[0], np.float32).reshape(-1)
        if stretch != 1:
            import librosa

            x = librosa.effects.time_stretch(x, rate=1 / stretch)
        s, info = scream_score(x, sr)
        s += 0.8 if info["secs"] >= MIN_SECS else -1.0
        print(f"   take {k + 1} ({how}): score {s:.2f} {info}", flush=True)
        if s > top[0]:
            top = (s, x, info)
    _, x, before = top
    steps = float(np.clip(12 * np.log2(TARGET_F0 / max(before["f0"], 1)), 2, 6))
    y = horrify(x, sr, steps)
    info_steps = round(steps, 1)
    s, info = scream_score(y, sr)
    info["rough_before"] = round(roughness(x, sr), 3)
    info["rough"] = round(roughness(y, sr), 3)
    info["steps"] = info_steps
    print(f"   chosen take: {before}", flush=True)
    # out in the open: a little of the night's echo off the station front
    out = room(y, sr, 1.3, 0.2, bright=7000)
    sf.write(OUT / "aditi_scream.mp3", finish(out, sr), SR_OUT, format="MP3")
    print(f"  aditi_scream: score {s:.2f} {info}", flush=True)


if __name__ == "__main__":
    main()
