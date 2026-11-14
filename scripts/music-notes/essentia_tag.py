"""Tag SC2 music files with Essentia's pretrained models (MTG, CC BY-NC-SA 4.0).

usage: python3 -I essentia_tag.py AUDIO_ROOT MODELS_DIR OUT.json [--limit N] [--only SUBSTR]

An optional cross-check: its tags aren't part of the shipped notes. Needs the
`essentia-tensorflow` and `numpy` packages and the pretrained models in MODELS_DIR (see
README.md in this folder). Results are resumable: files already in OUT.json are skipped.

Per file, from the Discogs-EffNet embedding averaged over the whole file:
  moodtheme / instrument / genre: top MTG-Jamendo tags with scores (0-1, sigmoid)
  binary: aggressive, happy, sad, relaxed, acoustic, electronic, party,
          danceable, voice (each 0-1, probability of the named class)
  approachability, engagement: regression, roughly 0-1
And from the MSD-MusiCNN embedding: valence and arousal (emoMusic scale 1-9).
Keys match audio_measure.py's: the path under AUDIO_ROOT, lower case.
These are model outputs, not listening; treat them as weak evidence.
"""
import sys, os, json, time, subprocess
import numpy as np
import essentia
import essentia.standard as es

essentia.log.warningActive = False
essentia.log.infoActive = False

args = sys.argv[1:]
root, mdir, out = args[0], args[1], args[2]
limit = int(args[args.index('--limit') + 1]) if '--limit' in args else None
only = args[args.index('--only') + 1] if '--only' in args else None
SR = 16000


def meta(name):
    with open(os.path.join(mdir, name + '.json')) as f:
        return json.load(f)


def pb(name):
    return os.path.join(mdir, name + '.pb')


effnet = es.TensorflowPredictEffnetDiscogs(graphFilename=pb('discogs-effnet-bs64-1'),
                                           output='PartitionedCall:1')
musicnn = es.TensorflowPredictMusiCNN(graphFilename=pb('msd-musicnn-1'), output='model/dense/BiasAdd')

MULTI = ['mtg_jamendo_moodtheme', 'mtg_jamendo_instrument', 'mtg_jamendo_genre']
BINARY = {'mood_aggressive': 'aggressive', 'mood_happy': 'happy', 'mood_sad': 'sad',
          'mood_relaxed': 'relaxed', 'mood_acoustic': 'acoustic', 'mood_electronic': 'electronic',
          'mood_party': 'party', 'danceability': 'danceable', 'voice_instrumental': 'voice'}
REGRESS = ['approachability_regression', 'engagement_regression']

heads = {}
for h in MULTI + list(BINARY) + REGRESS:
    name = h + '-discogs-effnet-1'
    m = meta(name)
    outname = m['schema']['outputs'][0]['name']
    heads[h] = (es.TensorflowPredict2D(graphFilename=pb(name), output=outname), m['classes'])
emo = es.TensorflowPredict2D(graphFilename=pb('emomusic-msd-musicnn-2'), output='model/Identity')
emo_classes = meta('emomusic-msd-musicnn-2')['classes']


def tag(path):
    try:
        audio = es.MonoLoader(filename=path, sampleRate=SR, resampleQuality=4)()
    except RuntimeError:  # e.g. 5.1 files: let ffmpeg downmix
        raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                             capture_output=True, check=True).stdout
        audio = np.frombuffer(raw, dtype='<f4').copy()
    dur = len(audio) / SR
    if dur < 3.5:  # shorter than one model patch: nothing reliable to say
        return {'duration_s': round(dur, 2), 'skipped': 'too short'}
    emb = effnet(audio)
    r = {'duration_s': round(dur, 2)}
    for h in MULTI:
        model, classes = heads[h]
        p = model(emb).mean(axis=0)
        top = np.argsort(p)[::-1][:6]
        r[h.replace('mtg_jamendo_', '')] = [[classes[i], round(float(p[i]), 3)] for i in top]
    for h, cls in BINARY.items():
        model, classes = heads[h]
        p = model(emb).mean(axis=0)
        r[cls] = round(float(p[classes.index(cls if cls != 'danceable' else 'danceable')]), 3)
    for h in REGRESS:
        model, _ = heads[h]
        r[h.split('_')[0]] = round(float(model(emb).mean()), 3)
    p = emo(musicnn(audio)).mean(axis=0)
    for i, c in enumerate(emo_classes):
        r[c] = round(float(p[i]), 2)
    return r


res = json.load(open(out)) if os.path.exists(out) else {}
todo = []
for dp, dn, fn in os.walk(root):
    for f in sorted(fn):
        if not f.lower().endswith(('.ogg', '.wav')):
            continue
        p = os.path.join(dp, f)
        key = os.path.relpath(p, root).lower().replace('\\', '/')
        if (key in res and 'error' not in res[key]) or (only and only not in key):
            continue
        todo.append((key, p))
if limit:
    todo = todo[:limit]

t0 = time.time()
for n, (key, p) in enumerate(todo, 1):
    try:
        r = tag(p)
    except Exception as e:  # keep going; record the failure
        r = {'error': str(e)}
    r['path'] = os.path.relpath(p, root)
    res[key] = r
    if n % 10 == 0 or n == len(todo):
        with open(out, 'w') as f:
            json.dump(res, f, indent=0, sort_keys=True)
        print(f'{n}/{len(todo)}  {time.time() - t0:.0f}s', flush=True)
with open(out, 'w') as f:
    json.dump(res, f, indent=0, sort_keys=True)
