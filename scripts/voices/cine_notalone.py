"""
Temporary Bengali voice takes for the cutscene preview "You're Not Alone" (apps/client/src/cine).

Same engine and the same cloned voices as the game's lines (generate.py): Aditi and Ma speak from
their own reference takes, now in Bengali. Ma is heard down a phone line. The child's giggle is
designed from attributes (a girl of seven) and placed far off, in the open.

There is no Bengali transcriber here, so takes are only checked for being speech at all (voiced
frames in the character's pitch, a plausible length, syllable-rate loudness changes) and never
listened to. They are placeholders until a Bengali speaker approves or replaces them.

  python scripts/voices/cine_notalone.py
"""
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate import CAST, REFS, SR_OUT, band, finish, room, treat  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/src/cine/notalone/voice"

# id, who (reference take), Bengali text, speed, how it is heard
LINES = [
    ("aditi_where", "aditi", "মা...? মা! তুমি কোথায়?", 1.0, "near"),
    ("ma_hear", "mother", "অদিতি... শুনতে পাচ্ছিস?", 0.8, "phone"),
    ("aditi_years", "aditi", "মা! আমি তোমাকে খুঁজছি এত বছর!", 0.9, "near"),
    ("ma_brought", "mother_whisper", "শোন... স্টেশন থেকে কি কিছু নিয়ে এসেছিস?", 0.84, "phone"),
    ("aditi_yes", "aditi_whisper", "হ্যাঁ...", 0.8, "near"),
    ("ma_find", "mother_whisper", "তাহলে এখন ওরা তোকে খুঁজে পাবে।", 0.78, "phone"),
    ("aditi_maa", "aditi_whisper", "মা...?", 0.75, "near"),
]
GIGGLE = ("child_giggle", "female, child, very high pitch", "Hee hee hee.")
PITCH = {"aditi": (165, 320), "mother": (140, 270), "child": (250, 600)}
TRIES = 4
# lines said in shock: raised this many semitones, a sharp gasp before, a tremor through the voice
SHOCK = {"aditi_where": 2.5}


def shocked(x, sr, steps):
    """her mother's voice after 27 years: a caught breath, then the words high and shaking"""
    import librosa

    y = librosa.effects.pitch_shift(np.asarray(x, np.float32), sr=sr, n_steps=steps)
    t = np.arange(len(y)) / sr
    y = y * (1 + 0.12 * np.sin(2 * np.pi * 6.5 * t)).astype(np.float32)
    n = int(sr * 0.34)
    env = np.minimum(1, np.arange(n) / (sr * 0.05)) * np.exp(-np.linspace(0, 4.5, n))
    gasp = band(np.random.default_rng(11).standard_normal(n).astype(np.float32), sr, 900, 5200) * env.astype(np.float32)
    gasp *= 0.3 * np.abs(y).max() / (np.abs(gasp).max() + 1e-6)
    return np.concatenate([gasp, np.zeros(int(sr * 0.14), np.float32), y])


def check(x, sr, chars, role, whisper):
    """is this speech at all? (voiced in the right register, a plausible length, syllables)"""
    import librosa

    y = librosa.resample(np.asarray(x, np.float32), orig_sr=sr, target_sr=16000)
    secs = len(y) / 16000
    # a syllable-rate (3-8 Hz) wobble in loudness: speech has it, a hiss or a drone does not
    env = librosa.feature.rms(y=y, frame_length=400, hop_length=160)[0]
    spec = np.abs(np.fft.rfft(env - env.mean()))
    freqs = np.fft.rfftfreq(len(env), 0.01)
    syl = float(spec[(freqs > 2.5) & (freqs < 8)].sum() / (spec[freqs > 0.5].sum() + 1e-9))
    score = syl
    f0 = 0.0
    voiced_ratio = 0.0
    if not whisper:
        p, v, _ = librosa.pyin(y, fmin=70, fmax=700, sr=16000, frame_length=1024)
        voiced = p[v & np.isfinite(p)]
        voiced_ratio = len(voiced) / max(1, len(p))
        f0 = float(np.median(voiced)) if len(voiced) > 8 else 0.0
        lo, hi = PITCH[role]
        score += min(voiced_ratio, 0.5) + (0.3 if lo <= f0 <= hi else -0.5)
    # Bengali speech runs at roughly 9-20 characters a second at these speeds
    rate = chars / max(secs, 0.1)
    score -= 0 if 3 <= rate <= 26 else 0.5
    return score, {"secs": round(secs, 2), "syl": round(syl, 2), "voiced": round(voiced_ratio, 2), "f0": round(f0), "rate": round(rate, 1)}


def best(make, text, chars, role, whisper, seed, label):
    top = (-9, None, None)
    for k in range(TRIES):
        torch.manual_seed(seed + 1000 * k)
        x = np.asarray(make(text if k % 2 == 0 else text.replace("...", ",")), np.float32).reshape(-1)
        s, info = check(x, 24000, chars, role, whisper)
        print(f"   {label} try {k + 1}: score {s:.2f} {info}", flush=True)
        if s > top[0]:
            top = (s, x, info)
    return top


def far(x, sr):
    """a child's giggle from an upstairs window across the forecourt: thin, distant, in the open"""
    y = band(x, sr, 500, 3800) * 0.7
    return room(y, sr, 1.4, 0.45, bright=2500)


def main():
    from omnivoice import OmniVoice

    model = OmniVoice.from_pretrained(os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"), device_map="cpu", dtype=torch.float32)
    sr = model.sampling_rate
    OUT.mkdir(parents=True, exist_ok=True)
    prompts = {}
    report = {}
    only = set(sys.argv[1:])
    for i, (key, who, text, speed, where) in enumerate(LINES):
        if only and key not in only:
            continue
        if who not in prompts:
            prompts[who] = model.create_voice_clone_prompt(ref_audio=str(REFS / f"{who}.wav"), ref_text=CAST[who][1])
        chars = len(text.replace(" ", "").replace(".", "").replace("?", "").replace("!", "").replace("।", "").replace(",", ""))
        role = "mother" if who.startswith("mother") else "aditi"
        make = lambda t, w=who, sp=speed: model.generate(text=t, language="Bengali", voice_clone_prompt=prompts[w], speed=sp, num_step=32)[0]
        s, x, info = best(make, text, chars, role, "whisper" in who, 21 + i, key)
        if key in SHOCK:
            x = shocked(x, sr, SHOCK[key])
            _, after = check(x, sr, chars, role, False)
            print(f"   {key} after shock: {after}", flush=True)
            info["shocked_f0"] = after["f0"]
        y = treat(x, sr, "phone") if where == "phone" else room(x, sr, 0.35, 0.06)[: len(x) + sr // 3]
        sf.write(OUT / f"{key}.mp3", finish(y, sr), SR_OUT, format="MP3")
        report[key] = {"text": text, "score": round(s, 2), **info}
    if only and GIGGLE[0] not in only:
        for k, v in report.items():
            print(f"  {k}: {v}")
        return
    key, instruct, text = GIGGLE
    s, x, info = best(lambda t: model.generate(text=t, language="English", instruct=instruct, num_step=32)[0], text, 9, "child", False, 91, key)
    sf.write(OUT / f"{key}.mp3", finish(far(x, sr), sr), SR_OUT, format="MP3")
    report[key] = {"text": text, "score": round(s, 2), **info}
    for k, v in report.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
