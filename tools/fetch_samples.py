#!/usr/bin/env python3
"""
Descarga y prepara samples reales CC0 para Strumio.

Fuente: Karoryfer Samples (https://sfzinstruments.github.io) - licencia CC0-1.0.
  - Big Rusty Drums  (bateria acustica grabada, multi-velocidad)
  - Pastabass        (bajo electrico, notas reales)
  - Emilyguitar      (guitarra acustica, notas reales)
  - Body Percussion  (palmas, chasquidos, pisadas)

Salida: assets/audio/**.flac (mono, 44.1 kHz, 16 bits) + manifest.json
El script es idempotente: reutiliza la cache de descargas.
"""
import json
import os
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
CACHE = os.path.join(ROOT, "tools", ".sample_cache")
UA = {"User-Agent": "Strumio-sample-fetcher/1.0"}

REPOS = {
    "drums": ("sfzinstruments/karoryfer.big-rusty-drums", "main"),
    "bass": ("sfzinstruments/karoryfer.pastabass", "master"),
    "guitar": ("sfzinstruments/karoryfer.emilyguitar", "master"),
    "perc": ("sfzinstruments/body_percussion", "main"),
}

# id interno -> (carpeta del instrumento, articulacion, microfono, segundos maximos)
DRUM_MAP = {
    "kick":        ("kick_24", "rc", "cl", 1.4),
    "snare":       ("snare_14", "center", "top", 1.6),
    "snare_rim":   ("snare_14", "rimshot", "top", 1.2),
    "hihat":       ("hihat_14", "cl", "cl", 0.7),
    "hihat_open":  ("hihat_14", "ho", "cl", 1.8),
    "hihat_pedal": ("hihat_14", "footspl", "cl", 0.7),
    "ride":        ("ride_22", "rd", "cl", 3.5),
    "ride_bell":   ("ride_22", "bl", "cl", 2.8),
    "crash":       ("crash_17", "cr", "cl", 4.5),
    "tom_high":    ("tom_14", "center", "cl", 1.4),
    "tom_mid":     ("tom_15", "center", "cl", 1.6),
    "tom_low":     ("tom_18", "center", "cl", 1.9),
}
PERC_MAP = {
    "clap": "handclap",
    "finger_snap": "snap_l",
    "stomp": "stomp_l",
}
PERC_SECONDS = 1.2
BASS_SECONDS = 2.6
GUITAR_SECONDS = 3.2

NOTE_OFFSET = {"c": 0, "db": 1, "d": 2, "eb": 3, "e": 4, "f": 5, "gb": 6,
               "g": 7, "ab": 8, "a": 9, "bb": 10, "b": 11}


def midi_of(name):
    name = name.lower().strip()
    letter, rest = name[0], name[1:]
    acc = ""
    if rest and rest[0] == "b":
        acc, rest = "b", rest[1:]
    semis = NOTE_OFFSET[letter] - (1 if acc == "b" else 0)
    return 12 * (int(rest) + 1) + semis


def http_get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def api_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


_tree_cache = {}


def tree(repo_key):
    if repo_key in _tree_cache:
        return _tree_cache[repo_key]
    repo, branch = REPOS[repo_key]
    data = api_json(f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1")
    _tree_cache[repo_key] = [t["path"] for t in data["tree"] if t["type"] == "blob"]
    return _tree_cache[repo_key]


def raw_url(repo_key, path):
    repo, branch = REPOS[repo_key]
    return f"https://raw.githubusercontent.com/{repo}/{branch}/{path}"


def to_mono(data):
    return data.mean(axis=1) if data.ndim > 1 else data


def resample(data, sr, target=44100):
    if sr == target:
        return data.astype(np.float32)
    n = int(round(len(data) * target / sr))
    x_old = np.linspace(0, 1, len(data), endpoint=False)
    x_new = np.linspace(0, 1, n, endpoint=False)
    return np.interp(x_new, x_old, data).astype(np.float32)


def trim(data, sr, start_thresh=0.002, end_thresh=0.0008, pad_ms=60):
    peak = float(np.max(np.abs(data))) if len(data) else 0.0
    if peak <= 0:
        return data
    idx = np.flatnonzero(np.abs(data) > peak * start_thresh)
    start = max(0, int(idx[0]) - int(0.003 * sr)) if idx.size else 0
    idx2 = np.flatnonzero(np.abs(data) > peak * end_thresh)
    end = min(len(data), int(idx2[-1]) + int(pad_ms / 1000 * sr)) if idx2.size else len(data)
    return data[start:end]


def limit_seconds(data, sr, seconds, fade=0.25):
    max_n = int(seconds * sr)
    if len(data) <= max_n:
        return data
    out = data[:max_n].copy()
    n_fade = min(len(out), int(fade * sr))
    if n_fade > 4:
        out[-n_fade:] *= np.linspace(1, 0, n_fade, dtype=np.float32)
    return out


def prepare(src_path, seconds):
    data, sr = sf.read(src_path, always_2d=True)
    data = to_mono(data.astype(np.float32))
    data = resample(data, sr)
    data = trim(data, 44100)
    data = limit_seconds(data, 44100, seconds, fade=min(0.3, seconds * 0.12))
    peak = float(np.max(np.abs(data))) if len(data) else 0.0
    if peak > 0.98:
        data = data * (0.98 / peak)
    return data


def write_audio(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sf.write(path, np.clip(data, -1, 1), 44100, format="FLAC", subtype="PCM_16")


def pick_velocities(vls, count=4):
    vls = sorted(set(vls))
    if len(vls) <= count:
        return vls
    idx = np.linspace(0, len(vls) - 1, count).round().astype(int)
    return sorted(set(vls[i] for i in idx))


def load_pair(repo_key, jobs):
    def fetch(job):
        src, dst = job
        cache_path = os.path.join(CACHE, repo_key + "_" + src.replace("/", "_"))
        http_get(raw_url(repo_key, src), cache_path)
        return job, cache_path

    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for fut in as_completed([ex.submit(fetch, j) for j in jobs]):
            results.append(fut.result())
    return results


def do_drums(manifest):
    files = tree("drums")
    out = {}
    jobs = []
    descriptors = {}
    for drum_id, (folder, art, mic, seconds) in DRUM_MAP.items():
        prefix = f"Samples/{folder}/{art}/{mic}/"
        candidates = [p for p in files if p.startswith(prefix) and p.lower().endswith(".flac")]
        parsed = []
        for p in candidates:
            fn = p.split("/")[-1].replace(".flac", "")
            vl = rr = None
            for part in fn.split("_"):
                if part.startswith("vl") and part[2:].isdigit():
                    vl = int(part[2:])
                if part.startswith("rr") and part[2:].isdigit():
                    rr = int(part[2:])
            if vl is not None:
                parsed.append((vl, rr or 1, p))
        if not parsed:
            print("  ! sin samples para", drum_id)
            continue
        vls = pick_velocities([x[0] for x in parsed], 4)
        layers = []
        for i, vl in enumerate(vls):
            by_rr = {}
            for _, rr, p in parsed:
                if rr <= 2 and _ == vl:
                    by_rr.setdefault(rr, p)
            reps = sorted(by_rr.items())[: (1 if i == 0 else 2)]
            group = []
            for rr, p in reps:
                dst = os.path.join(OUT, "drums", f"{drum_id}_v{i}_r{rr}.flac")
                group.append(os.path.relpath(dst, OUT).replace("\\", "/"))
                jobs.append((p, dst))
                descriptors[dst] = (drum_id, i, len(vls), seconds)
            layers.append(group)
        out[drum_id] = layers

    results = load_pair("drums", jobs)
    decoded = {}
    for (src, dst), cache_path in results:
        decoded[dst] = prepare(cache_path, descriptors[dst][3])

    # Niveles de velocity audibles y consistentes: 0.42 -> 0.92
    peaks = {}
    for (src, dst), _ in results:
        drum_id = descriptors[dst][0]
        peaks[drum_id] = max(peaks.get(drum_id, 0.0), float(np.max(np.abs(decoded[dst]))))
    for (src, dst), _ in results:
        drum_id, i, n, _ = descriptors[dst]
        local_peak = float(np.max(np.abs(decoded[dst]))) or 1.0
        target = 0.42 + (0.92 - 0.42) * (i / max(1, n - 1))
        gain = min(10.0, target / local_peak)
        write_audio(dst, decoded[dst] * gain)

    manifest["drums"] = out
    print(f"  bateria: {len(results)} archivos")


def do_pitched(manifest, kind, repo_key, folder, seconds, rr_count, vel_filter):
    files = tree(repo_key)
    entries = []
    for p in files:
        if not p.lower().endswith(".wav") or not p.startswith(folder):
            continue
        parts = p.split("/")[-1].lower().replace(".wav", "").split("_")
        note = parts[0]
        if not re.match(r"^(c|db|d|eb|e|f|gb|g|ab|a|bb|b)\d$", note):
            continue
        vel, rr = None, 1
        for part in parts[1:]:
            if part in vel_filter:
                vel = part
            if part.startswith("rr") and part[2:].isdigit():
                rr = int(part[2:])
        if vel is None or rr > rr_count:
            continue
        entries.append({"note": note, "midi": midi_of(note), "vel": vel, "rr": rr, "path": p})

    by_note = {}
    for e in entries:
        by_note.setdefault(e["note"], []).append(e)
    selected = []
    for note, group in by_note.items():
        vels = sorted(set(x["vel"] for x in group))
        target = "mf" if "mf" in vels else vels[len(vels) // 2]
        selected += [x for x in group if x["vel"] == target]

    jobs = []
    for e in selected:
        dst = os.path.join(OUT, kind, f"{e['note']}_{e['vel']}_r{e['rr']}.flac")
        e["file"] = os.path.relpath(dst, OUT).replace("\\", "/")
        jobs.append((e["path"], dst))

    results = load_pair(repo_key, jobs)
    decoded = {}
    for (src, dst), cache_path in results:
        decoded[dst] = prepare(cache_path, seconds)
    peaks = {}
    for (src, dst), _ in results:
        note = os.path.basename(dst).split("_")[0]
        peaks[note] = max(peaks.get(note, 0.0), float(np.max(np.abs(decoded[dst]))))
    for (src, dst), _ in results:
        note = os.path.basename(dst).split("_")[0]
        peak = float(np.max(np.abs(decoded[dst]))) or 1.0
        write_audio(dst, decoded[dst] * (0.9 / peak))

    manifest[kind] = [{"note": e["note"], "midi": e["midi"], "vel": e["vel"], "file": e["file"]} for e in selected]
    print(f"  {kind}: {len(results)} archivos")


def do_perc(manifest):
    files = tree("perc")
    out = {}
    for perc_id, prefix in PERC_MAP.items():
        cands = [p for p in files if p.startswith("Samples/body/")
                 and os.path.basename(p).startswith(prefix) and p.endswith(".wav")]
        if not cands:
            continue
        sel = sorted(cands)[:2]
        group = []
        jobs = []
        for i, p in enumerate(sel):
            dst = os.path.join(OUT, "perc", f"{perc_id}_r{i+1}.flac")
            jobs.append((p, dst))
            group.append(os.path.relpath(dst, OUT).replace("\\", "/"))
        for (src, dst), cache_path in load_pair("perc", jobs):
            data = prepare(cache_path, PERC_SECONDS)
            peak = float(np.max(np.abs(data))) or 1.0
            write_audio(dst, data * (0.9 / peak))
        out[perc_id] = group
    manifest["perc"] = out
    print(f"  percusion: {sum(len(v) for v in out.values())} archivos")


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    manifest = {
        "version": 1,
        "sampleRate": 44100,
        "license": "CC0-1.0",
        "engine": "Strumio real samples",
        "sources": [
            {"name": "Big Rusty Drums", "author": "Karoryfer Samples", "license": "CC0-1.0",
             "url": "https://github.com/sfzinstruments/karoryfer.big-rusty-drums"},
            {"name": "Pastabass", "author": "Karoryfer Samples", "license": "CC0-1.0",
             "url": "https://github.com/sfzinstruments/karoryfer.pastabass"},
            {"name": "Emilyguitar", "author": "Karoryfer Samples", "license": "CC0-1.0",
             "url": "https://github.com/sfzinstruments/karoryfer.emilyguitar"},
            {"name": "Body Percussion", "author": "Karoryfer Samples", "license": "CC0-1.0",
             "url": "https://github.com/sfzinstruments/body_percussion"},
        ],
    }
    print("Descargando bateria...")
    do_drums(manifest)
    print("Descargando bajo...")
    do_pitched(manifest, "bass", "bass", "samples/fetuccine", BASS_SECONDS, 2, {"vl1", "vl2", "vl3", "vl4"})
    print("Descargando guitarra...")
    do_pitched(manifest, "guitar", "guitar", "notes", GUITAR_SECONDS, 2, {"f", "mf"})
    print("Descargando percusion...")
    do_perc(manifest)

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print("Listo ->", OUT)


if __name__ == "__main__":
    main()
