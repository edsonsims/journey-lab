#!/usr/bin/env python3
"""Local, reproducible narration for the user-approved seven-scene film.

No provider calls. Narration text is read verbatim from the approved JSON.
Sentence boundaries are measured; caption subphrases use proportional timing.
"""
from pathlib import Path
import hashlib, importlib.util, json, math, re, subprocess, wave
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('film_common', ROOT/'scripts/hackathon-film.py')
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
OUT = ROOT/'outputs/hackathon-film-approved'
BUILD = OUT/'build'
ASSETS = OUT/'assets'
SCRIPT = ROOT/'scripts/hackathon-film-approved.json'
C = json.loads(SCRIPT.read_text())
VOICE, RATE, SR, LENGTH = 'Samantha (English (US))', 152, 48000, 180
f.OUT, f.BUILD, f.ASSETS, f.CHAPTERS = OUT, BUILD, ASSETS, C
f.VOICE, f.RATE = VOICE, RATE


def synth(sentence):
    digest = hashlib.sha256(f'{VOICE}|{RATE}|{sentence}'.encode()).hexdigest()[:16]
    a, w = BUILD/f'voice-{digest}.aiff', BUILD/f'voice-{digest}.wav'
    if not w.exists():
        for attempt in range(3):
            try:
                subprocess.run(['say', '-v', VOICE, '-r', str(RATE), '-o', str(a), sentence], check=True, timeout=30)
                break
            except subprocess.TimeoutExpired:
                if attempt == 2: raise
                print('Retrying local speech', sentence[:45], flush=True)
        f.ff('-i', a, '-ar', SR, '-ac', 1, '-c:a', 'pcm_s16le', w)
    return w, f.duration(w)


def caption_parts(sentence):
    """Use real word boundaries and prefer a clause end near the cue limit."""
    words = sentence.split()
    chunks = []
    while words:
        if len(' '.join(words)) <= 94:
            chunks.append(' '.join(words)); break
        candidates = []
        for n in range(1, len(words)+1):
            phrase = ' '.join(words[:n])
            if len(phrase) > 94: break
            if len(phrase) < 38: continue
            natural = 25 if words[n-1].endswith((',', ':', ';', '.', '?', '!')) else 0
            if n < len(words) and words[n] in ('and', 'while', 'before', 'then', 'with', 'With', 'where'):
                natural += 13
            candidates.append((abs(len(phrase)-75)-natural, n))
        n = min(candidates)[1] if candidates else 1
        chunks.append(' '.join(words[:n])); words = words[n:]
    return chunks


def lines(text):
    if len(text) <= 48: return text
    words = text.split(); best = None
    for n in range(1, len(words)):
        left, right = ' '.join(words[:n]), ' '.join(words[n:])
        if max(len(left), len(right)) <= 50:
            score = abs(len(left)-len(right))-(4 if left.endswith((',', ':', ';')) else 0)
            if best is None or score < best[0]: best = score, left+'\n'+right
    if best is None: raise ValueError(f'Cannot fit two caption lines: {text}')
    return best[1]


def weight(text):
    # Timing within a measured sentence is approximate, not forced alignment.
    return len(re.sub(r'\s+', '', text)) + 5*len(re.findall(r'[,;:—]', text))


def main():
    for p in (OUT, BUILD, ASSETS): p.mkdir(parents=True, exist_ok=True)
    assert C[0]['start'] == 0 and C[-1]['start'] + C[-1]['duration'] == LENGTH
    for a, b in zip(C, C[1:]): assert a['start']+a['duration'] == b['start']
    cues, events, metrics = [], [], []
    for i, chapter in enumerate(C):
        sentences = re.split(r'(?<=[.!?])\s+', chapter['speech'])
        pieces = [(sentence, *synth(sentence)) for sentence in sentences]
        available = chapter['duration']-.9
        speech = sum(p[2] for p in pieces)
        speed = max(1, (speech+.28*(len(pieces)-1))/available)
        if speed > 1.10: raise RuntimeError(f'Chapter {i+1} needs too much speed adjustment: {speed:.3f}')
        gap = min(.65, max(.28, (available-speech/speed)/max(1, len(pieces)-1)))
        cursor = chapter['start']+.45
        for j, (sentence, path, duration) in enumerate(pieces):
            if speed > 1:
                fitted = BUILD/f'fit-{i}-{j}.wav'
                f.ff('-i', path, '-af', f'atempo={speed:.8f}', fitted)
                path, duration = fitted, f.duration(fitted)
            cues.append({'chapter':i, 'sentence':j, 'start':cursor, 'end':cursor+duration,
                         'text':sentence, 'audio':str(path.relative_to(ROOT))})
            events.append((cursor, path))
            cursor += duration+gap
        end = cursor-gap
        if end > chapter['start']+chapter['duration']-.2: raise RuntimeError('Narration crosses chapter')
        metrics.append({'chapter':i, 'speechSeconds':round(speech/speed,3), 'speedFactor':round(speed,7),
                        'sentenceGapSeconds':round(gap,3), 'firstSpeech':chapter['start']+.45,
                        'lastSpeech':round(end,3), 'chapterEnd':chapter['start']+chapter['duration']})
        print(f'Chapter {i+1}: {speech/speed:.2f}s spoken, tempo {speed:.4f}, final cue {end:.2f}s', flush=True)

    pcm = np.zeros(LENGTH*SR, dtype='<i2')
    for start, path in events:
        with wave.open(str(path), 'rb') as stream:
            assert stream.getframerate() == SR and stream.getsampwidth() == 2 and stream.getnchannels() == 1
            data = np.frombuffer(stream.readframes(stream.getnframes()), dtype='<i2')
        offset = round(start*SR)
        assert offset+len(data) <= len(pcm)
        pcm[offset:offset+len(data)] = data
    def write_audio(path, data):
        with wave.open(str(path), 'wb') as stream:
            stream.setnchannels(1); stream.setsampwidth(2); stream.setframerate(SR); stream.writeframes(data.tobytes())
    write_audio(OUT/'narration.wav', pcm)
    for i, chapter in enumerate(C):
        write_audio(OUT/f'narration-{i+1:02}.wav', pcm[chapter['start']*SR:(chapter['start']+chapter['duration'])*SR])

    captions=[]
    for cue in cues:
        parts = caption_parts(cue['text']); weights = [weight(p) for p in parts]; total = sum(weights)
        cursor = cue['start']
        for j, (part, part_weight) in enumerate(zip(parts, weights)):
            end = cue['end'] if j == len(parts)-1 else cursor+(cue['end']-cue['start'])*part_weight/total
            captions.append({'chapter':cue['chapter'], 'sentence':cue['sentence'], 'start':cursor, 'end':end, 'text':lines(part)})
            cursor=end
    for i, chapter in enumerate(C):
        reconstructed = ' '.join(c['text'].replace('\n',' ') for c in captions if c['chapter']==i)
        assert reconstructed == chapter['speech'], (i,reconstructed)
    assert all(0 <= cue['start'] < cue['end'] <= LENGTH for cue in captions)
    assert all(a['end'] <= b['start']+.000001 for a,b in zip(captions,captions[1:]))
    assert all(len(cue['text'].splitlines()) <= 2 and max(map(len,cue['text'].splitlines())) <= 50 for cue in captions)
    caption_body = '\n\n'.join(f'{i+1}\n{f.stamp(c["start"],",")} --> {f.stamp(c["end"],",")}\n{c["text"]}' for i,c in enumerate(captions))+'\n'
    (OUT/'captions.srt').write_text(caption_body)
    (OUT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{f.stamp(c["start"])} --> {f.stamp(c["end"])} line:90% position:50% size:90% align:center\n{c["text"]}' for c in captions)+'\n')
    (OUT/'narration-cues.json').write_text(json.dumps(cues, indent=2, ensure_ascii=False)+'\n')
    (OUT/'chapters.json').write_text(json.dumps(C, indent=2, ensure_ascii=False)+'\n')
    (OUT/'script.txt').write_text('\n\n'.join(f'{f.stamp(c["start"])} — {c["title"]}\n{c["speech"]}' for c in C)+'\n')
    peak = int(np.max(np.abs(pcm.astype(np.int32))))
    active = [int(np.count_nonzero(pcm[c['start']*SR:(c['start']+c['duration'])*SR])) for c in C]
    assert peak < 32767 and all(n > SR for n in active)
    metadata = {
        'status':'English synthetic narration generated locally from the approved script.',
        'engine':'macOS say', 'voice':VOICE, 'requestedWordsPerMinute':RATE,
        'externalProviderCalls':0, 'sampleRate':SR, 'channels':1, 'sampleFormat':'16-bit PCM',
        'durationSeconds':len(pcm)/SR, 'approvedScript':str(SCRIPT.relative_to(ROOT)),
        'approvedScriptSha256':hashlib.sha256(SCRIPT.read_bytes()).hexdigest(),
        'sentenceCues':'narration-cues.json', 'captionTiming':'Measured sentence bounds. Long sentence subphrases are proportionally timed by text weight; not forced word alignment.',
        'captionCount':len(captions), 'captionMaximumLines':2, 'captionMaximumLineCharacters':50,
        'exactTextCoverageVerified':True, 'noChapterOverflowVerified':True,
        'peakPcm':peak, 'peakDbfs':round(20*math.log10(peak/32768),3),
        'clippedSamples':int(np.count_nonzero(np.abs(pcm.astype(np.int32))>=32767)),
        'chapterNonzeroSamples':active, 'chapters':metrics,
        'checks':'Automated duration, sample level, exact text coverage, caption layout and chapter bounds checks; not a human listening review.'
    }
    (OUT/'voice.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'duration':metadata['durationSeconds'], 'captions':len(captions), 'peakDbfs':metadata['peakDbfs'], 'checks':'passed'}), flush=True)


if __name__ == '__main__': main()
