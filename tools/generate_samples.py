"""Generate guitar/ukulele/bass note samples as WAV files using Karplus-Strong synthesis."""
import wave, struct, math, os, random

SR = 44100

def karplus_strong(freq, duration=2.0, instrument="guitar"):
    """Generate a plucked string sample."""
    if freq <= 0:
        return []
    N = int(SR / freq)
    # Excitation: white noise burst
    buf = [random.uniform(-1, 1) for _ in range(N)]
    # Pad to full duration
    total = int(SR * duration)
    out = [0.0] * total
    # Karplus-Strong with lowpass filter
    # Feedback coefficient
    params = {
        "guitar": (0.996, 0.5, 3.0, 200, 2.0),
        "ukulele": (0.994, 0.6, 2.5, 350, 1.5),
        "bass": (0.998, 0.4, 4.0, 120, 3.0),
        "classical": (0.995, 0.45, 3.5, 250, 2.5),
    }
    fb, bright, body_gain, body_freq, decay_time = params.get(instrument, params["guitar"])

    # State for the delay line
    delay = buf[:]
    idx = 0
    prev = 0.0
    # Body resonance: simple IIR
    body_state = 0.0
    body_coef = 2 * math.pi * body_freq / SR
    for i in range(total):
        # Read from delay line
        val = delay[idx]
        # Lowpass filter (averaging)
        filtered = 0.5 * (val + prev)
        prev = val
        # Apply feedback
        delay[idx] = filtered * fb
        # Body resonance
        body_state += body_coef * (filtered * body_gain - body_state)
        out[i] = filtered + body_state * 0.3
        idx = (idx + 1) % N
        if i > SR * decay_time:
            # fade out
            fade = max(0, 1 - (i - SR * decay_time) / (SR * 0.5))
            out[i] *= fade

    # Normalize
    peak = max(abs(x) for x in out) or 1
    out = [x / peak * 0.8 for x in out]
    # Attack transient (pick noise)
    for i in range(min(50, total)):
        out[i] += random.uniform(-0.1, 0.1) * (1 - i/50)
    return out

def save_wav(path, samples, sr=SR):
    with wave.open(path, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        for s in samples:
            w.writeframes(struct.pack('<h', int(s * 32767)))

# Note frequencies
NOTES = {
    "E2": 82.41, "A2": 110.00, "D3": 146.83, "G3": 196.00, "B3": 246.94, "E4": 329.63,
    "G4": 392.00, "C4": 261.63, "E4u": 329.63, "A4": 440.00,
    "E1": 41.20, "A1": 55.00, "D2": 73.42, "G2": 98.00,
}

def main():
    base = os.path.join(os.path.dirname(__file__), "..", "assets", "samples")
    for inst in ["guitar", "ukulele", "bass", "classical"]:
        d = os.path.join(base, inst)
        os.makedirs(d, exist_ok=True)
        for name, freq in NOTES.items():
            # skip notes not relevant
            if inst == "ukulele" and name not in ("G4","C4","E4u","A4"):
                continue
            if inst == "bass" and name not in ("E1","A1","D2","G2","E2","A2","D3","G3"):
                continue
            samples = karplus_strong(freq, 2.0, inst)
            path = os.path.join(d, f"{name}.wav")
            save_wav(path, samples)
            print(f"Generated {path}")

if __name__ == "__main__":
    main()
    print("Done!")
