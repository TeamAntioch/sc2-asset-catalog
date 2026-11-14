"""Measure StarCraft II music files you extracted from your own install.

usage: python3 -I audio_measure.py AUDIO_ROOT OUT.json   (needs numpy, ffmpeg and ffprobe on PATH)

AUDIO_ROOT is your Audio folder: the game's music .ogg files, in any layout. Results are
resumable: files already in OUT.json are skipped. A file's key is its path under AUDIO_ROOT,
lower case, so run this and gemini_describe.py on the same folder.

Per file: duration; EBU R128 integrated loudness and loudness range (ffmpeg ebur128);
a 1 s RMS envelope (dBFS) summarised as start/end level, peak position and
fade-in / fade-out flags; spectral centroid (brightness); low-band share; an onset
density and an autocorrelation tempo estimate with its strength (weak strength = no
clear pulse, so the tempo is not meaningful); seamless-loop hint (does the last
second match the first second in level and spectrum).
These are signal measurements, not listening.
"""
import sys, os, json, subprocess, re
import numpy as np

if len(sys.argv) != 3:
    sys.exit(__doc__)
root, out = sys.argv[1], sys.argv[2]
SR = 11025
res = json.load(open(out)) if os.path.exists(out) else {}


def decode(path):
    p = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                       capture_output=True)
    return np.frombuffer(p.stdout, dtype='<i2').astype(np.float32) / 32768.0


def loudness(path):
    p = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True)
    t = p.stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', t)
    lra = re.findall(r'LRA:\s+(-?[\d.]+) LU', t)
    return (float(i[-1]) if i else None), (float(lra[-1]) if lra else None)


def features(x):
    n = len(x)
    dur = n / SR
    if n < SR // 2:
        return {'duration_s': round(dur, 2)}
    sec = SR
    k = n // sec
    rms = np.array([np.sqrt(np.mean(x[i * sec:(i + 1) * sec] ** 2) + 1e-12) for i in range(k)]) if k else np.array([np.sqrt(np.mean(x ** 2))])
    db = 20 * np.log10(rms + 1e-9)
    body = db[db > -60] if np.any(db > -60) else db
    med = float(np.median(body))
    # STFT
    win = 1024
    hop = 512
    frames = (n - win) // hop
    if frames < 8:
        return {'duration_s': round(dur, 2)}
    idx = np.arange(win)[None, :] + hop * np.arange(frames)[:, None]
    S = np.abs(np.fft.rfft(x[idx] * np.hanning(win), axis=1))
    freqs = np.fft.rfftfreq(win, 1 / SR)
    power = S ** 2
    tot = power.sum(axis=1) + 1e-12
    centroid = float(np.median((power * freqs).sum(axis=1) / tot))
    low = float(np.median(power[:, freqs < 200].sum(axis=1) / tot))
    # spectral flux onset envelope
    logS = np.log1p(S * 10)
    flux = np.maximum(0, np.diff(logS, axis=0)).sum(axis=1)
    flux = flux - np.convolve(flux, np.ones(16) / 16, mode='same')
    flux = np.maximum(flux, 0)
    fps = SR / hop
    thr = flux.mean() + 1.5 * flux.std()
    peaks = np.sum((flux[1:-1] > thr) & (flux[1:-1] > flux[:-2]) & (flux[1:-1] >= flux[2:]))
    onset_rate = float(peaks / dur)
    # tempo: autocorrelation of flux, 50-200 BPM
    f = flux - flux.mean()
    ac = np.correlate(f, f, mode='full')[len(f) - 1:]
    ac = ac / (ac[0] + 1e-12)
    lo, hi = int(fps * 60 / 200), int(fps * 60 / 50)
    if hi < len(ac):
        lag = lo + int(np.argmax(ac[lo:hi]))
        bpm = 60 * fps / lag
        strength = float(ac[lag])
    else:
        bpm, strength = None, None
    # loop hint: compare first and last 1 s
    a, b = x[:sec], x[-sec:]
    sa, sb = np.abs(np.fft.rfft(a)), np.abs(np.fft.rfft(b))
    spec_sim = float(np.dot(sa, sb) / (np.linalg.norm(sa) * np.linalg.norm(sb) + 1e-12))
    return {
        'duration_s': round(dur, 2),
        'median_db': round(med, 1),
        'start_db': round(float(db[0]), 1), 'end_db': round(float(db[-1]), 1),
        'peak_at': round(float(np.argmax(db)) / max(1, k - 1), 2),
        'fade_in': bool(db[0] < med - 15), 'fade_out': bool(db[-1] < med - 15),
        'dyn_range_db': round(float(np.percentile(body, 95) - np.percentile(body, 10)), 1),
        'envelope_db': [round(float(v), 1) for v in db[::max(1, k // 24)]][:25],
        'centroid_hz': round(centroid), 'low_share': round(low, 3),
        'onset_rate': round(onset_rate, 2),
        'tempo_bpm': round(bpm, 1) if bpm else None, 'tempo_strength': round(strength, 3) if strength is not None else None,
        'edge_spec_sim': round(spec_sim, 3), 'edge_db_diff': round(float(abs(db[0] - db[-1])), 1),
    }


files = []
for dp, dn, fn in os.walk(root):
    for f in fn:
        if f.lower().endswith(('.ogg', '.wav')):
            files.append(os.path.join(dp, f))
files.sort()
for n, p in enumerate(files):
    key = os.path.relpath(p, root).lower().replace('\\', '/')
    if key in res:
        continue
    try:
        r = features(decode(p))
        r['lufs'], r['lra'] = loudness(p)
        r['path'] = os.path.relpath(p, root)
        res[key] = r
    except Exception as e:
        res[key] = {'error': str(e)}
    if n % 50 == 0:
        json.dump(res, open(out, 'w'))
        print(n, len(files), flush=True)
json.dump(res, open(out, 'w'))
print('done', len(res))
