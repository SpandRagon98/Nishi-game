"""
Records the game's voice lines locally with OmniVoice (k2-fsa/OmniVoice, the default engine of
VoiceStudio, https://github.com/debpalash/voicestudio), on the CPU, without playing anything aloud.

  1. each character's voice is designed from attributes (gender, age, pitch, accent, whisper) and a
     reference take is recorded in the mood they are in;
  2. every line is then cloned from that take, so a character keeps one voice through the game, and
     the take's delivery (fear, tenderness, urgency) carries into the line;
  3. each line is treated for where it is heard (radio, phone, cassette, station speakers, the Caller)
     and saved as apps/client/src/assets/voice/<key>.mp3.

  python scripts/voices/generate.py            # lines without a recording
  python scripts/voices/generate.py --all      # re-record everything
  python scripts/voices/generate.py --refs     # re-record the reference takes too

Lines come from `npx tsx scripts/voice-lines.ts`. OMNIVOICE_MODEL / WHISPER_MODEL=<folder> load local copies of
the models. Every take is transcribed (Whisper) and pitch-checked, and redone when it does not say its line
in the character's voice; scores are kept in scripts/voices/report.json. Setup: see README ("Voices").
"""
import difflib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/src/assets/voice"
REFS = Path(__file__).resolve().parent / "refs"
SR_OUT = 24000

# who they are, and the mood their reference take is recorded in
CAST = {
    "aditi": ("female, young adult, moderate pitch, indian accent",
              "I don't know where she is. I just know she's here, I can feel it. I have to find her."),
    "aditi_whisper": ("female, young adult, moderate pitch, whisper, indian accent",
                      "Okay. Breathe. Just breathe... it's only the wind. Keep going, Aditi. Keep going."),
    "mother": ("female, middle-aged, low pitch, indian accent",
               "Aditi, listen to me, shona. I don't have much time... I love you. Whatever you hear tonight, don't answer it."),
    # ("low pitch" with "whisper" makes the model return noise)
    "mother_whisper": ("female, middle-aged, whisper, indian accent",
                       "Aditi, come here, shona. Come closer. I'm right behind you."),
    "kabir": ("male, young adult, low pitch, indian accent",
              "Hey, hey. It's okay. I'm right here, alright? I'm not going anywhere. Just keep talking to me."),
    "announcer": ("female, middle-aged, moderate pitch, indian accent",
                  "Attention please. The train to Howrah will arrive on platform number three. Passengers are requested to stand behind the yellow line."),
    "booth": ("male, elderly, very low pitch",
              "Nobody comes down here any more. Nobody... but she is still waiting for them."),
}

# which reference take each style speaks from, and how fast
TAKE = {"thought": "_whisper", "caller": ""}
SPEED = {"thought": 0.95, "call": 0.82, "caller": 0.78, "pa": 0.93, "note": 0.92, "tape": 0.95}


def lines():
    out = subprocess.run("npx tsx scripts/voice-lines.ts", cwd=ROOT, shell=True, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ─────────────────────────── where the line is heard ───────────────────────────

def band(x, sr, lo, hi):
    t = torch.from_numpy(x).float()[None]
    t = AF.highpass_biquad(t, sr, lo)
    t = AF.highpass_biquad(t, sr, lo)
    t = AF.lowpass_biquad(t, sr, hi)
    t = AF.lowpass_biquad(t, sr, hi)
    return t[0].numpy()


def room(x, sr, seconds, wet, seed=1, bright=6000):
    """a synthetic room: decaying filtered noise convolved with the line"""
    rng = np.random.default_rng(seed)
    n = int(sr * seconds)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = band(ir.astype(np.float32), sr, 120, bright)
    ir /= np.abs(ir).sum() ** 0.5 * 4
    y = AF.fftconvolve(torch.from_numpy(x).float(), torch.from_numpy(ir).float()).numpy()
    tail = np.zeros(len(y), np.float32)
    tail[: len(x)] = x
    return tail * (1 - wet) + y * wet


def echo(x, sr, delays):
    y = np.concatenate([x, np.zeros(int(sr * max(d for d, _ in delays)), np.float32)])
    for d, g in delays:
        k = int(sr * d)
        y[k:k + len(x)] += x * g
    return y


def lower(x, sr, factor):
    """slower and lower: the voice played back at `factor` of its speed"""
    return AF.resample(torch.from_numpy(x).float(), sr, int(sr / factor)).numpy()


def treat(x, sr, style, whisper=None):
    if style == "radio":
        y = np.tanh(band(x, sr, 320, 3300) * 2.2) * 0.6
        return y + np.random.default_rng(3).standard_normal(len(y)).astype(np.float32) * 0.004
    if style == "phone":
        return np.tanh(band(x, sr, 300, 3400) * 1.8) * 0.65
    if style == "tape":
        y = band(x, sr, 140, 6500)
        hiss = band(np.random.default_rng(5).standard_normal(len(y)).astype(np.float32), sr, 2000, 9000) * 0.012
        return room(y, sr, 0.25, 0.12) [: len(y)] + hiss
    if style == "pa":
        y = np.tanh(band(x, sr, 420, 4200) * 1.6) * 0.7
        return room(echo(y, sr, [(0.09, 0.32), (0.27, 0.16), (0.55, 0.07)]), sr, 1.6, 0.35, bright=4000)
    if style == "note":
        return room(x, sr, 0.5, 0.1)
    if style == "call":
        # her voice, perfect: the game places it in one ear, far off, in the hall's echo
        return x
    if style == "caller":
        y = lower(x, sr, 0.9)
        if whisper is not None:
            w = lower(whisper, sr, 0.9)
            n = max(len(y), len(w) + 700)
            mix = np.zeros(n, np.float32)
            mix[: len(y)] += y
            mix[700: 700 + len(w)] += w * 0.55
            y = mix
        return room(y, sr, 2.2, 0.3, bright=3500)
    return x


def finish(x, sr):
    x = AF.resample(torch.from_numpy(np.asarray(x, np.float32)), sr, SR_OUT).numpy()
    # trim silence, short fades, peak at -1 dBFS
    a = np.abs(x)
    on = np.where(a > 0.01 * a.max())[0]
    if len(on):
        x = x[max(0, on[0] - 600): on[-1] + 2400]
    f = min(240, len(x) // 4)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    return x / (np.abs(x).max() + 1e-6) * 0.89


# ─────────────────────────── checking a take without listening to it ───────────────────────────
# Diffusion TTS sometimes returns noise or clicks instead of speech, or drops words. Every take is
# transcribed and measured; a take that does not say its line in the character's register is redone.

# the speaking pitch each character should sit in (median f0, Hz); whispers have none
PITCH = {"aditi": (165, 300), "mother": (140, 255), "kabir": (80, 160), "announcer": (150, 290), "booth": (65, 150)}
TRIES = 5


DIGITS = dict(zip("0123456789", ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]))


def words(t):
    t = re.sub(r"\d", lambda m: f" {DIGITS[m.group()]} ", t.lower().replace("’", "'"))
    return re.sub(r"[^a-z' ]+", " ", t).split()


class Judge:
    def __init__(self):
        from transformers import pipeline
        self.asr = pipeline("automatic-speech-recognition", model=os.environ.get("WHISPER_MODEL", "openai/whisper-base.en"), device="cpu")

    def __call__(self, x, sr, text, role, whisper):
        import librosa
        y = librosa.resample(np.asarray(x, np.float32), orig_sr=sr, target_sr=16000)
        heard = self.asr({"raw": y, "sampling_rate": 16000})["text"]
        match = difflib.SequenceMatcher(None, words(text), words(heard)).ratio()
        f0 = None
        ok_pitch = True
        if not whisper:
            p, v, _ = librosa.pyin(y, fmin=60, fmax=420, sr=16000, frame_length=1024)
            voiced = p[v & np.isfinite(p)]
            f0 = float(np.median(voiced)) if len(voiced) > 8 else 0.0
            lo, hi = PITCH[role]
            ok_pitch = lo <= f0 <= hi
        secs = len(y) / 16000
        pace = len(words(text)) / max(secs, 0.1)
        # (a one- or two-word call is meant to be drawn out: no pace check)
        paced = len(words(text)) <= 2 or 0.8 <= pace <= 4.8
        score = match - (0 if ok_pitch else 0.5) - (0 if paced else 0.3)
        return score, {"heard": heard.strip(), "match": round(match, 2), "f0": f0 and round(f0), "pace": round(pace, 2)}


def best_take(make, judge, text, role, whisper, seed, label):
    """up to TRIES takes; stops at the first good one, otherwise keeps the best"""
    best = (-9, None, None)
    for k in range(TRIES):
        torch.manual_seed(seed + 1000 * k)
        # some punctuation derails the model into noise: later tries say the same words with ellipses
        # turned into full stops or commas
        said = [text, text.replace("...", "."), text.replace("...", ","), text, text.replace("...", ".")][k % 5]
        x = np.asarray(make(said), np.float32).reshape(-1)
        score, info = judge(x, 24000, text, role, whisper)
        print(f"   {label} try {k + 1}: score {score:.2f} {info}", flush=True)
        if score > best[0]:
            best = (score, x, info)
        if score >= 0.78:
            break
    return best


def main():
    from omnivoice import OmniVoice

    torch.set_num_threads(max(1, torch.get_num_threads()))
    model = OmniVoice.from_pretrained(os.environ.get("OMNIVOICE_MODEL", "k2-fsa/OmniVoice"), device_map="cpu", dtype=torch.float32)
    sr = model.sampling_rate
    assert sr == 24000, sr
    judge = Judge()
    REFS.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    report_path = Path(__file__).resolve().parent / "report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {}

    # 1. the cast's reference takes
    for name, (instruct, text) in CAST.items():
        wav = REFS / f"{name}.wav"
        if wav.exists() and "--refs" not in sys.argv:
            continue
        role = name.split("_")[0]
        score, x, info = best_take(lambda t: model.generate(text=t, language="English", instruct=instruct, num_step=32)[0], judge, text, role, "whisper" in name, 7, f"ref {name}")
        if score < 0.5:
            sys.exit(f"reference take for {name} never said its line (best: {info}); change its text in CAST")
        sf.write(wav, x, sr)
        report[f"ref:{name}"] = {"score": round(score, 2), **info}
        print(f"ref {name}: {score:.2f}", flush=True)
    prompts = {name: model.create_voice_clone_prompt(ref_audio=str(REFS / f"{name}.wav"), ref_text=text) for name, (_, text) in CAST.items()}

    # 2. the lines
    todo = lines() if "--all" in sys.argv else [l for l in lines() if not l["have"]]
    for i, l in enumerate(todo):
        role, style, text = l["role"], l["style"], l["text"]
        take = role + TAKE.get(style, "") if role + TAKE.get(style, "") in prompts else role
        say = lambda who: lambda t: model.generate(text=t, language="English", voice_clone_prompt=prompts[who], speed=SPEED.get(style, 1.0), num_step=32)[0]
        score, x, info = best_take(say(take), judge, text, role, "whisper" in take, 11 + i, l["key"])
        whisper = best_take(say("mother_whisper"), judge, text, "mother", True, 51 + i, l["key"] + " whisper")[1] if style == "caller" else None
        y = finish(treat(x, sr, style, whisper), sr)
        sf.write(OUT / f"{l['key']}.mp3", y, SR_OUT, format="MP3")
        report[l["key"]] = {"role": role, "style": style, "text": text, "score": round(score, 2), **info}
        report_path.write_text(json.dumps(report, indent=1, ensure_ascii=False))
        print(f"[{i + 1}/{len(todo)}] {role}/{style} {score:.2f}: {text[:60]}", flush=True)
    report_path.write_text(json.dumps(report, indent=1, ensure_ascii=False))
    weak = {k: v for k, v in report.items() if v["score"] < 0.78}
    print(f"done; {len(weak)} take(s) below the bar:")
    for k, v in weak.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
