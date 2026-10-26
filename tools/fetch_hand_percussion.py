#!/usr/bin/env python3
"""
Prepara la percusión de mano real (CC0) para Strumio.

Fuente: Versilian Community Sample Library (VCSL), licencia CC0-1.0.
  https://github.com/sgossner/VCSL

Uso:
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/sgossner/VCSL vcsl
  cd vcsl && git checkout HEAD -- "Idiophones/Struck Idiophones" "Membranophones/Struck Membranophones/Conga" "Membranophones/Struck Membranophones/Bongos"
  python tools/fetch_hand_percussion.py ruta/a/vcsl

Salida: assets/audio/hand/*.flac (mono, 44.1 kHz, 16 bits) y la sección
"hand" de assets/audio/manifest.json (capas de intensidad + round-robin).
"""
import json
import os
import sys

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio", "hand")
MANIFEST = os.path.join(ROOT, "assets", "audio", "manifest.json")

IDIO = "Idiophones/Struck Idiophones"
MEMB = "Membranophones/Struck Membranophones"

# id -> (segundos máximos, [capas de suave a fuerte, cada una con sus round-robin])
KIT = {
    "cajon_bass": (0.9, [[f"{IDIO}/Cajon/Cajon_hit3_p_rr1.wav", f"{IDIO}/Cajon/Cajon_hit3_p_rr2.wav"],
                         [f"{IDIO}/Cajon/Cajon_hit3_mp_rr1.wav", f"{IDIO}/Cajon/Cajon_hit3_mp_rr2.wav"],
                         [f"{IDIO}/Cajon/Cajon_hit3_f_rr1.wav", f"{IDIO}/Cajon/Cajon_hit3_f_rr2.wav"]]),
    "cajon_slap": (0.7, [[f"{IDIO}/Cajon/Cajon_hit1_mp_rr1.wav", f"{IDIO}/Cajon/Cajon_hit1_mp_rr2.wav"],
                         [f"{IDIO}/Cajon/Cajon_hit1_f_rr1.wav", f"{IDIO}/Cajon/Cajon_hit1_f_rr2.wav"],
                         [f"{IDIO}/Cajon/Cajon_hit1_fff_rr1.wav", f"{IDIO}/Cajon/Cajon_hit1_fff_rr2.wav"]]),
    "shaker": (0.45, [[f"{IDIO}/Shaker, Small/Mid_ShakerHighFaster_Up_rr1.wav", f"{IDIO}/Shaker, Small/Mid_ShakerHighFaster_Up_rr2.wav"],
                      [f"{IDIO}/Shaker, Small/Mid_ShakerHighFaster_Down_rr1.wav", f"{IDIO}/Shaker, Small/Mid_ShakerHighFaster_Down_rr2.wav"]]),
    "tambourine": (0.6, [[f"{IDIO}/Tambourine 1/Tamb1_Hit_v1_rr1_Mid.wav"],
                         [f"{IDIO}/Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav"]]),
    "conga_high": (0.7, [[f"{MEMB}/Conga/Quinto_HitN_v1_rr1_Sum.wav", f"{MEMB}/Conga/Quinto_HitN_v1_rr2_Sum.wav"],
                         [f"{MEMB}/Conga/Quinto_HitN_v2_rr1_Sum.wav", f"{MEMB}/Conga/Quinto_HitN_v2_rr2_Sum.wav"],
                         [f"{MEMB}/Conga/Quinto_HitN_v3_rr1_Sum.wav", f"{MEMB}/Conga/Quinto_HitN_v3_rr2_Sum.wav"]]),
    "conga_low": (0.8, [[f"{MEMB}/Conga/Tumba_HitN_v1_rr1_Sum.wav", f"{MEMB}/Conga/Tumba_HitN_v1_rr2_Sum.wav"],
                        [f"{MEMB}/Conga/Tumba_HitN_v2_rr1_Sum.wav", f"{MEMB}/Conga/Tumba_HitN_v2_rr2_Sum.wav"],
                        [f"{MEMB}/Conga/Tumba_HitN_v3_rr1_Sum.wav", f"{MEMB}/Conga/Tumba_HitN_v3_rr2_Sum.wav"]]),
    "bongo_high": (0.5, [[f"{MEMB}/Bongos/BongoH_Hit1_v1_rr1_Mid.wav", f"{MEMB}/Bongos/BongoH_Hit1_v1_rr2_Mid.wav"],
                         [f"{MEMB}/Bongos/BongoH_Hit1_v2_rr1_Mid.wav", f"{MEMB}/Bongos/BongoH_Hit1_v2_rr2_Mid.wav"],
                         [f"{MEMB}/Bongos/BongoH_Hit1_v3_rr1_Mid.wav", f"{MEMB}/Bongos/BongoH_Hit1_v3_rr2_Mid.wav"]]),
    "bongo_low": (0.5, [[f"{MEMB}/Bongos/BongoL_Hit1_v1_rr1_Mid.wav", f"{MEMB}/Bongos/BongoL_Hit1_v1_rr2_Mid.wav"],
                        [f"{MEMB}/Bongos/BongoL_Hit1_v2_rr1_Mid.wav", f"{MEMB}/Bongos/BongoL_Hit1_v2_rr2_Mid.wav"],
                        [f"{MEMB}/Bongos/BongoL_Hit1_v3_rr1_Mid.wav", f"{MEMB}/Bongos/BongoL_Hit1_v3_rr2_Mid.wav"]]),
    "claves": (0.35, [[f"{IDIO}/Claves/Claves1_Hit_v1_rr1_Mid.wav"],
                      [f"{IDIO}/Claves/Claves1_Hit_v2_rr1_Mid.wav"],
                      [f"{IDIO}/Claves/Claves1_Hit_v3_rr1_Mid.wav"]]),
    # Click del metrónomo: suave (pulsos) y fuerte (primer tiempo).
    "woodblock": (0.3, [[f"{IDIO}/Woodblock/wood_click_mp.wav"],
                        [f"{IDIO}/Woodblock/wood_click_f_rr1.wav", f"{IDIO}/Woodblock/wood_click_f_rr2.wav"]]),
}

TARGET_PEAK = 0.9


def load(path):
    data, sr = sf.read(path, dtype="float64", always_2d=True)
    if sr != 44100:
        raise SystemExit(f"{path}: se esperaba 44.1 kHz y es {sr}")
    return data.mean(axis=1)


def trim(data, seconds, sr=44100):
    peak = float(np.max(np.abs(data))) or 1.0
    start = int(np.argmax(np.abs(data) > peak * 0.02))
    start = max(0, start - int(0.002 * sr))
    data = data[start:start + int(seconds * sr)].copy()
    fade = min(len(data), int(min(0.12, seconds * 0.3) * sr))
    if fade:
        data[-fade:] *= np.linspace(1.0, 0.0, fade) ** 2
    return data


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    src_root = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    hand = {}
    for kid, (seconds, layers) in KIT.items():
        clips = [[trim(load(os.path.join(src_root, f)), seconds) for f in layer] for layer in layers]
        # Normaliza el instrumento entero para conservar la diferencia entre capas.
        peak = max(float(np.max(np.abs(c))) for layer in clips for c in layer) or 1.0
        gain = TARGET_PEAK / peak
        out_layers = []
        for li, layer in enumerate(clips):
            names = []
            for ri, clip in enumerate(layer):
                name = f"hand/{kid}_v{li}_r{ri + 1}.flac"
                sf.write(os.path.join(ROOT, "assets", "audio", name), clip * gain, 44100, subtype="PCM_16")
                names.append(name)
            out_layers.append(names)
        hand[kid] = out_layers
        print(f"{kid}: {sum(len(l) for l in out_layers)} archivos")

    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    manifest["hand"] = hand
    sources = [s for s in manifest.get("sources", []) if s.get("name") != "VCSL"]
    sources.append({
        "name": "VCSL",
        "author": "Versilian Studios",
        "license": "CC0-1.0",
        "url": "https://github.com/sgossner/VCSL",
    })
    manifest["sources"] = sources
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
