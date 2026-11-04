#!/usr/bin/env python3
"""Audit the approved Journey Lab film without changing its media.

Writes outputs/hackathon-film-approved/verification.json. Full MP4 decode is
opt-in with --decode. Authored subtitle line counts are checked; visual wrapping,
editorial synchronization, and human listening remain separate review steps.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
import wave

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/hackathon-film-approved'
APPROVED = ROOT / 'scripts/hackathon-film-approved.json'
LENGTH = 180.0
checks: list[dict] = []
skipped: list[str] = []


def check(name, passed, **details):
    checks.append({'name': name, 'passed': bool(passed), **details})


def command(args):
    return subprocess.run([str(x) for x in args], capture_output=True, text=True)


def read_json(path):
    return json.loads(path.read_text())


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def normalized(text):
    # Treat punctuation and whitespace as boundaries, preserving every word.
    text = re.sub(r'<[^>]*>', '', str(text))
    return re.findall(r'[^\W_]+', unicodedata.normalize('NFKC', text).casefold())


def timecode(value):
    parts = value.replace(',', '.').split(':')
    if len(parts) == 3:
        hours, minutes, seconds = parts
    elif len(parts) == 2:
        hours, minutes, seconds = '0', *parts
    else:
        raise ValueError('Invalid subtitle timestamp: ' + value)
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def subtitle_cues(path):
    cues = []
    text = path.read_text().replace('\r\n', '\n').lstrip('\ufeff')
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = block.splitlines()
        timing = next((i for i, line in enumerate(lines) if '-->' in line), None)
        if timing is None:
            continue
        found = re.match(r'^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)', lines[timing])
        if not found:
            raise ValueError('Invalid subtitle cue: ' + lines[timing])
        body = [line for line in lines[timing + 1:] if line.strip()]
        cues.append({'start': timecode(found[1]), 'end': timecode(found[2]),
                     'text': '\n'.join(body), 'lines': len(body)})
    return cues


def valid_timeline(cues):
    return bool(cues) and all(
        math.isfinite(float(c['start'])) and math.isfinite(float(c['end']))
        and 0 <= float(c['start']) < float(c['end']) <= LENGTH + .001
        and (i == 0 or float(c['start']) >= float(cues[i - 1]['end']) - .001)
        for i, c in enumerate(cues)
    )


def probe_file(name):
    p = command(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', OUT / name])
    if p.returncode:
        check(name + ' readable container', False, error=p.stderr.strip())
        return
    media = json.loads(p.stdout)
    streams = media.get('streams', [])
    duration = float(media.get('format', {}).get('duration', -1))
    video = next((s for s in streams if s.get('codec_type') == 'video'), {})
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), {})
    subtitles = [s for s in streams if s.get('codec_type') == 'subtitle']
    fps = video.get('avg_frame_rate', video.get('r_frame_rate', '0/1'))
    try:
        fps_number = float(Fraction(fps))
    except (ValueError, ZeroDivisionError):
        fps_number = -1
    check(name + ' duration is 180 seconds', abs(duration - LENGTH) <= .05, durationSeconds=duration)
    check(name + ' 1080p H.264 at 30 fps', video.get('width') == 1920 and video.get('height') == 1080
          and video.get('codec_name') == 'h264' and abs(fps_number - 30) < .001,
          width=video.get('width'), height=video.get('height'), codec=video.get('codec_name'), fps=fps)
    check(name + ' stereo AAC audio', audio.get('codec_name') == 'aac' and audio.get('channels') == 2
          and int(audio.get('sample_rate', 0)) == 48000,
          codec=audio.get('codec_name'), channels=audio.get('channels'), sampleRate=audio.get('sample_rate'))
    if name == 'film.mp4':
        check('clean MP4 has English selectable subtitles', any(
            s.get('codec_name') == 'mov_text' and s.get('tags', {}).get('language') == 'eng' for s in subtitles))
    else:
        check('burned-caption MP4 avoids a duplicate subtitle stream', not subtitles)
    title = media.get('format', {}).get('tags', {}).get('title', '')
    check(name + ' avoids stale cut metadata', 'Review cut 01' not in title and 'Review cut 02' not in title,
          title=title)


def validate_script():
    approved = read_json(APPROVED)
    check('seven approved chapters total 180 seconds', len(approved) == 7
          and sum(c['duration'] for c in approved) == LENGTH
          and all(c['start'] == sum(x['duration'] for x in approved[:i]) for i, c in enumerate(approved)))
    chapters = read_json(OUT / 'chapters.json')
    check('exported chapters exactly match approved script', chapters == approved)
    approved_words = normalized(' '.join(c['speech'] for c in approved))
    cues = read_json(OUT / 'narration-cues.json')
    check('narration cues preserve all approved words', normalized(' '.join(c['text'] for c in cues)) == approved_words,
          approvedWordCount=len(approved_words), cueCount=len(cues))
    check('narration cues are ordered, bounded, and nonoverlapping', valid_timeline(cues))
    if all('chapter' in c for c in cues):
        for i, chapter in enumerate(approved):
            chapter_cues = [c for c in cues if c['chapter'] == i]
            check('chapter ' + str(i + 1) + ' preserves its approved text',
                  normalized(' '.join(c['text'] for c in chapter_cues)) == normalized(chapter['speech']))
            check('chapter ' + str(i + 1) + ' narration stays within scene', bool(chapter_cues)
                  and all(chapter['start'] <= c['start'] < c['end'] <= chapter['start'] + chapter['duration'] + .001
                          for c in chapter_cues))
    expected_script = '\n\n'.join(
        f'{int(c["start"]) // 3600:02}:{int(c["start"]) // 60 % 60:02}:{int(c["start"]) % 60:02}.000 — {c["title"]}\n{c["speech"]}'
        for c in approved)
    script = (OUT / 'script.txt').read_text()
    check('script TXT preserves approved chapter text', normalized(script) == normalized(expected_script))
    authored = {}
    for name in ['captions.srt', 'captions.vtt']:
        parsed = subtitle_cues(OUT / name)
        authored[name] = parsed
        check(name + ' preserves approved words', normalized(' '.join(c['text'] for c in parsed)) == approved_words)
        check(name + ' times are bounded and nonoverlapping', valid_timeline(parsed), cueCount=len(parsed))
        check(name + ' authored cues use at most two lines', bool(parsed) and all(1 <= c['lines'] <= 2 for c in parsed),
              maximumLines=max((c['lines'] for c in parsed), default=0))
    check('SRT and VTT share cue timings and text', len(authored['captions.srt']) == len(authored['captions.vtt'])
          and all(abs(a['start'] - b['start']) <= .001 and abs(a['end'] - b['end']) <= .001
                  and normalized(a['text']) == normalized(b['text'])
                  for a, b in zip(authored['captions.srt'], authored['captions.vtt'])))
    player = (OUT / 'index.html').read_text()
    match = re.search(r'const fallbackChapters = (\[.*?\]);', player, re.S)
    embedded = json.loads(match[1]) if match else None
    check('player embeds the seven approved chapters and transcript', embedded == approved)
    check('player describes this cut and local synthetic voice',
          'Approved script cut' in player and 'Locally synthesized narration' in player
          and 'ElevenLabs' not in player and 'Review cut 01' not in player and 'Review cut 02' not in player)


def validate_audio():
    with wave.open(str(OUT / 'narration.wav'), 'rb') as stream:
        channels, rate, width = stream.getnchannels(), stream.getframerate(), stream.getsampwidth()
        duration = stream.getnframes() / rate
        raw = stream.readframes(stream.getnframes())
    check('narration PCM format and 180-second duration', channels == 1 and rate == 48000 and width == 2
          and abs(duration - LENGTH) <= .001, channels=channels, sampleRate=rate, sampleBytes=width, durationSeconds=duration)
    if width != 2:
        check('narration amplitude analysis', False, error='Expected 16-bit PCM narration')
        return
    samples = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    peak = float(np.abs(samples).max()) if samples.size else 0
    rms = float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0
    clipped = int(np.count_nonzero(np.abs(samples) >= 32767 / 32768))
    check('narration is non-silent and unclipped', rms > .001 and clipped == 0,
          peakDb=20 * math.log10(max(peak, 1e-20)), rmsDb=20 * math.log10(max(rms, 1e-20)), clippedSamples=clipped)
    for i, c in enumerate(read_json(APPROVED)):
        section = samples[round(c['start'] * rate) * channels:round((c['start'] + c['duration']) * rate) * channels]
        energy = float(np.sqrt(np.mean(section ** 2))) if section.size else 0
        check('chapter ' + str(i + 1) + ' has narration audio', energy > .001, rms=energy)
    p = command(['ffmpeg', '-hide_banner', '-i', OUT / 'film.mp4', '-map', '0:a',
                 '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-'])
    peaks = re.findall(r'Peak level dB: ([^\s]+)', p.stderr)
    levels = re.findall(r'RMS level dB: ([^\s]+)', p.stderr)
    peak_db = float(peaks[-1]) if peaks else -999
    rms_db = float(levels[-1]) if levels else -999
    check('final audio is non-silent and below clipping', p.returncode == 0 and bool(peaks) and bool(levels)
          and -55 < rms_db < -1 and -100 < peak_db < 0,
          peakDb=peak_db, rmsDb=rms_db, error=p.stderr[-1200:] if p.returncode else '')


def validate_hashes():
    path = OUT / 'source-manifest.json'
    if not path.exists():
        skipped.append('Source/export hash verification: source-manifest.json not yet available')
        return
    manifest = read_json(path)
    source_hashes = manifest.get('sourceHashes', {})
    mismatches = []
    for name, expected in source_hashes.items():
        path = Path(name) if Path(name).is_absolute() else ROOT / name
        actual = digest(path) if path.is_file() else None
        if actual != expected:
            mismatches.append({'path': name, 'exists': path.is_file(), 'actual': actual, 'expected': expected})
    check('manifest source hashes match current files', bool(source_hashes) and not mismatches,
          count=len(source_hashes), mismatches=mismatches)
    for name, spec in manifest.get('exports', {}).items():
        path = OUT / name
        expected = spec.get('sha256') if isinstance(spec, dict) else spec
        check(name + ' matches manifest hash', path.is_file() and bool(expected) and digest(path) == expected)


def decode(name):
    p = command(['ffmpeg', '-v', 'error', '-i', OUT / name, '-map', '0:v', '-map', '0:a', '-f', 'null', '-'])
    return name, p.returncode == 0 and not p.stderr.strip(), p.stderr.strip()


def phase(name, function):
    try:
        function()
    except Exception as error:
        check(name + ' completed', False, error=type(error).__name__ + ': ' + str(error))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decode', action='store_true', help='Also decode all video/audio frames in both MP4 files')
    args = parser.parse_args()
    phase('Clean MP4 probe', lambda: probe_file('film.mp4'))
    phase('Captioned MP4 probe', lambda: probe_file('film-captioned.mp4'))
    phase('Script and captions verification', validate_script)
    phase('Audio verification', validate_audio)
    phase('Manifest verification', validate_hashes)
    if args.decode:
        with ThreadPoolExecutor(max_workers=2) as pool:
            for name, passed, error in pool.map(decode, ['film.mp4', 'film-captioned.mp4']):
                check(name + ' full audio/video decode', passed, error=error)
    else:
        skipped.append('Full frame decode: run with --decode to enable')
    report = {
        'scope': 'Approved script preservation, container format, authored caption cues, audio levels, and source/export hashes.',
        'limits': ['Does not establish human listening acceptance or editorial synchronization.',
                   'Two-line caption verification covers authored cue lines; visual wrapping must be checked in the rendered picture.'],
        'outputDirectory': str(OUT), 'approvedScript': str(APPROVED),
        'checks': checks, 'skippedChecks': skipped,
        'passed': bool(checks) and all(c['passed'] for c in checks),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    destination = OUT / 'verification.json'
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'report': str(destination), 'passed': report['passed'], 'checks': len(checks),
                      'failed': [c for c in checks if not c['passed']], 'skippedChecks': skipped}, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
