#!/usr/bin/env python3
"""Reproducible editorial cut of recorded Journey Lab executions. No browser actions.
Inputs are preserved run videos, screenshots and the actual generated candidate.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, subprocess, textwrap, shutil, wave, re, sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/hackathon-demo'; OUT.mkdir(parents=True,exist_ok=True)
BUILD=OUT/'build'; BUILD.mkdir(exist_ok=True)
W,H=1920,1080
INK='#1e1c2b'; MUTED='#6d6879'; PAPER='#f6f3ee'; PURPLE='#6650e8'; CORAL='#f36b4d'; LAV='#e9e3ff'; MINT='#d8eadc'
FONTS={'bold':'/System/Library/Fonts/Avenir Next.ttc','regular':'/System/Library/Fonts/HelveticaNeue.ttc','mono':'/System/Library/Fonts/Menlo.ttc'}
def f(s,kind='regular'):return ImageFont.truetype(FONTS[kind],s)
def txt(im,xy,t,size=32,color=INK,bold=False,spacing=8):
 ImageDraw.Draw(im).multiline_text(xy,t,font=f(size,'bold' if bold else 'regular'),fill=color,spacing=spacing)
def rr(im,box,fill,r=26,outline=None,width=1):ImageDraw.Draw(im).rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)
def pill(im,x,y,t,color=PURPLE,light=LAV):
 fw=ImageDraw.Draw(im).textbbox((0,0),t,font=f(22,'bold'))[2];rr(im,(x,y,x+fw+36,y+46),light,23);txt(im,(x+18,y+8),t,22,color,True)
def base(i,dark=False):
 im=Image.new('RGB',(W,H),INK if dark else PAPER);c=PAPER if dark else INK
 rr(im,(92,62,142,112),PURPLE,13); ImageDraw.Draw(im).line([(104,76),(119,76),(119,98),(131,98)],fill='white',width=4); ImageDraw.Draw(im).ellipse((100,72,108,80),fill='white'); ImageDraw.Draw(im).ellipse((127,94,135,102),fill='white')
 txt(im,(160,67),'Journey Lab',31,c,True);txt(im,(1530,76),f'{i+1:02d} / 06',22,'#a7a0b8' if dark else MUTED)
 ImageDraw.Draw(im).line((100,127,1820,127),fill='#373342' if dark else '#ded9d3',width=2)
 return im
def footer(im,text,dark=False):txt(im,(100,1012),text,20,'#ada6bb' if dark else MUTED)
def screenshot(im,p,box):
 s=Image.open(p).convert('RGB'); s.thumbnail((box[2],box[3]),Image.Resampling.LANCZOS); im.paste(s,(box[0]+(box[2]-s.width)//2,box[1]+(box[3]-s.height)//2))
RUNS=ROOT/'journey-engine/runs'
IDS={'discovery':'b13fcc4d-badd-4afe-ba60-1af4791c01bc','mother_before':'9e32a908-d701-49a9-a87d-b63daf76b7a8','mother_after':'7c8b4108-6e13-45c9-9b66-4cb44bc34266','teacher_before':'53e302a0-2e3c-4958-9bac-866cb3b912d4','teacher_after':'d540b9fb-6c31-4ddf-b77c-e13987e9b23d'}
CHAPTERS=[
 {'start':0,'duration':12,'title':'Your product works. But for whom?','speech':'Your product works. But for whom? A teacher has a printer. A mother has a phone, ten minutes, and no printer. Same product. Different realities.'},
 {'start':12,'duration':18,'title':'Muse Wonder discovers the block','speech':'Muse Wonder explores LittleSteps through that context. It finds an activity, then discovers printing and cutting are required. It checks alternatives. The mother can find the activity, but cannot start it with her available resources.'},
 {'start':30,'duration':13,'title':'Muse Code implements an alternative','speech':'Those observations become an implementation task for Muse Code. It adds a working on-screen activity, keeps the printable version, and produces a reviewable patch. Independent functional checks pass.'},
 {'start':43,'duration':22,'title':'The mother can now begin','speech':'Now, fresh sessions retest both versions. Before, the mother reaches the same printing barrier. After, she chooses the on-screen path. Watch the actual tap: Space suit. The activity responds, records one choice, and opens step two. A concrete first step, using only the phone.'},
 {'start':65,'duration':14,'title':'The teacher keeps what worked','speech':'And the teacher? Her printable path still works. She inspects the sheets and saves the preparation plan. Four independent journeys show the change helped one context while preserving the other.'},
 {'start':79,'duration':11,'title':'Fix the journey. Keep what works.','speech':'Journey Lab connects a user constraint to a product change, then verifies the experience again. Discover. Improve. Retest. Fix the journey. Keep what works.'}
]
# 1: Hook and contextual personas.
im=base(0);txt(im,(100,180),'Your product works.\nBut for whom?',104,INK,True,spacing=0)
rr(im,(100,480,925,845),'#e9e3ff',32);rr(im,(995,480,1820,845),'#f9ded5',32)
pill(im,138,518,'THE TEACHER');pill(im,1033,518,'THE MOTHER',CORAL,'#fff0e9')
txt(im,(138,600),'Prepare tomorrow’s\nspace activity.',49,INK,True);txt(im,(138,755),'Desktop · Printer · Paper · Scissors',28,MUTED)
txt(im,(1033,600),'Start an activity.\nRight now.',49,INK,True);txt(im,(1033,755),'Phone · 10 minutes · No printer',28,MUTED)
footer(im,'LittleSteps case study · Recorded agent runs · Synthetic personas')
im.save(BUILD/'bg0.png')
# 2: actual discovery recording.
im=base(1);pill(im,100,168,'MUSE WONDER · DISCOVERY')
txt(im,(100,250),'A working button.\nAn impossible\nnext step.',80,INK,True,spacing=0)
rr(im,(100,595,1140,830),'white',28)
txt(im,(135,625),'“The activity needs a printer and\nscissors, which we don’t have.”',42,INK,True)
txt(im,(135,758),'Translated synthetic persona annotation · discovery #12',22,MUTED)
pill(im,100,865,'ACTIVITY FOUND',PURPLE,LAV);txt(im,(375,870),'/',30,MUTED);pill(im,420,865,'CANNOT START',CORAL,'#f9ded5')
rr(im,(1332,151,1720,944),'#dcd7e4',30)
footer(im,'Real Muse Wonder discovery · Playback edited to remove model waiting time')
im.save(BUILD/'bg1.png')
# 3: code artifact and real screenshot, no simulated terminal.
im=base(2,True);pill(im,100,168,'MUSE CODE · IMPLEMENTATION',PAPER,'#4a3a94')
txt(im,(100,250),'Build a way\nto begin.',88,PAPER,True,spacing=0)
txt(im,(100,468),'On screen + Printable',43,'#b9a9ff',True)
rr(im,(100,558,1160,802),'#292532',24)
txt(im,(132,585),'app.js · excerpt from generated candidate',23,'#a6a0b5')
code="const formats = ['screen', 'print'];"
txt(im,(132,650),code,35,'#c2b1ff')
txt(im,(132,720),'Interactive choices · Feedback · Progress',29,PAPER)
pill(im,100,850,'4 PRODUCT FILES CHANGED',PAPER,'#3c354d');pill(im,520,850,'4 CHECK GROUPS PASSED','#b7e6c3','#254032')
rr(im,(1332,151,1720,944),'#4a4358',30)
screenshot(im,RUNS/IDS['mother_after']/'screen-006.png',(1346,166,360,764))
footer(im,'Actual generated candidate · Reviewable patch · Independent browser verification',True)
im.save(BUILD/'bg2.png')
# 4: paired mother recordings, labels and deliberately minimal claims.
im=base(3);txt(im,(100,159),'She can actually begin.',69,INK,True)
pill(im,100,270,'BEFORE',CORAL,'#f9ded5');txt(im,(100,338),'Printing\nrequired.',42,INK,True)
pill(im,1035,270,'AFTER',PURPLE,LAV);txt(im,(1035,338),'One tap.\nReal feedback.',42,INK,True)
rr(im,(425,262,788,1003),'#dcd7e4',24);rr(im,(1388,262,1751,1003),'#dcd7e4',24)
# video top y274,720px tall, width333
footer(im,'Independent retests · Final frames held · First step started; full activity not completed')
im.save(BUILD/'bg3.png')
# 5: both teacher paths.
im=base(4);txt(im,(100,162),'Keep what worked for her.',68,INK,True)
pill(im,100,269,'TEACHER · BEFORE');pill(im,1020,269,'TEACHER · AFTER')
rr(im,(92,340,908,856),'#dfdbe4',22);rr(im,(1012,340,1828,856),'#dfdbe4',22)
txt(im,(100,882),'Printable content inspected. Plan saved.',29,INK,True)
txt(im,(1020,882),'Printable content inspected. Plan saved.',29,INK,True)
footer(im,'Two fresh teacher sessions · Final frames held · No physical printing performed')
im.save(BUILD/'bg4.png')
# 6: close. No unmeasured numerical claims.
im=base(5,True);txt(im,(100,200),'Fix the journey.\nKeep what works.',104,PAPER,True,spacing=0)
for x,n,t in [(100,'01','Discover'),(695,'02','Improve'),(1290,'03','Retest')]:
 rr(im,(x,535,x+530,745),'#302a3e',26);txt(im,(x+30,557),n,27,'#b9a9ff',True);txt(im,(x+30,615),t,51,PAPER,True)
txt(im,(100,805),'A constraint. A change. A verified experience.',41,'#c4b7ff',True)
footer(im,'4 independent retests · Recorded executions · Synthetic personas; human impact remains to be tested',True)
im.save(BUILD/'bg5.png')
# Representative poster, separate from film.
poster=base(0);txt(poster,(100,205),'Fix the journey.\nKeep what works.',104,INK,True,spacing=0);txt(poster,(100,520),'Muse Wonder  /  Muse Code  /  Two-persona retest',42,PURPLE,True)
rr(poster,(100,640,930,865),LAV,30);txt(poster,(135,673),'MOTHER',25,PURPLE,True);txt(poster,(135,725),'Blocked. Then able to begin.',39,INK,True)
rr(poster,(990,640,1820,865),MINT,30);txt(poster,(1025,673),'TEACHER',25,'#345a42',True);txt(poster,(1025,725),'Printable path preserved',39,INK,True)
footer(poster,'Journey Lab · 90-second case study · Recorded executions / synthetic personas')
poster.save(OUT/'poster.jpg',quality=94)
# Narration, generated locally; auditable segmentation and subtitles.
rate=178
narration=[]
for i,c in enumerate(CHAPTERS):
 aiff=BUILD/f'voice{i}.aiff';wav=BUILD/f'voice{i}.wav'
 if '--reuse-render-cache' not in sys.argv or not wav.exists():
  subprocess.run(['say','-v','Samantha (English (US))','-r',str(rate),'-o',str(aiff),c['speech']],check=True)
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(aiff),'-ar','48000','-ac','1',str(wav)],check=True)
 with wave.open(str(wav),'rb') as w: dur=w.getnframes()/w.getframerate()
 available=c['duration']-0.75
 if dur>available:
  ratefactor=dur/available; adjusted=BUILD/f'voice{i}-fit.wav'
  subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(wav),'-af',f'atempo={ratefactor:.6f}',str(adjusted)],check=True);wav=adjusted;dur=available
 narration.append({'path':str(wav),'start':c['start']+0.35,'duration':dur,'text':c['speech']})
 print('narration',i,round(dur,2),flush=True)
sampleRate=48000; merged=bytearray(90*sampleRate*2)
for c in narration:
 with wave.open(c['path'],'rb') as w:data=w.readframes(w.getnframes())
 start=int(c['start']*sampleRate)*2;merged[start:start+len(data)]=data
with wave.open(str(OUT/'narration.wav'),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sampleRate);w.writeframes(merged)
def timecode(t,sep='.'):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}{sep}{ms%1000:03}'
captions=[]
for c in narration:
 sentences=re.split(r'(?<=[.!?])\s+',c['text']); chunks=[];cur=''
 for s in sentences:
  if cur and len(cur)+len(s)>88:chunks.append(cur);cur=s
  else:cur=(cur+' '+s).strip()
 if cur:chunks.append(cur)
 total=sum(len(x) for x in chunks);curtime=c['start']
 for line in chunks:
  duration=c['duration']*len(line)/total;captions.append((curtime,curtime+duration,line));curtime+=duration
(OUT/'captions.vtt').write_text('WEBVTT\n\n'+'\n\n'.join(f'{timecode(a)} --> {timecode(b)}\n{t}' for a,b,t in captions)+'\n')
(OUT/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{timecode(a,",")} --> {timecode(b,",")}\n{t}' for i,(a,b,t) in enumerate(captions))+'\n')
(OUT/'script.txt').write_text('\n\n'.join(f'{timecode(c["start"])} — {c["title"]}\n{c["speech"]}' for c in CHAPTERS)+'\n')
# Clips stay in chronological order. Freezes only hold actual recorded frames.
clips={
 1:[{'run':'discovery','start':11.8,'length':17.1,'x':1347,'y':166,'w':358,'h':764}],
 3:[{'run':'mother_before','start':12.14,'length':22,'x':440,'y':274,'w':334,'h':720},{'run':'mother_after','start':8.4,'length':15.2,'x':1403,'y':274,'w':334,'h':720}],
 4:[{'run':'teacher_before','start':17.2,'length':6.2,'x':100,'y':348,'w':800,'h':500},{'run':'teacher_after','start':18.6,'length':6.76,'x':1020,'y':348,'w':800,'h':500}]
}
manifest={'title':'Journey Lab — Fix the journey. Keep what works.','durationSeconds':90,'language':'en','narration':{'provider':'local macOS speech synthesis','voice':'Samantha (English (US))','rateWordsPerMinute':rate,'note':'Narrator track, not the persona or model audio.'},'comparisonId':'f49c9695-c040-4d57-8f10-a2802a0142f9','improvementId':'9543a94c-6160-47ed-ba00-19f3e4a0b5f4','chapters':CHAPTERS,'clips':[],'edits':'Preserved recorded browser pixels, uniformly scaled. Existing replay removes measured model waits. Additional trims specified below. At end of short clips, final recorded frame is held. No generated browser actions, typing or code execution. Captions are editorial English narration, not private model reasoning.','scope':'Synthetic personas. Mother started the first step and advanced to step2. No actual child participation or printing. Candidate is prepared for review, not merged or deployed.'}
for i,c in enumerate(CHAPTERS):
 dest=BUILD/f'chapter{i}.mp4'
 cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','30','-i',str(BUILD/f'bg{i}.png')]
 for cl in clips.get(i,[]): cmd+=['-ss',str(cl['start']),'-t',str(cl['length']),'-i',str(RUNS/IDS[cl['run']]/'replay.webm')]
 filters=['[0:v]format=yuv420p[b0]'];last='b0'
 for j,cl in enumerate(clips.get(i,[]),1):
  filters += [f'[{j}:v]setpts=PTS-STARTPTS,scale={cl["w"]}:{cl["h"]}:force_original_aspect_ratio=decrease,pad={cl["w"]}:{cl["h"]}:(ow-iw)/2:(oh-ih)/2:color=0xf6f3ee,fps=30,tpad=stop_mode=clone:stop_duration={c["duration"]}[v{j}]',f'[{last}][v{j}]overlay={cl["x"]}:{cl["y"]}:shortest=1[b{j}]'];last=f'b{j}'
  run=json.loads((RUNS/IDS[cl['run']]/'run.json').read_text())
  manifest['clips'].append({'chapter':i+1,'filmStart':c['start'],'filmEnd':c['start']+c['duration'],'runId':IDS[cl['run']],'file':str((RUNS/IDS[cl['run']]/'replay.webm').relative_to(ROOT)),'replayStart':cl['start'],'replayEnd':cl['start']+cl['length'],'replayToOriginalSegments':run.get('replayMetadata',{}).get('segments',[])})
 cmd+=['-filter_complex',';'.join(filters),'-map',f'[{last}]','-t',str(c['duration']),'-r','30','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-threads','4',str(dest)]
 if '--reuse-render-cache' not in sys.argv or not dest.exists() or dest.stat().st_size < 1000:subprocess.run(cmd,check=True)
 print('rendered',i,flush=True)
(BUILD/'concat.txt').write_text(''.join(f"file '{BUILD/f'chapter{i}.mp4'}'\n" for i in range(6)))
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(BUILD/'concat.txt'),'-i',str(OUT/'narration.wav'),'-i',str(OUT/'captions.srt'),'-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:s','mov_text','-metadata:s:s:0','language=eng','-metadata','title=Journey Lab — Fix the journey. Keep what works.','-movflags','+faststart','-t','90',str(OUT/'film.mp4')],check=True)
(OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print('complete', OUT/'film.mp4',flush=True)
