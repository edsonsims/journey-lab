#!/usr/bin/env python3
"""Reproducible 180-second review cut using macOS speech and retained evidence.

No model calls, candidate approval, uploads, or changes to evidence records.
Run --preview for storyboard frames; --reuse reuses hash-matched chapter renders.
Picture, narration, original instrumental bed and captions remain separate.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, json, math, re, shutil, subprocess, wave
from PIL import Image, ImageDraw, ImageFont, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/hackathon-film-v1'
BUILD = OUT / 'build'
ASSETS = OUT / 'assets'
CHAPTERS = json.loads((ROOT / 'scripts/hackathon-film.json').read_text())
W, H, FPS, LENGTH = 1920, 1080, 30, 180
VOICE, RATE = 'Samantha (English (US))', 148
BG, PANEL, WHITE, MUTED = '#15131e', '#242130', '#f6f4fb', '#b2aabd'
PURPLE, LIME, RED, GREEN = '#b19aff', '#d9f67a', '#ffb2a4', '#a8e1c1'
FONT = '/System/Library/Fonts/Avenir Next.ttc'
MONO = '/System/Library/Fonts/Menlo.ttc'
IDS = {
    'alex': 'be5e68ff-faae-495a-9269-8fb198b1a19d',
    'maya': '49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc',
    'before': 'ea312038-a7e1-4169-a661-32ffb884503b',
    'after': 'de304bc2-6ccd-422a-a5d3-2a4cdacb1e0d',
    'alex_after': 'e7b0aa37-20ec-4a84-b2cc-fa86fd20bd12',
}
RUNS, SOURCES, CLIPS, CUES = {}, {}, {}, []
FONT_CACHE = {}

def run(cmd):
    subprocess.run([str(v) for v in cmd], check=True)

def ff(*args):
    run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args])

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def source(path):
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    key = str(path.relative_to(ROOT))
    if key not in SOURCES:
        SOURCES[key] = sha(path)
    return path

def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                 'format=duration', '-of', 'csv=p=0', str(path)]))

def font(size, bold=False, mono=False):
    key = size, bold, mono
    if key not in FONT_CACHE:
        FONT_CACHE[key] = ImageFont.truetype(MONO if mono else FONT, size,
                                           index=0 if bold or mono else 7)
    return FONT_CACHE[key]

def txt(im, xy, value, size=30, color=WHITE, bold=False, width=None, mono=False):
    d = ImageDraw.Draw(im)
    lines = []
    for para in str(value).split('\n'):
        line = ''
        for word in para.split():
            proposed = (line + ' ' + word).strip()
            if width and d.textlength(proposed, font=font(size, bold, mono)) > width and line:
                lines.append(line)
                line = word
            else:
                line = proposed
        lines.append(line)
    d.multiline_text(xy, '\n'.join(lines), font=font(size, bold, mono),
                    fill=color, spacing=max(4, size // 6))

def box(im, rect, color=PANEL, radius=22, outline=None):
    ImageDraw.Draw(im).rounded_rectangle(rect, radius, fill=color, outline=outline, width=2)

def pill(im, x, y, value, color=PURPLE):
    w = ImageDraw.Draw(im).textlength(value, font=font(21, True)) + 36
    box(im, (x,y,x+w,y+40), '#302a42', 20)
    txt(im, (x+18,y+4), value, 21, color, True)
    return w

def arrow(im, x1, y, x2, color=PURPLE, width=5):
    d=ImageDraw.Draw(im)
    d.line((x1,y,x2,y),fill=color,width=width)
    d.line((x2-14,y-12,x2,y,x2-14,y+12),fill=color,width=width)

def base(ch, title, eyebrow=None):
    im=Image.new('RGB',(W,H),BG)
    d=ImageDraw.Draw(im)
    for x,y,h in [(64,32,25),(80,23,34),(96,17,40)]:
        d.rounded_rectangle((x,y,x+10,y+h),3,fill=PURPLE)
    txt(im,(128,18),'journeylab',30,WHITE,True)
    txt(im,(1515,27),f'META AI HACKATHON   /   {ch+1:02d}',20,MUTED,True)
    d.line((64,79,1856,79),fill='#393344',width=1)
    if eyebrow: txt(im,(64,108),eyebrow,22,PURPLE,True)
    if title: txt(im,(64,153),title,59,WHITE,True,width=1792)
    # The last 100 pixels belong exclusively to captions.
    d.rectangle((0,978,W,H),fill='#100e17')
    return im

def screenshot(im, filename, rect, crop=None):
    p=source(ASSETS/filename)
    image=Image.open(p).convert('RGB')
    if crop:image=image.crop(crop)
    x,y,w,h=rect
    image=ImageOps.contain(image,(w,h),Image.Resampling.LANCZOS)
    x+=(w-image.width)//2;y+=(h-image.height)//2
    box(im,(x-3,y-3,x+image.width+3,y+image.height+3),'#6a607c',14)
    im.paste(image,(x,y))

def frame_at(key,t):
    p=source(ROOT/'journey-engine/runs'/IDS[key]/'journey.webm')
    dest=BUILD/f'{key}-{t:.3f}.png'
    if not dest.exists():ff('-ss',t,'-i',p,'-frames:v',1,dest)
    return Image.open(dest).convert('RGB')

def stamp(t,sep='.'):
    ms=round(t*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'

def audio():
    global CUES
    CUES=[]
    audio_files=[]
    for i,c in enumerate(CHAPTERS):
        sentences=re.split(r'(?<=[.!?])\s+',c['speech'])
        pieces=[]
        for sentence in sentences:
            digest=hashlib.sha256(f'{VOICE}|{RATE}|{sentence}'.encode()).hexdigest()[:16]
            a=BUILD/f'voice-{digest}.aiff';w=BUILD/f'voice-{digest}.wav'
            if not w.exists():
                # The local speech service occasionally stalls between requests.
                for attempt in range(3):
                    try:
                        subprocess.run(['say','-v',VOICE,'-r',str(RATE),'-o',str(a),sentence],check=True,timeout=30)
                        break
                    except subprocess.TimeoutExpired:
                        if attempt==2:raise
                        print('Retrying stalled local speech sentence',i+1,sentence[:35],flush=True)
                ff('-i',a,'-ar',48000,'-ac',1,'-c:a','pcm_s16le',w)
            pieces.append((sentence,w,duration(w)))
        available=c['duration']-.9
        speech=sum(v[2] for v in pieces)
        speed=max(1,(speech+.22*(len(pieces)-1))/available)
        if speed>1.12:raise RuntimeError(f'Chapter {i+1} narration would be rushed: {speed}')
        gap=min(.70,max(.18,(available-speech/speed)/max(1,len(pieces)-1)))
        cursor=c['start']+.45
        for j,(sentence,w,dur) in enumerate(pieces):
            if speed>1:
                adjusted=BUILD/f'fit-{i}-{j}.wav'
                ff('-i',w,'-af',f'atempo={speed:.8f}',adjusted)
                w=adjusted;dur=duration(w)
            CUES.append({'chapter':i,'sentence':j,'start':cursor,'end':cursor+dur,
                         'text':sentence,'audio':str(w.relative_to(ROOT))})
            audio_files.append((cursor,w))
            cursor+=dur+gap
        if cursor-gap>c['start']+c['duration']-.2:raise RuntimeError('Audio crosses chapter')
        print(f'Voice {i+1}: speech {speech/speed:.1f}s / chapter {c["duration"]}s',flush=True)
    pcm=bytearray(LENGTH*48000*2)
    for start,w in audio_files:
        with wave.open(str(w),'rb') as f:data=f.readframes(f.getnframes())
        offset=round(start*48000)*2;pcm[offset:offset+len(data)]=data
    with wave.open(str(OUT/'narration.wav'),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(48000);f.writeframes(pcm)
    for i,c in enumerate(CHAPTERS):
        with wave.open(str(OUT/f'narration-{i+1:02}.wav'),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(48000)
            f.writeframes(pcm[c['start']*96000:(c['start']+c['duration'])*96000])
    (OUT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(
        f'{stamp(c["start"])} --> {stamp(c["end"])} line:90% position:50% size:90% align:center\n{c["text"]}' for c in CUES)+'\n')
    (OUT/'captions.srt').write_text('\n\n'.join(
        f'{i+1}\n{stamp(c["start"],",")} --> {stamp(c["end"],",")}\n{c["text"]}' for i,c in enumerate(CUES))+'\n')
    (OUT/'narration-cues.json').write_text(json.dumps(CUES,indent=2,ensure_ascii=False)+'\n')
    (OUT/'voice-replacement.json').write_text(json.dumps({
        'status':'Temporary Mac narration; ElevenLabs is deferred until edit approval.',
        'picture':'picture.mp4','music':'music.wav','currentNarration':'narration.wav',
        'chapters':CHAPTERS,'sentenceCues':'narration-cues.json',
        'instructions':'Record or generate the approved text, align the new voice, then regenerate captions from its measured timing. Do not reuse Mac cue timing as an alignment guarantee.'
    },indent=2,ensure_ascii=False)+'\n')

def onset(ch,sentence):
    return next(v['start']-CHAPTERS[ch]['start'] for v in CUES if v['chapter']==ch and v['sentence']==sentence)

def music():
    """A quiet original synthesised pad, kept as an independent editable stem."""
    sr=48000;n=LENGTH*sr
    t=np.arange(n,dtype=np.float64)/sr
    stereo=np.zeros((n,2),dtype=np.float32)
    # A minor / Fmaj7 / C / G, a slow 24-second harmonic cycle.
    chords=[[110,164.8138,220,261.6256],[87.3071,130.8128,174.6141,220],
            [130.8128,195.9977,261.6256,329.6276],[97.9989,146.8324,195.9977,246.9417]]
    for start in range(0,LENGTH,12):
        length=min(15,LENGTH-start);a=start*sr;b=a+length*sr;u=t[a:b]-start
        env=np.minimum(1,u/2.5)*np.minimum(1,(length-u)/3)
        for j,freq in enumerate(chords[(start//12)%4]):
            pad=(np.sin(2*np.pi*freq*u)+.18*np.sin(2*np.pi*freq*2*u))
            pad*=env*.0065*(.90+.10*np.sin(2*np.pi*.13*u+j))
            stereo[a:b,0]+=pad*(.78+.06*j)
            stereo[a:b,1]+=pad*(.96-.06*j)
    fade=np.minimum(1,t/3)*np.minimum(1,(LENGTH-t)/4)
    stereo*=fade[:,None]
    with wave.open(str(OUT/'music.wav'),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr)
        f.writeframes((np.clip(stereo,-1,1)*32767).astype('<i2').tobytes())

def prepare_clip(name,key,segments,size,crop=None):
    """Segments: (originalStart, originalEnd, filmDuration); equal ends are holds."""
    path=source(ROOT/'journey-engine/runs'/IDS[key]/'journey.webm')
    spec={'prepareVersion':2,'name':name,'runId':IDS[key],'source':str(path.relative_to(ROOT)),
          'segments':segments,'size':size,'crop':crop}
    digest=hashlib.sha256(json.dumps(spec,sort_keys=True).encode()+SOURCES[str(path.relative_to(ROOT))].encode()).hexdigest()[:16]
    dest=BUILD/f'{name}-{digest}.mp4'
    if not dest.exists():
        filters=[]
        for j,(a,b,seconds) in enumerate(segments):
            if b>a:
                f=f'[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)*{seconds/(b-a)}'
            else:
                # Establish frame rate before padding a single VFR WebM frame.
                f=f'[0:v]trim=start={a},setpts=PTS-STARTPTS,fps={FPS},trim=end_frame=1,tpad=stop_mode=clone:stop_duration={seconds}'
            if crop:f+=f',crop={crop[2]}:{crop[3]}:{crop[0]}:{crop[1]}'
            f+=f',scale={size[0]}:{size[1]},fps={FPS},setsar=1,trim=duration={seconds}[v{j}]'
            filters.append(f)
        filters.append(''.join(f'[v{j}]' for j in range(len(segments)))+f'concat=n={len(segments)}:v=1:a=0[out]')
        ff('-i',path,'-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264',
           '-preset','fast','-crf',17,'-pix_fmt','yuv420p','-threads',2,dest)
    expected=sum(s[2] for s in segments)
    if abs(duration(dest)-expected)>1/FPS+.005:
        raise RuntimeError(f'Prepared clip duration mismatch: {name}')
    CLIPS[name]={**spec,'prepared':dest,'duration':expected}
    return name

def images_and_clips():
    # Snapshot UI assets before editing so concurrent interface work cannot change this cut.
    for name in ['personas','journeys','emotions','impact']:
        origin=source(ROOT/f'journey-workspace/src/assets/dashboard-features/{name}.jpg')
        target=ASSETS/f'{name}.jpg'
        if not target.exists():shutil.copy2(origin,target)
    for name,path in [
        ('experience.png','outputs/experience-moment-navigation/experience-simplified-details.png'),
        ('finding-source.jpg','outputs/finding-summary-emphasis/name-heading.jpg'),
        ('parent-phone.png','journey-engine/runs/8b881bbf-a4f7-4bb5-aa7f-c56f35ff076c/screen-026.png')]:
        if not (ASSETS/name).exists():shutil.copy2(source(ROOT/path),ASSETS/name)
    source(ROOT/'journey-engine/runs/8b881bbf-a4f7-4bb5-aa7f-c56f35ff076c/run.json')
    for key in list(IDS):
        p=source(ROOT/'journey-engine/runs'/IDS[key]/'run.json')
        RUNS[key]=json.loads(p.read_text())
    # The plan has no fictional founder shot. Actual interface and editorial typography introduce the builder.
    c2=onset(3,2);c3=onset(3,3);c4=onset(3,4)
    prepare_clip('alex-flow','alex',[(6.2,25.4,c2)],(1190,690),(80,160,1280,742))
    prepare_clip('maya-choice','maya',[(5.8,10.8,c3-c2)],(1190,690),(80,160,1280,742))
    prepare_clip('maya-price','maya',[(20.2,23.197,2),(23.197,23.197,max(.1,c4-c3-2))],(1190,690),(80,160,1280,742))
    prepare_clip('maya-name','maya',[(35.6,42.770,27-c4)],(1190,690),(80,160,1280,742))
    prepare_clip('before','before',[(17.597,22.597,5),(22.597,22.597,8),(22.597,34.597,12)],(872,518),(140,180,1160,690))
    prepare_clip('after','after',[(15.156,20.156,5),(20.156,20.156,8),(20.156,32.156,12)],(872,518),(140,180,1160,690))

def build_layouts():
    layouts={}
    im=base(0,'Same outcome. Different experience.','THE EXPERIENCE BEHIND A SUCCESS')
    for x,key,t,name,color in [(64,'alex',22.237,'Alex',GREEN),(984,'maya',53.647,'Maya',RED)]:
        pill(im,x,245,f'{name.upper()}  /  BOOKING CONFIRMED',color)
        frame=frame_at(key,t).crop((140,180,1300,870)).resize((872,518),Image.Resampling.LANCZOS)
        box(im,(x-3,307,x+875,831),'#655a78',14);im.paste(frame,(x,310))
    txt(im,(64,865),'A quick path.',44,GREEN,True)
    txt(im,(984,865),'A price surprise. Repeated work.',39,RED,True)
    txt(im,(64,940),'Recorded AI persona journeys  /  Gather is a fictional booking app',19,MUTED)
    layouts['hook']=im
    for key,filename,title,body in [
        ('intro','home.jpg','Understand the experience.','Built during the hackathon by Edson Henrique.'),
        ('persona-ui','personas.jpg','Start with a perspective.','Goals. Knowledge. Expectations. Constraints.'),
        ('journeys-ui','journeys.jpg','Follow what happens.','Real browser journeys. Inspectable evidence.')]:
        im=base(1,title,'MEET JOURNEY LAB')
        screenshot(im,filename,(660,270,1196,670))
        txt(im,(64,310),'One product.\nMany journeys.',68,WHITE,True,width=570)
        txt(im,(64,535),body,32,MUTED,width=515)
        for j,label in enumerate(['01   Explore','02   Understand','03   Improve & retest']):
            txt(im,(64,730+j*63),label,29,PURPLE,True)
        layouts[key]=im
    im=base(2,'The same task. Different constraints.','GATHER / OUR EXAMPLE BOOKING APP')
    for x,name,role,budget,priority,color in [(64,'Alex','Executive assistant','$350','Keep the booking quick.',GREEN),
                                           (984,'Maya','Office coordinator','$250','Stay within the full budget.',PURPLE)]:
        box(im,(x,285,x+872,815),PANEL,30)
        pill(im,x+34,319,'AI PERSONA',color)
        txt(im,(x+34,390),name,80,color,True)
        txt(im,(x+34,492),role,34,WHITE)
        txt(im,(x+34,555),budget,120,WHITE,True)
        txt(im,(x+34,720),priority,32,MUTED)
    txt(im,(64,870),'12 people   ·   Projector   ·   Quarterly planning',42,WHITE,True)
    layouts['people']=im
    for name,title,metric,body,color in [
        ('alex-flow','A quick path for Alex.','$280','Within his $350 budget.',GREEN),
        ('maya-choice','Maya starts with the lower rate.','$220','The room rate looks affordable.',PURPLE),
        ('maya-price','The full total arrives late.','$280','Her full budget is $250.',RED),
        ('maya-name','Changing rooms loses her work.','Again.','The meeting name is empty.\nShe enters it a second time.',RED)]:
        im=base(3,title,'MUSE WONDER / RECORDED BROWSER JOURNEY')
        txt(im,(64,325),metric,105,color,True)
        txt(im,(64,480),body,36,WHITE,width=500)
        txt(im,(64,750),'Different context.\nDifferent experience.',32,MUTED,width=510)
        box(im,(647,242,1859,946),'#655a78',20)
        txt(im,(64,942),'Original recordings · Editorial excerpts; model waits may be trimmed',18,MUTED)
        layouts[name]=im
    im=base(4,'Success hides the extra work.','FROM REACTION TO EVIDENCE')
    screenshot(im,'emotions.jpg',(730,280,1126,675))
    txt(im,(64,325),'12 actions.\nGoal reached.',70,WHITE,True)
    txt(im,(64,540),'Yet her journey contains\nprice uncertainty and\nrepeated input.',34,MUTED,width=590)
    pill(im,64,790,'RECORDED AI PERSONA REACTIONS')
    layouts['arc']=im
    im=base(4,'Go straight to the moment.','INSPECT THE ORIGINAL EVIDENCE')
    screenshot(im,'experience.png',(570,260,1286,690))
    txt(im,(64,320),'22.597s',81,PURPLE,True)
    txt(im,(64,465),'The full price\nexceeds her limit.',42,WHITE,True,width=460)
    txt(im,(64,682),'Reaction. Screen.\nOriginal recording.\nConnected.',34,MUTED,width=470)
    layouts['evidence']=im
    im=base(5,'Turn feedback into an improvement.','MUSE CODE / REVIEWABLE CANDIDATE')
    screenshot(im,'candidate.jpg',(620,280,1236,670))
    txt(im,(64,330),'The finding\nbecomes a fix.',63,WHITE,True,width=520)
    txt(im,(64,560),'A candidate you can inspect\nand retest before approval.',31,MUTED,width=510)
    pill(im,64,790,'AWAITING HUMAN REVIEW',LIME)
    layouts['candidate']=im
    im=base(5,'Two focused changes.','ACTUAL MUSE CODE PATCH / app.js')
    box(im,(64,280,1856,555),PANEL,26)
    txt(im,(96,310),'Show the all-in total before choosing',34,WHITE,True)
    box(im,(96,377,1824,445),'#482b37',12)
    txt(im,(118,390),'- const shown=QUICK_BOOKING?room.base:total(room);',31,RED,mono=True)
    box(im,(96,461,1824,529),'#293c33',12)
    txt(im,(118,475),'+ const shown=total(room);',31,GREEN,mono=True)
    for x,n,title,desc in [(64,'01','Make the cost clear','Atlas $280 · Willow $245'),
                         (675,'02','Keep the meeting name','Removed both reset guards'),
                         (1286,'03','Preserve the quick path','Quick booking remains enabled')]:
        box(im,(x,602,x+570,843),PANEL,24)
        txt(im,(x+28,627),n,27,PURPLE,True)
        txt(im,(x+28,682),title,32,WHITE,True,width=515)
        txt(im,(x+28,755),desc,25,MUTED,width=515)
    txt(im,(64,900),'16 independent browser checks passed · Candidate awaits review',29,LIME,True)
    layouts['code']=im
    im=base(6,'Watch the difference.','FRESH SESSIONS / MAYA')
    pill(im,1460,155,'12 TO 6 ACTIONS',LIME)
    for x,label,color in [(64,'BEFORE / QUICK BOOKING',RED),(984,'AFTER / FIXED CANDIDATE',GREEN)]:
        pill(im,x,228,label,color)
        box(im,(x-3,282,x+875,806),'#655a78',15)
    layouts['pair']=im
    im=base(6,'Every comparison leads back to evidence.','CHANGE IMPACT / ACTUAL JOURNEY LAB WORKSPACE')
    screenshot(im,'impact.jpg',(470,260,1386,695))
    txt(im,(64,330),'Both\nperspectives.\nIn view.',59,WHITE,True,width=370)
    txt(im,(64,650),'Paired recordings.\nFull reaction arcs.\nInspectable moments.',29,MUTED,width=370)
    layouts['impact-overview']=im
    for key,filename,title,body in [
        ('breadth','journeys.jpg','More perspectives in view.','Help a small team explore\nwhat different people need.'),
        ('parent','parent-phone.png','A parent on a phone.','LittleSteps / another example\nA phone. Limited time. No printer.'),
        ('perspectives','personas.jpg','Let context shape what you build.','A first-time customer.\nA strict budget.\nA different starting point.')]:
        im=base(7,title,'THE AMBITION / EVERYDAY PRODUCT DEVELOPMENT')
        screenshot(im,filename,(650,270,1206,680))
        txt(im,(64,345),body,40,WHITE,True,width=535)
        txt(im,(64,750),'Find friction earlier.\nBring better questions\nto real user research.',31,MUTED,width=520)
        layouts[key]=im
    im=base(8,'')
    txt(im,(64,195),'One product.',120,WHITE,True)
    txt(im,(64,350),'Many journeys.',120,LIME,True)
    txt(im,(64,585),'Build with more perspectives in view.',51,WHITE,True)
    for x,s in [(64,'MUSE WONDER'),(520,'MUSE CODE'),(970,'RETEST')]:pill(im,x,735,s,PURPLE)
    arrow(im,330,755,470);arrow(im,765,755,920)
    txt(im,(64,895),'Journey Lab · Built by Edson Henrique · Meta Global AI Developer Hackathon',25,MUTED)
    layouts['end']=im
    return layouts

def layout_key(i,t):
    if i==0:return 'hook'
    if i==1:return 'intro' if t<onset(1,1) else 'persona-ui' if t<onset(1,2) else 'journeys-ui'
    if i==2:return 'people'
    if i==3:
        return 'alex-flow' if t<onset(3,2) else 'maya-choice' if t<onset(3,3) else 'maya-price' if t<onset(3,4) else 'maya-name'
    if i==4:return 'arc' if t<onset(4,3) else 'evidence'
    if i==5:return 'candidate' if t<onset(5,1)+2 else 'code'
    if i==6:return 'pair' if t<onset(6,5) else 'impact-overview'
    if i==7:return 'breadth' if t<onset(7,1) else 'parent' if t<onset(7,3) else 'perspectives'
    return 'end'

VAL={'very_negative':-2,'negative':-1,'neutral':0,'positive':1,'very_positive':2}

def paired_overlay(im,t):
    # Only the review anchor asserts equivalence; the complete curves show observation progress.
    delta=t if t<5 else 5 if t<13 else t-8
    for x,key,anchor,color in [(64,'before',17.597,'#b9b2c6'),(984,'after',15.156,PURPLE)]:
        clock=anchor+delta;signals=RUNS[key]['experience']
        selected=max([j for j,s in enumerate(signals) if s['videoMs']/1000<=clock+.025],default=0)
        txt(im,(x+700,235),f'{clock:06.3f}s',18,WHITE,True)
        reaction=signals[selected]['reaction']
        txt(im,(x+10,817),reaction,20,WHITE,width=852)
        d=ImageDraw.Draw(im);left=x+24;right=x+850;top=883;bottom=950
        for val,col in [(2,'#27382f'),(1,'#29342e'),(0,'#302d38'),(-1,'#3d3031'),(-2,'#462e37')]:
            yy=top+(2-val)*12;d.rectangle((left,yy,right,yy+12),fill=col)
        pts=[(left+j/max(1,len(signals)-1)*(right-left),top+(2-VAL[s['valence']])*12+6) for j,s in enumerate(signals)]
        d.line(pts,fill=color,width=3)
        for j,(px,py) in enumerate(pts):
            r=6 if j==selected else 3
            d.ellipse((px-r,py-r,px+r,py+r),fill=color,outline=WHITE if j==selected else None,width=2)
    if 5<=t<13:pill(im,900,155,'HELD REVIEW FRAMES',LIME)
    txt(im,(64,956),'Full recorded AI reaction arcs · Observation progress · Only Review booking is paired here',16,MUTED)

def reader(spec):
    proc=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-i',str(spec['prepared']),
        '-an','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
    return proc,spec['size'][0]*spec['size'][1]*3

def render_chapter(i,layouts,reuse,signature):
    c=CHAPTERS[i];target=BUILD/f'chapter-{i:02}.mp4';mark=target.with_suffix('.sha256')
    if reuse and target.exists() and mark.exists() and mark.read_text()==signature:
        print('Reuse chapter',i+1,flush=True);return
    encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo',
        '-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264',
        '-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','2',str(target)],stdin=subprocess.PIPE)
    active={};last_key=None;previous=None;transition=None
    for n in range(c['duration']*FPS):
        t=n/FPS;key=layout_key(i,t);im=layouts[key].copy()
        if key!=last_key:
            transition=(previous.copy() if previous is not None else None,n)
            last_key=key
        clip_names=[key] if i==3 else ['before','after'] if key=='pair' else []
        for clip_name in clip_names:
            spec=CLIPS[clip_name]
            if clip_name not in active:active[clip_name]=(*reader(spec),None)
            proc,size,prev=active[clip_name];data=proc.stdout.read(size)
            if len(data)==size:prev=Image.frombytes('RGB',tuple(spec['size']),data)
            if prev is None:raise RuntimeError('Missing actual source pixels')
            active[clip_name]=(proc,size,prev)
            xy=(654,249) if i==3 else (64 if clip_name=='before' else 984,285)
            im.paste(prev,xy)
        if key=='pair':paired_overlay(im,t)
        d=ImageDraw.Draw(im)
        if i in [0,2,8]:
            if i==0:
                for x,steps,col in [(64,6,GREEN),(984,12,RED)]:
                    progress=min(1,max(0,(t-3)/6));count=min(steps,int(progress*steps)+1)
                    for j in range(count):
                        px=x+j*min(67,810/(steps-1));d.ellipse((px,924,px+11,935),fill=col)
            if i==2:
                x=984 if t>onset(2,2) else 64
                d.rounded_rectangle((x,285,x+872,815),30,outline=PURPLE if x==984 else GREEN,width=3)
            if i==8:
                d.line((64,538,64+int(1200*min(1,t/1.7)),538),fill=PURPLE,width=5)
        # Short editorial dissolves; no change to source capture or source timestamps.
        if transition and transition[0] is not None and n-transition[1]<8:
            im=Image.blend(transition[0],im,(n-transition[1]+1)/8)
        global_t=c['start']+t
        ImageDraw.Draw(im).rectangle((0,1076,int(W*global_t/LENGTH),1079),fill=PURPLE)
        if i==8 and t>7.4:im=Image.blend(im,Image.new('RGB',(W,H),BG),(t-7.4)/.6)
        if n in [0,c['duration']*FPS//2,(c['duration']-1)*FPS]:im.save(BUILD/f'qa-{i}-{n}.jpg',quality=92)
        encoder.stdin.write(im.tobytes());previous=im
    encoder.stdin.close()
    if encoder.wait()!=0:raise RuntimeError(f'Chapter {i+1} encode failed')
    for proc,_,_ in active.values():
        # Drain an unused prepared tail without a broken-pipe error or buffering it in RAM.
        while proc.stdout.read(1024*1024):pass
        proc.stdout.close()
        if proc.wait()!=0:raise RuntimeError('Recording decoder failed')
    mark.write_text(signature)
    print('Rendered chapter',i+1,'/',len(CHAPTERS),flush=True)

def exports():
    (BUILD/'concat.txt').write_text(''.join(f"file '{BUILD/f'chapter-{i:02}.mp4'}'\n" for i in range(len(CHAPTERS))))
    ff('-f','concat','-safe',0,'-i',BUILD/'concat.txt','-c','copy','-movflags','+faststart',OUT/'picture.mp4')
    ff('-i',OUT/'narration.wav','-i',OUT/'music.wav','-filter_complex',
       '[0:a]loudnorm=I=-18:TP=-2:LRA=9,pan=stereo|c0=c0|c1=c0[v];[1:a]volume=0.7[m];[v][m]amix=inputs=2:normalize=0,alimiter=limit=0.89[out]',
       '-map','[out]','-ar',48000,'-c:a','pcm_s16le',OUT/'mix.wav')
    ff('-i',OUT/'picture.mp4','-i',OUT/'mix.wav','-i',OUT/'captions.srt','-map','0:v','-map','1:a','-map','2:s',
       '-c:v','copy','-c:a','aac','-b:a','192k','-c:s','mov_text','-metadata:s:s:0','language=eng',
       '-metadata','title=Journey Lab — One product. Many journeys. / Review cut 01','-movflags','+faststart','-t',LENGTH,OUT/'film.mp4')
    # Subtitle renderer uses a 384x288 reference; font size 9 gives ~34px at 1080p.
    subtitle=f"subtitles={OUT/'captions.srt'}:force_style='FontName=Avenir Next,Fontsize=9,PrimaryColour=&HFFFFFF&,OutlineColour=&H170E10&,BackColour=&H170E10&,BorderStyle=3,Outline=1,Shadow=0,MarginV=7,MarginL=18,MarginR=18,Alignment=2'"
    ff('-i',OUT/'film.mp4','-vf',subtitle,'-map','0:v','-map','0:a','-c:v','libx264',
       '-preset','veryfast','-crf',18,'-c:a','copy','-threads',3,'-movflags','+faststart',OUT/'film-captioned.mp4')
    ff('-ss',174,'-i',OUT/'film.mp4','-frames:v',1,'-q:v',2,OUT/'poster.jpg')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--reuse',action='store_true')
    args=parser.parse_args()
    for p in [OUT,BUILD,ASSETS]:p.mkdir(parents=True,exist_ok=True)
    assert sum(c['duration'] for c in CHAPTERS)==LENGTH
    assert all(c['start']==sum(v['duration'] for v in CHAPTERS[:i]) for i,c in enumerate(CHAPTERS))
    source(ROOT/'scripts/hackathon-film.json')
    fix=ROOT/'journey-engine/workspace-data/fixes/4c801e88-44d9-4dfe-8148-2ffb9b9d78f1/fix.json'
    data=json.loads(source(fix).read_text());assert data['status']=='awaiting_review'
    candidate=source(Path(data['rounds'][0]['candidateDirectory'])/'app.js')
    source(ROOT/'outputs/gather-pr-demo/report.json')
    source(ROOT/'outputs/gather-pr-demo/muse-code-receipt.json')
    source(ROOT/'gather/qa/results/muse-candidate-2026-11-01T23-11-43.791Z/receipt.json')
    assert 'const shown=total(room);' in candidate.read_text()
    (OUT/'chapters.json').write_text(json.dumps(CHAPTERS,indent=2,ensure_ascii=False)+'\n')
    (OUT/'script.txt').write_text('\n\n'.join(f'{stamp(c["start"])} — {c["title"]}\n{c["speech"]}' for c in CHAPTERS)+'\n')
    audio();images_and_clips();layouts=build_layouts()
    for key,im in layouts.items():im.save(BUILD/f'layout-{key}.jpg',quality=92)
    names=list(layouts);contact=Image.new('RGB',(1600,math.ceil(len(names)/4)*254),BG)
    for j,key in enumerate(names):
        im=layouts[key].resize((400,225),Image.Resampling.LANCZOS);x=(j%4)*400;y=(j//4)*254
        contact.paste(im,(x,y));ImageDraw.Draw(contact).text((x+8,y+229),key,fill='white')
    contact.save(OUT/'storyboard.jpg',quality=92)
    if args.preview:return
    music()
    signature=hashlib.sha256((sha(__file__)+json.dumps(SOURCES,sort_keys=True)+json.dumps(CUES,sort_keys=True)).encode()).hexdigest()
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda i:render_chapter(i,layouts,args.reuse,signature),range(len(CHAPTERS))))
    exports()
    shutil.copy2(ROOT/'scripts/hackathon-film-player.html',OUT/'index.html')
    changed=[p for p,h in SOURCES.items() if sha(ROOT/p)!=h]
    if changed:raise RuntimeError(f'Source changed during render: {changed}')
    manifest={'title':'Journey Lab — One product. Many journeys.','durationSeconds':LENGTH,'resolution':[W,H],'fps':FPS,
        'narration':{'provider':'local macOS speech synthesis','voice':VOICE,'rate':RATE,'cues':'narration-cues.json'},
        'music':'Original low-level procedural instrumental pad, generated locally by this script.',
        'chapters':CHAPTERS,'clips':[{**{k:v for k,v in s.items() if k!='prepared'},
            'filmVisibleRange':[120,120+onset(6,5)] if s['name'] in ['before','after'] else
                [53+(0 if s['name']=='alex-flow' else onset(3,{'maya-choice':2,'maya-price':3,'maya-name':4}[s['name']])),
                 53+(onset(3,{'alex-flow':2,'maya-choice':3,'maya-price':4}[s['name']]) if s['name']!='maya-name' else 27)]}
            for s in CLIPS.values()],
        'sourceHashes':SOURCES,'sourcesUnchanged':True,'pairedReview':{'filmHold':[125,133],'before':22.597,'after':20.156},
        'edits':'Original browser pixels; crops and playback durations listed per clip. Static current-UI captures are editorial inserts. Paired review has an eight-second labeled editorial hold. Curves show all recorded reactions by observation progress; only the review stage is paired.',
        'limits':['Synthetic persona reactions; not measured human sentiment.','All Gather goals completed.','Room prices unchanged; the candidate makes the suitable choice visible earlier.','Candidate awaits human review; no external PR connection, merge or deployment.','Mac narration is temporary; ElevenLabs deferred until edit approval.'],
        'exports':{name:{'sha256':sha(OUT/name),'duration':duration(OUT/name)} for name in ['film.mp4','film-captioned.mp4','picture.mp4','narration.wav','music.wav']}}
    (OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print('Complete:',OUT/'film-captioned.mp4',flush=True)

if __name__=='__main__':main()
