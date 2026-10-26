#!/usr/bin/env python3
"""
Descarga guitarra eléctrica, guitarra de nylon y piano reales para Strumio.

Fuente: tonejs-instruments de Nicholaus Brosowsky.
  https://github.com/nbrosowsky/tonejs-instruments
Licencia de las muestras: CC-BY 3.0 (hay que citar al autor; ya aparece en
Ajustes > Créditos de sonido a partir de manifest.json).

Uso:
  python tools/fetch_tonejs_instruments.py

Salida: assets/audio/{electric,nylon,piano}/*.mp3 y las secciones
"electric", "nylon" y "piano" de assets/audio/manifest.json.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, "assets", "audio")
MANIFEST = os.path.join(AUDIO, "manifest.json")
BASE = "https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples"

NAMES = {"C": 0, "Cs": 1, "D": 2, "Ds": 3, "E": 4, "F": 5, "Fs": 6, "G": 7, "Gs": 8, "A": 9, "As": 10, "B": 11}

# grupo de Strumio -> (carpeta de origen, notas)
KITS = {
    "electric": ("guitar-electric", ["E2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4", "A4", "C5", "Ds5", "Fs5", "A5", "C6"]),
    "nylon": ("guitar-nylon", ["E2", "Gs2", "B2", "D3", "Fs3", "A3", "Cs4", "Fs4", "A4", "Cs5", "Fs5", "A5"]),
    # Piano: una muestra cada 3 semitonos de C2 a C7.
    "piano": ("piano", [f"{n}{o}" for o in range(2, 7) for n in ("C", "Ds", "Fs", "A")] + ["C7"]),
}


def midi_of(note):
    m = re.fullmatch(r"([A-G]s?)(\d)", note)
    return 12 * (int(m.group(2)) + 1) + NAMES[m.group(1)]


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return True
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
    except Exception as e:  # noqa: BLE001
        print("  falta", url, e)
        return False
    with open(dest, "wb") as fh:
        fh.write(data)
    return True


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    for group, (folder, notes) in KITS.items():
        os.makedirs(os.path.join(AUDIO, group), exist_ok=True)
        entries = []
        for note in notes:
            name = f"{group}/{note.lower()}.mp3"
            if fetch(f"{BASE}/{folder}/{note}.mp3", os.path.join(AUDIO, name)):
                entries.append({"note": note.lower(), "midi": midi_of(note), "vel": "mf", "file": name})
        manifest[group] = entries
        print(f"{group}: {len(entries)} muestras")

    sources = [s for s in manifest.get("sources", []) if s.get("name") != "tonejs-instruments"]
    sources.append({
        "name": "tonejs-instruments (guitarra eléctrica, nylon y piano)",
        "author": "Nicholaus Brosowsky",
        "license": "CC-BY-3.0",
        "url": "https://github.com/nbrosowsky/tonejs-instruments",
    })
    manifest["sources"] = sources
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
