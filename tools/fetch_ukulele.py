#!/usr/bin/env python3
"""
Descarga un ukelele real para Strumio.

Fuente: FreePats "Ukulele" (ukulele1), grabado por Mateusz Dąbrowski
(ukelele tenor Flight Fireball).
  https://freepats.zenvoid.org/GuitarFamily/ukulele.html
  https://github.com/freepats/ukulele1
Licencia: CC0 1.0 (dominio público; no exige atribución, pero se cita igual).

Uso:
  python -I tools/fetch_ukulele.py [--tmp CARPETA_TEMPORAL_VACIA]

Las descargas se guardan primero en una carpeta temporal nueva (o la que se
pase con --tmp, que debe estar vacía), se comprueba que sean FLAC válidos y
solo entonces se copian a assets/audio/ukulele/. No se ejecuta nada de lo
descargado.

Salida: assets/audio/ukulele/*.flac y la sección "ukulele" de
assets/audio/manifest.json.
"""
import argparse
import json
import os
import shutil
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "assets", "audio")
MANIFEST = os.path.join(AUDIO, "manifest.json")
COMMIT = "HEAD"
BASE = f"https://raw.githubusercontent.com/freepats/ukulele1/{COMMIT}/samples"

NAMES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}

# Subconjunto (~cada 3 semitonos, C4–C6) que incluye las 4 cuerdas al aire
# (G4 C4 E4 A4) para que el tono de referencia del afinador no se transponga.
# "tune" = corrección en cents tomada de "Ukulele 20260811.sfz" del original.
NOTES = [
    ("C4", -5), ("E4", -2), ("G4", -1), ("A4", 0),
    ("C#5", 0), ("F5", 4), ("A5", 8), ("C6", 4),
]
MAX_BYTES = 1_000_000  # ninguna muestra original supera ~300 KB


def midi_of(note):
    name, octave = note[:-1], int(note[-1])
    return 12 * (octave + 1) + NAMES[name]


def slug(note):
    return note.lower().replace("#", "s")


def download(url, dest):
    with urllib.request.urlopen(url, timeout=60) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("demasiado grande")
    if data[:4] != b"fLaC":
        raise ValueError("no es FLAC")
    with open(dest, "wb") as fh:
        fh.write(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tmp", help="carpeta temporal nueva y vacía para las descargas")
    args = ap.parse_args()
    tmp = args.tmp or tempfile.mkdtemp(prefix="strumio-uke-")
    os.makedirs(tmp, exist_ok=True)
    if os.listdir(tmp):
        raise SystemExit(f"La carpeta temporal no está vacía: {tmp}")

    out_dir = os.path.join(AUDIO, "ukulele")
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for note, tune in NOTES:
        name = f"ukulele/{slug(note)}.flac"
        dest = os.path.join(AUDIO, name)
        if not (os.path.exists(dest) and os.path.getsize(dest) > 0):
            tmp_file = os.path.join(tmp, f"{slug(note)}.flac")
            url = f"{BASE}/{urllib.parse.quote(note)}.flac"
            try:
                download(url, tmp_file)
            except Exception as e:  # noqa: BLE001
                print("  falta", url, e)
                continue
            shutil.copyfile(tmp_file, dest)
        entry = {"note": slug(note), "midi": midi_of(note), "vel": "mf", "file": name}
        if tune:
            entry["tune"] = tune
        entries.append(entry)

    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    manifest["ukulele"] = entries
    sources = [s for s in manifest.get("sources", []) if not str(s.get("name", "")).startswith("FreePats Ukulele")]
    sources.append({
        "name": "FreePats Ukulele",
        "author": "Mateusz Dąbrowski (FreePats)",
        "license": "CC0-1.0",
        "url": "https://github.com/freepats/ukulele1",
        "details": "Ukelele tenor Flight Fireball. https://freepats.zenvoid.org/GuitarFamily/ukulele.html",
    })
    manifest["sources"] = sources
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    total = sum(os.path.getsize(os.path.join(AUDIO, e["file"])) for e in entries)
    print(f"ukulele: {len(entries)} muestras, {total / 1024:.0f} KB (temporal: {tmp})")


if __name__ == "__main__":
    main()
