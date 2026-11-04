#!/usr/bin/env python3
"""Gather's 90-second editorial film. Only recorded browser pixels; no new runs.

Reproducible local narration, source-aware edits, synchronized review moments,
and emotional arcs drawn directly from recorded experience signals.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, json, math, re, shutil, subprocess, sys, wave

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/gather-film'; BUILD=OUT/'build'; PUBLIC=ROOT/'journey-ui/gather-demo-assets'
for p in [OUT,BUILD,PUBLIC]: p.mkdir(parents=True,exist_ok=True)
W,H,FPS=1920,1080,30
INK='#211e30'; PAPER='#f7f6f2'; MUTED='#716d80'; PURPLE='#6841eb'; LIME='#d9f67a'
RED='#c84243'; GREEN='#16775a'; LAV='#eee8ff'; CORAL='#fff0e9'; NIGHT='#191725'
IDS={'alex':'be5e68ff-faae-495a-9269-8fb198b1a19d','maya':'49a51ebc-1ed6-4bfc-9fe2-e495e5786cfc','before':'ea312038-a7e1-4169-a661-32ffb884503b','after':'de304bc2-6ccd-422a-a5d3-2a4cdacb1e0d','alex_after':'e7b0aa37-20ec-4a84-b2cc-fa86fd20bd12'}
RUNS={k:json.loads((ROOT/'journey-engine/runs'/v/'run.json').read_text()) for k,v in IDS.items()}
CHAPTERS=[
 {'start': 0, 'duration': 8, 'title': 'One product. Many journeys.', 'speech': 'One product. Many journeys. Journey Lab helps teams understand their product through AI personas with different goals, expectations, and constraints.'},
 {'start': 8, 'duration': 12, 'title': 'Meet Alex', 'speech': 'Meet Alex, an executive assistant with a three-hundred-fifty-dollar budget. Muse Wonder follows his journey through Gather. The recommended room fits his priorities, and he books with fewer steps.'},
 {'start': 20, 'duration': 18, 'title': 'Follow Maya’s perspective', 'speech': 'Maya has a strict two-hundred-fifty-dollar limit. At review, two-twenty becomes two-eighty. She returns to choose another room, but her meeting name disappears. Her recorded reactions reveal frustration as she repeats the work. Same product. Different experience.'},
 {'start': 38, 'duration': 15, 'title': 'Turn feedback into an improvement', 'speech': 'Those moments become product feedback. Muse Code uses the findings to create an improvement: show the full price early and keep the entered details. The candidate is ready for human review.'},
 {'start': 53, 'duration': 23, 'title': 'Explore how the journey changes', 'speech': 'Follow Maya’s journey again in fresh sessions. At Review booking, the original journey exceeds her budget. The improved version shows a suitable room: two-forty-five, all included. Her recorded reaction changes. Six actions replace twelve, while Alex keeps his quick path.'},
 {'start': 76, 'duration': 14, 'title': 'Understand the journeys your product creates', 'speech': 'Journey Lab connects each persona’s context, choices, and reactions into a story your team can learn from. Understand what helps, what frustrates, and what could improve. One product. Many journeys.'}
]
FONT='/System/Library/Fonts/Avenir Next.ttc'; MONO='/System/Library/Fonts/Menlo.ttc'
FONTCACHE={}
def font(size,bold=False,mono=False):
 key=(size,bold,mono)
 if key not in FONTCACHE:FONTCACHE[key]=ImageFont.truetype(MONO if mono else FONT,size,index=0 if bold or mono else 7)
 return FONTCACHE[key]
def run(cmd):subprocess.run(cmd,check=True)
def ff(args):run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args)
def measure(text,size,bold=False):
 d=ImageDraw.Draw(Image.new('RGB',(1,1)))
 return sum(d.textlength(part,font=font(size,bold)) for part in text.split('→'))+text.count('→')*size*.9
def wrap(text,size,width,bold=False):
 lines=[]
 for para in text.split('\n'):
  line=''
  for word in para.split():
   proposed=(line+' '+word).strip()
   if measure(proposed,size,bold)>width and line:lines.append(line);line=word
   else:line=proposed
  lines.append(line)
 return '\n'.join(lines)
def text(im,xy,s,size=30,color=INK,bold=False,width=None,spacing=6,mono=False):
 if width:s=wrap(s,size,width,bold)
 d=ImageDraw.Draw(im)
 if '→' not in s:d.multiline_text(xy,s,font=font(size,bold,mono),fill=color,spacing=spacing);return
 # Avenir has no right-arrow glyph on this host; draw the connector explicitly.
 for row,line in enumerate(s.split('\n')):
  x,y=xy[0],xy[1]+row*(size+spacing)
  for j,part in enumerate(line.split('→')):
   if j:
    mid=y+size*.68;end=x+size*.72;start=x+size*.08;thick=max(2,round(size*.05))
    d.line((start,mid,end,mid),fill=color,width=thick)
    d.line((end-size*.15,mid-size*.15,end,mid,end-size*.15,mid+size*.15),fill=color,width=thick)
    x+=size*.9
   d.text((x,y),part,font=font(size,bold,mono),fill=color);x+=d.textlength(part,font=font(size,bold,mono))
def box(im,rect,fill,r=22,outline=None):ImageDraw.Draw(im).rounded_rectangle(rect,radius=r,fill=fill,outline=outline,width=2)
def tag(im,x,y,s,color=PURPLE,bg=LAV,size=21):
 width=int(measure(s,size,True))+34;box(im,(x,y,x+width,y+40),bg,20);text(im,(x+17,y+5),s,size,color,True);return width
def canvas(ch,dark=False):
 im=Image.new('RGB',(W,H),NIGHT if dark else PAPER)
 d=ImageDraw.Draw(im)
 for x,y,h in [(64,37,33),(80,28,42),(96,22,48)]:d.rounded_rectangle((x,y,x+10,y+h),3,fill=LIME if dark else PURPLE)
 text(im,(130,28),'journeylab',32,'white' if dark else INK,True)
 text(im,(376,38),'GATHER / PERSONA JOURNEYS',19,'#ada6bd' if dark else MUTED,True)
 text(im,(1740,35),f'0{ch+1} / 06',22,'#ada6bd' if dark else MUTED,True)
 d.line((64,91,1856,91),fill='#383245' if dark else '#dedbe4',width=2)
 return im
def hint(im,s,dark=False):text(im,(64,929),s,19,'#aca6bc' if dark else MUTED)
def tc(t,sep='.'):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'
def duration(path):
 return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)]))
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()

# Generate local narrator audio. Each sentence has its own measured cue range.
captions=[];audio_events=[];rate=171
for i,c in enumerate(CHAPTERS):
 chunks=re.split(r'(?<=[.!?])\s+',c['speech']);pieces=[]
 for j,s in enumerate(chunks):
  voice_key=hashlib.sha256(f'Samantha (English (US))|{rate}|{s}'.encode()).hexdigest()[:12]
  a=BUILD/f'voice-{voice_key}.aiff';w=BUILD/f'voice-{voice_key}.wav'
  if not w.exists():
   run(['say','-v','Samantha (English (US))','-r',str(rate),'-o',str(a),s])
   ff(['-i',str(a),'-ar','48000','-ac','1',str(w)])
  pieces.append((s,w,duration(w)))
 available=c['duration']-0.65;total=sum(p[2] for p in pieces)+0.10*(len(pieces)-1);factor=max(1,total/available)
 cursor=c['start']+0.3
 for j,(s,w,dur) in enumerate(pieces):
  if factor>1:
   adjusted=BUILD/f'voice-{i}-{j}-fit.wav';ff(['-i',str(w),'-af',f'atempo={factor:.7f}',str(adjusted)]);w=adjusted;dur=duration(w)
  captions.append((cursor,cursor+dur,s));audio_events.append({'start':cursor,'duration':dur,'file':str(w),'text':s});cursor+=dur+0.10/factor
 if cursor>c['start']+c['duration']+0.02:raise RuntimeError('Narration exceeds chapter')
 print('narration',i,round(cursor-c['start'],2),'seconds',flush=True)
pcm=bytearray(90*48000*2)
for a in audio_events:
 with wave.open(a['file'],'rb') as w:data=w.readframes(w.getnframes())
 start=round(a['start']*48000)*2;pcm[start:start+len(data)]=data
with wave.open(str(OUT/'narration.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(pcm)
(OUT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{tc(a)} --> {tc(b)} line:90% position:50% size:92% align:center\n{s}' for a,b,s in captions)+'\n')
(OUT/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{tc(a,",")} --> {tc(b,",")}\n{s}' for i,(a,b,s) in enumerate(captions))+'\n')
(OUT/'script.txt').write_text('\n\n'.join(f'{tc(c["start"])} — {c["title"]}\n{c["speech"]}' for c in CHAPTERS)+'\n')
(OUT/'chapters.json').write_text(json.dumps(CHAPTERS,indent=2)+'\n')

# Prepare actual recordings. A paired six-second hold emphasizes the same action.
def video(k):return ROOT/'journey-engine/runs'/IDS[k]/'journey.webm'
clip_specs=[
 {'key':'alex','output':'alex','w':1080,'h':750,'duration':12,'segments':[(6.2,25.4)],'rate':1.6,'crop':None},
 {'key':'maya','output':'maya','w':1080,'h':750,'duration':18,'segments':[(19.2,25.2),(31.0,43.0)],'rate':1,'crop':None},
 {'key':'before','output':'before','w':872,'h':518,'duration':23,'segments':[(17.597,22.597),(22.597,22.597),(22.597,32.597)],'holdSeconds':8,'rate':1,'crop':(140,180,1160,690)},
 {'key':'after','output':'after','w':872,'h':518,'duration':23,'segments':[(15.156,20.156),(20.156,20.156),(20.156,30.156)],'holdSeconds':8,'rate':1,'crop':(140,180,1160,690)}
]
for s in clip_specs:
 dest=BUILD/(s['output']+'-clip.mp4');s['prepared']=str(dest)
 if dest.exists() and '--rebuild-clips' not in sys.argv:continue
 filters=[];labels=[]
 for j,(start,end) in enumerate(s['segments']):
  label=f'v{j}';base=f'[0:v]trim=start={start}'
  if end>start:base+=f':end={end},setpts=(PTS-STARTPTS)/{s["rate"]}'
  else:base+=f',setpts=PTS-STARTPTS,fps={FPS},trim=end_frame=1,tpad=stop_mode=clone:stop_duration={s["holdSeconds"]},trim=duration={s["holdSeconds"]}'
  if s['crop']:
   x,y,w,h=s['crop'];base+=f',crop={w}:{h}:{x}:{y}'
  base+=f',scale={s["w"]}:{s["h"]},fps={FPS},setsar=1[{label}]';filters.append(base);labels.append(f'[{label}]')
 filters.append(''.join(labels)+f'concat=n={len(labels)}:v=1:a=0,trim=duration={s["duration"]}[out]')
 ff(['-i',str(video(s['key'])),'-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-threads','4',str(dest)])
 print('prepared recording',s['key'],flush=True)

# Stable layouts; actual browser regions are inserted without redrawing their UI.
backgrounds=[]
im=canvas(0,True)
tag(im,64,145,'UNDERSTAND YOUR PRODUCT THROUGH AI PERSONAS',LIME,'#313429')
text(im,(64,225),'One product.',111,'white',True)
text(im,(64,362),'Many journeys.',111,LIME,True)
for x,n,role,goal,color in [(64,'Alex','Executive assistant','Speed. A $350 budget.',LIME),(996,'Maya','Office coordinator','A strict $250 total.', '#ffbaa6')]:
 box(im,(x,590,x+860,855),'#292535',28)
 text(im,(x+32,616),n,57,color,True);text(im,(x+32,690),role,31,'white')
 text(im,(x+32,765),goal,37,'#d2ccdf',True)
hint(im,'Two synthetic personas. Different goals and constraints. Real browser journeys.',True);backgrounds.append(im)

im=canvas(1);tag(im,64,133,'MUSE WONDER · ALEX',GREEN,'#e4f2e8')
text(im,(64,218),'A room that fits\nAlex’s priorities.',65,INK,True,spacing=0)
text(im,(64,414),'8 → 6',118,GREEN,True)
text(im,(72,563),'recorded actions to the same goal',27,MUTED)
box(im,(64,645,696,845),'white',24)
text(im,(92,670),'$280 total',46,INK,True);text(im,(92,742),'Within his $350 budget.\nConfirmed and saved.',31,GREEN)
tag(im,776,126,'PROPOSED · RECORDED NAVIGATION',PURPLE,LAV)
box(im,(768,174,1864,932),'#ddd8e6',18)
hint(im,'Current → proposed · Same goal and persona · Playback 1.6×');backgrounds.append(im)

im=canvas(2);tag(im,64,133,'MUSE WONDER · MAYA',RED,CORAL)
text(im,(64,218),'Maya’s budget\nchanges the journey.',58,INK,True,spacing=0)
text(im,(64,414),'7 → 12',110,RED,True)
text(im,(72,555),'actions. Still completes.',29,MUTED)
box(im,(64,630,696,858),'white',24)
tag(im,776,126,'SAME PRODUCT · DIFFERENT CONTEXT',RED,CORAL)
box(im,(768,174,1864,932),'#ddd8e6',18)
hint(im,'Actual discovery · Two chronological excerpts · Model waiting time trimmed');backgrounds.append(im)

im=canvas(3,True);tag(im,64,133,'MUSE CODE · FEEDBACK INTO IMPROVEMENT',LIME,'#333a28')
text(im,(64,214),'Let the journey shape the improvement.',70,'white',True)
box(im,(64,340,1856,605),'#25212f',26)
text(im,(96,365),'app.js  /  room card pricing',23,'#b6aec8',True)
box(im,(96,421,1824,486),'#482a35',12)
text(im,(116,437),'- const shown=QUICK_BOOKING?room.base:total(room);',34,'#ffbcba',mono=True)
box(im,(96,503,1824,568),'#253d34',12)
text(im,(116,519),'+ const shown=total(room);',34,'#c9f2b9',mono=True)
for x,n,title,desc in [(64,'01','Show the true total','Atlas $280 · Willow $245'),(674,'02','Keep entered details','Removed both reset guards'),(1284,'03','Preserve the shortcut','Quick booking stays enabled')]:
 box(im,(x,648,x+572,850),'#292535',24);text(im,(x+26,665),n,26,LIME,True);text(im,(x+26,711),title,31,'white',True);text(im,(x+26,771),desc,25,'#bdb4d0')
hint(im,'Actual generated patch · 16 independent browser checks passed · Awaiting review',True);backgrounds.append(im)

im=canvas(4);text(im,(64,115),'Explore how the journey changes.',62,INK,True)
tag(im,1490,125,'MAYA: 12 → 6 ACTIONS',GREEN,'#e4f2e8')
tag(im,64,185,'BEFORE · PROPOSED',RED,CORAL);tag(im,984,185,'AFTER · IMPROVED CANDIDATE',GREEN,'#e4f2e8')
for x in [64,984]:box(im,(x-4,231,x+876,757),'#dcd7e5',16)
backgrounds.append(im)

im=canvas(5,True);text(im,(64,147),'One product.\nMany journeys.',99,'white',True,spacing=0)
for x,n,big,small,color in [(64,'ALEX','His priorities still fit.','Speed and a room within budget.',LIME),(996,'MAYA','Her context is visible.','Early totals. No repeated input.','#c4b1ff')]:
 box(im,(x,464,x+860,724),'#2c273a',26);text(im,(x+30,492),n,23,color,True);text(im,(x+30,548),big,48,'white',True);text(im,(x+30,638),small,28,'#c8c0d7')
tag(im,64,782,'8 REAL MODEL JOURNEYS',LIME,'#343b29');tag(im,410,782,'SOURCE-LINKED FEEDBACK',LIME,'#343b29');tag(im,880,782,'IMPROVEMENT READY FOR REVIEW','#d5c5ff','#3c3156')
text(im,(64,863),'Understand the experience. Follow the journey.',37,LIME,True)
hint(im,'Recorded synthetic perspectives · Candidate awaiting human review',True);backgrounds.append(im)
for i,bg in enumerate(backgrounds):bg.save(BUILD/f'layout-{i}.png')

def latest(k,t):
 signals=[x for x in RUNS[k]['experience'] if x['videoMs']/1000<=t+0.025]
 return signals[-1] if signals else None
VAL={'very_negative':-2,'negative':-1,'neutral':0,'positive':1,'very_positive':2}
def draw_arc(im,relative):
 d=ImageDraw.Draw(im);left,right,top,bottom=212,1808,864,942
 for val,color in [(2,'#e8f3ea'),(1,'#eef5ee'),(0,'#f0eff3'),(-1,'#fff0e2'),(-2,'#ffe7e6')]:
  y=top+(2-val)*15;d.rectangle((left,y,right,y+15),fill=color)
 text(im,(64,859),'Positive',17,GREEN);text(im,(64,888),'Neutral',17,MUTED);text(im,(64,919),'Negative',17,RED)
 def point(t,val):return (left+(t+23)/55*(right-left),top+(2-val)*15+7)
 for k,anchor,col in [('before',22.597,'#898394'),('after',20.156,PURPLE)]:
  pts=[point(s['videoMs']/1000-anchor,VAL.get(s['valence'],0)) for s in RUNS[k]['experience']]
  d.line(pts,fill=col,width=4)
  for x,y in pts:d.ellipse((x-4,y-4,x+4,y+4),fill=col)
  signal=latest(k,anchor+relative)
  if signal:
   x,y=point(relative,VAL.get(signal['valence'],0));d.ellipse((x-7,y-7,x+7,y+7),fill=col,outline='white',width=2)
 x,_=point(relative,0);d.line((x,top-7,x,bottom),fill=PURPLE,width=2)
 text(im,(212,837),'RECORDED SYNTHETIC REACTIONS',15,MUTED,True)
 text(im,(1250,837),'Gray: before    Violet: after    Paired at review',15,MUTED)

def frame(i,t,images):
 im=backgrounds[i].copy();d=ImageDraw.Draw(im)
 if i in [1,2]:im.paste(images[0],(776,178))
 if i==0:
  p=max(0,min(1,(t-1)/1.4));d.line((64,524,64+int(1120*p),524),fill=PURPLE,width=8)
 if i==2:
  if t<6:
   text(im,(92,653),'$220 → $280',49,RED,True);text(im,(92,728),'The total breaks\nher $250 limit.',32,INK,True)
  else:
   text(im,(92,653),'Her work disappears.',36,RED,True);text(im,(92,717),'Change room.\nEnter the name again.',31,INK)
 if i==3:
  # Bright outline follows each real change; no simulated terminal activity.
  x=[64,674,1284][min(2,int(t//5))];d.rounded_rectangle((x,648,x+572,850),26,outline=LIME,width=3)
 if i==4:
  source_delta=t if t<5 else 5 if t<13 else t-8
  before=17.597+source_delta;after=15.156+source_delta;rel=source_delta-5
  for x,img,k,clock in [(64,images[0],'before',before),(984,images[1],'after',after)]:
   im.paste(img,(x,235));s=latest(k,clock);tone=s['valence'] if s else 'neutral'
   col=RED if tone in ['negative','very_negative'] else GREEN if tone in ['positive','very_positive'] else MUTED
   box(im,(x,765,x+872,827),'white',12)
   quote=s['reaction'] if s else 'No recorded reaction at this position.'
   text(im,(x+14,774),quote,20,col,width=842,spacing=1)
   text(im,(x+720,192),f'{clock:05.2f}s',18,MUTED,True)
  draw_arc(im,rel)
  if 5<=t<13:
   tag(im,748,189,'REVIEW BOOKING',PURPLE,LAV)
 if i==5:
  a=min(1,max(0,(t-0.4)/1.2));d.line((64,400,64+int(1200*a),400),fill=LIME,width=6)
 global_t=CHAPTERS[i]['start']+t
 cue=None  # Selectable VTT/MP4 captions; a separately burned export is produced below.
 if cue:
  caption=wrap(cue,27,1740);lines=caption.count('\n')+1;h=lines*34+22
  box(im,(64,1053-h,1856,1053),'#302b40',14)
  width=max(measure(line,27) for line in caption.split('\n'))
  text(im,(int((W-width)/2),1060-h),caption,27,'white',spacing=1)
 d.rectangle((0,1076,int(W*global_t/90),1079),fill=LIME if i in [0,3,5] else PURPLE)
 return im

def raw_reader(path,w,h):
 return subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-i',str(path),'-an','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE),w*h*3
for i,c in enumerate(CHAPTERS):
 target=BUILD/f'chapter-{i}.mp4'
 if '--reuse-render-cache' in sys.argv and target.exists():continue
 specs=([clip_specs[0]] if i==1 else [clip_specs[1]] if i==2 else clip_specs[2:] if i==4 else [])
 decoders=[raw_reader(s['prepared'],s['w'],s['h']) for s in specs]
 encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','4',str(target)],stdin=subprocess.PIPE)
 previous=[None]*len(specs)
 for n in range(c['duration']*FPS):
  frames=[]
  for j,((proc,size),s) in enumerate(zip(decoders,specs)):
   data=proc.stdout.read(size)
   if len(data)==size:previous[j]=Image.frombytes('RGB',(s['w'],s['h']),data)
   if previous[j] is None:raise RuntimeError('Missing actual clip pixels')
   frames.append(previous[j])
  rendered=frame(i,n/FPS,frames)
  if n in [0,round(c['duration']*FPS/2),min(c['duration']*FPS-1,9*FPS)]:rendered.save(BUILD/f'qa-{i}-{n}.jpg',quality=92)
  encoder.stdin.write(rendered.tobytes())
 encoder.stdin.close()
 if encoder.wait()!=0:raise RuntimeError('Video encoding failed')
 for proc,_ in decoders:
  proc.stdout.close();proc.wait()
 print('rendered chapter',i+1,c['duration'],'seconds',flush=True)

(BUILD/'concat.txt').write_text(''.join(f"file '{BUILD/f'chapter-{i}.mp4'}'\n" for i in range(6)))
ff(['-f','concat','-safe','0','-i',str(BUILD/'concat.txt'),'-i',str(OUT/'narration.wav'),'-i',str(OUT/'captions.srt'),'-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:s','mov_text','-metadata:s:s:0','language=eng','-metadata','title=Journey Lab — One product. Many journeys.','-movflags','+faststart','-t','90',str(OUT/'film.mp4')])
ff(['-ss','2','-i',str(OUT/'film.mp4'),'-frames:v','1','-q:v','2',str(OUT/'poster.jpg')])
ff(['-i',str(OUT/'film.mp4'),'-vf',f"subtitles={OUT/'captions.srt'}:force_style='FontName=Avenir Next,Fontsize=9,PrimaryColour=&HFFFFFF&,OutlineColour=&H302B40&,BackColour=&H302B40&,BorderStyle=3,Outline=2,Shadow=0,MarginV=6,Alignment=2'",'-map','0:v','-map','0:a','-c:v','libx264','-preset','veryfast','-crf','18','-c:a','copy','-movflags','+faststart','-threads','4',str(OUT/'film-captioned.mp4')])
manifest={
 'title':'Journey Lab — One product. Many journeys.','durationSeconds':90,'language':'en','resolution':[W,H],
 'narration':{'provider':'local macOS speech synthesis','voice':'Samantha (English (US))','rateWordsPerMinute':rate,'purpose':'Editorial narrator, not persona speech or model audio','measuredSentenceCues':audio_events},
 'impactId':'3c976cd2-5a9a-4c58-aef7-a40e4948f5e3','fixId':'4c801e88-44d9-4dfe-8148-2ffb9b9d78f1','chapters':CHAPTERS,
 'clips':[{**{k:v for k,v in s.items() if k!='prepared'},'runId':IDS[s['key']],'source':str(video(s['key']).relative_to(ROOT)),'sourceSha256':sha(video(s['key']))} for s in clip_specs],
 'pairedMoment':{'action':'First Review booking','beforeSeconds':22.597,'afterSeconds':20.156,'offsetSeconds':2.441,'filmSeconds':[58,66],'holdSeconds':8},
 'emotionalArcs':{'source':'run.json experience arrays','yAxis':'Recorded categorical valence, not a validated psychological scale','pairing':'Time relative to first Review booking; other points are not asserted to be the same action','values':VAL},
 'edits':'Original browser pixels, scaled/cropped as listed. Alex playback1.6x. Maya discovery two chronological excerpts. Paired review clips run1x and hold both genuine review frames for8seconds. Source frame quantization applies. Editorial typography and arcs added outside browser regions. No fabricated browser actions, typing, screenshots or code execution.',
 'claims':{'AlexCurrentActions':8,'AlexProposedActions':6,'MayaCurrentActions':7,'MayaProposedActions':12,'MayaFreshProposedActions':12,'MayaRepairedActions':6,'allEightGoalsReached':True,'independentCandidateBrowserChecks':16},
 'limitations':['Synthetic personas; no measured human sentiment or causal business uplift.','All goals completed; Maya experienced recovery work rather than a blocked goal.','Local change review; no external PR integration, merge, or deployment.','Candidate awaiting review.','Alex fast path preserved; no extra action reduction attributed to repair because confirmation depth differed.'],
 'filmSha256':sha(OUT/'film.mp4'),'captionedFilmSha256':sha(OUT/'film-captioned.mp4')
}
(OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
(OUT/'presenter-notes.txt').write_text('Journey Lab — One product. Many journeys.\n\nCore promise\nUnderstand your product through the eyes of AI personas with different goals, expectations, and constraints. Follow their journeys, discover what delights or frustrates them, and turn their feedback into better experiences.\n\nPresentation story\nBegin with the personas, not the proposed change. Alex and Maya both need a room for twelve people with a projector, but their budgets and priorities give the same product different meanings. Gather is the fictional booking app; Journey Lab lets the team understand these experiences.\n\nPlay the 90-second film from the beginning with sound. At 0:08, meet Alex and follow a room choice that fits his context. At 0:20, follow Maya through a late price surprise and repeated input. Her recorded reactions belong to specific moments in her journey. At 0:38, show how those observations inform the actual Muse Code candidate. At 0:58, the paired Review booking frames show $280/negative versus $245/excellent. The final question is what the team learned about the experience.\n\nAfter the film, explore the personas, source comments, and complete emotional arcs in Journey Lab. Open the generated candidate when explaining how feedback becomes an actionable improvement. This is a product-understanding story grounded in real browser journeys.\n\nEvidence boundaries\nAll eight recorded journeys completed. Maya recovered before the improvement; do not describe her as blocked. The arcs reflect synthetic personas’ recorded reactions, not measured human sentiment. Alex’s fast path is retained; his repaired session stopped at confirmation while its counterpart also opened My reservations, so the extra one-action difference is not attributed to the candidate. The candidate passed sixteen independent browser checks and awaits human approval. No PR provider is connected.\n\nThe film edits existing recordings, makes no new model calls, and does not alter the candidate. Original LittleSteps film remains available at /demo.html.\n')
for name in ['film.mp4','film-captioned.mp4','poster.jpg','captions.vtt','captions.srt','chapters.json','source-manifest.json','script.txt','presenter-notes.txt']:shutil.copy2(OUT/name,PUBLIC/name)
print('complete',OUT/'film.mp4',flush=True)
