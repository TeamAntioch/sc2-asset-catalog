"""Describe StarCraft II music files by sending the audio to Gemini.

usage: GEMINI_API_KEY=... python3 -I gemini_describe.py AUDIO_ROOT OUT.json
           [--model NAME] [--limit N] [--only SUBSTR] [--workers N]

AUDIO_ROOT is your Audio folder: the game's music .ogg files, in any layout. Needs the
`google-genai` package. Resumable: files already in OUT.json (without an error) are skipped.
A file's key is its path under AUDIO_ROOT, lower case, as in audio_measure.py.

WARNING: this uploads your extracted copies of Blizzard's audio to Google. Use an API key
from a project with billing turned on: on the free tier Google may use what you send to
improve its products, and a billed project does not. Check Google's current terms first.

The model hears the audio with no file name, game or usage context, so a file's name can't
steer it. Answers follow SCHEMA.
"""
import sys, os, json, time, threading
from concurrent.futures import ThreadPoolExecutor
from google import genai
from google.genai import types

args = sys.argv[1:]
if len(args) < 2 or args[0].startswith('--') or args[1].startswith('--'):
    sys.exit(__doc__)
root, out = args[0], args[1]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
model = opt('--model', 'gemini-flash-latest')
limit = int(opt('--limit', 0)) or None
only = opt('--only')
workers = int(opt('--workers', 4))
INLINE_MAX = 14 * 1024 * 1024

PROMPT = """You are a film music supervisor cataloguing a video-game score library so
that a writer can pick cues for in-engine cutscenes. Listen to the whole cue and
describe what you actually hear. Be concrete and specific; do not guess a title,
composer or game. If it is not music (a sound effect, silence, a stinger of a few
seconds) say so in `kind`. Timestamps are mm:ss from the start."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'kind': {'type': 'string', 'enum': ['full cue', 'loop', 'stinger', 'layer/stem', 'ambient bed', 'song', 'sound effect', 'silence']},
        'summary': {'type': 'string', 'description': 'One or two sentences a mapper can scan.'},
        'mood': {'type': 'array', 'items': {'type': 'string'}, 'description': '3-6 mood words'},
        'energy': {'type': 'integer', 'description': '1 calm .. 5 full battle intensity'},
        'tension': {'type': 'integer', 'description': '1 relaxed .. 5 maximum dread/suspense'},
        'valence': {'type': 'integer', 'description': '1 dark/tragic .. 5 bright/triumphant'},
        'tempo_bpm': {'type': 'integer', 'description': 'approximate; 0 if no clear pulse'},
        'pulse': {'type': 'string', 'description': 'e.g. driving, steady march, rubato, no pulse, slow swell'},
        'instrumentation': {'type': 'array', 'items': {'type': 'string'}},
        'style': {'type': 'string', 'description': 'e.g. orchestral hybrid, southern rock, dark ambient, choral'},
        'vocals': {'type': 'string', 'description': 'none, wordless choir, solo voice, sung lyrics, ...'},
        'arc': {'type': 'string', 'description': 'how it develops start to end'},
        'sections': {'type': 'array', 'items': {'type': 'object', 'properties': {
            'start': {'type': 'string'}, 'description': {'type': 'string'}}, 'required': ['start', 'description']}},
        'opening': {'type': 'string', 'description': 'how it starts: cold hit, fade in, solo instrument...'},
        'ending': {'type': 'string', 'enum': ['hard stop', 'resolved ending', 'fade out', 'sting', 'seamless loop point', 'cuts mid-phrase']},
        'faction_feel': {'type': 'string', 'description': 'which sci-fi faction it evokes: frontier humans (gritty, rock/country, military), ancient noble aliens (choir, ethereal, sacred), swarming alien horror (organic, percussive, menacing), or none'},
        'use_for': {'type': 'array', 'items': {'type': 'string'}, 'description': 'cutscene moments it fits'},
        'avoid_for': {'type': 'array', 'items': {'type': 'string'}},
        'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']},
    },
    'required': ['kind', 'summary', 'mood', 'energy', 'tension', 'valence', 'tempo_bpm', 'pulse',
                 'instrumentation', 'style', 'vocals', 'arc', 'sections', 'opening', 'ending',
                 'faction_feel', 'use_for', 'avoid_for', 'confidence'],
}

client = genai.Client()
lock = threading.Lock()
res = json.load(open(out)) if os.path.exists(out) else {}


def audio_part(path):
    mime = 'audio/wav' if path.lower().endswith('.wav') else 'audio/ogg'
    if os.path.getsize(path) <= INLINE_MAX:
        with open(path, 'rb') as f:
            return types.Part.from_bytes(data=f.read(), mime_type=mime), None
    up = client.files.upload(file=path, config={'mime_type': mime})
    while up.state and up.state.name == 'PROCESSING':
        time.sleep(2)
        up = client.files.get(name=up.name)
    return up, up.name


def describe(path):
    part, uploaded = audio_part(path)
    try:
        for attempt in range(6):
            try:
                r = client.models.generate_content(
                    model=model, contents=[part, PROMPT],
                    config=types.GenerateContentConfig(response_mime_type='application/json',
                                                       response_schema=SCHEMA, temperature=0.2))
                d = json.loads(r.text)
                u = r.usage_metadata
                d['_tokens'] = {'in': u.prompt_token_count, 'out': u.candidates_token_count}
                return d
            except Exception as e:
                msg = str(e)
                if attempt < 5 and any(s in msg for s in ('429', '500', '503', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'deadline')):
                    time.sleep(10 * 2 ** attempt)
                    continue
                raise
    finally:
        if uploaded:
            try:
                client.files.delete(name=uploaded)
            except Exception:
                pass


def save():
    tmp = out + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(res, f, indent=1, sort_keys=True, ensure_ascii=False)
    os.replace(tmp, out)


todo = []
for dp, dn, fn in os.walk(root):
    for f in sorted(fn):
        if not f.lower().endswith(('.ogg', '.wav')):
            continue
        p = os.path.join(dp, f)
        key = os.path.relpath(p, root).lower().replace('\\', '/')
        done = res.get(key)
        if (done and 'error' not in done) or (only and only not in key):
            continue
        todo.append((key, p))
todo.sort()
if limit:
    todo = todo[:limit]
print(f'{len(todo)} files, model {model}', flush=True)

t0 = time.time()
count = [0]


def job(item):
    key, p = item
    try:
        d = describe(p)
    except Exception as e:
        d = {'error': str(e)[:500]}
    d['_model'] = model
    d['path'] = os.path.relpath(p, root)
    with lock:
        res[key] = d
        count[0] += 1
        if count[0] % 5 == 0 or count[0] == len(todo):
            save()
            print(f'{count[0]}/{len(todo)}  {time.time() - t0:.0f}s', flush=True)


with ThreadPoolExecutor(workers) as ex:
    list(ex.map(job, todo))
save()
