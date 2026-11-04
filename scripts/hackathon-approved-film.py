#!/usr/bin/env python3
"""Approved three-minute Journey Lab story, composed from actual UI and recordings."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, importlib.util, json, hashlib, subprocess, math
from PIL import Image, ImageDraw, ImageOps
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('film_common',ROOT/'scripts/hackathon-film.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
OUT=ROOT/'outputs/hackathon-film-approved';BUILD=OUT/'build';ASSETS=OUT/'assets'
f.OUT,f.BUILD,f.ASSETS=OUT,BUILD,ASSETS
f.CHAPTERS=json.loads((ROOT/'scripts/hackathon-film-approved.json').read_text())
f.CUES=json.loads((OUT/'narration-cues.json').read_text())
C=f.CHAPTERS;W,H,FPS=1920,1080,30
BG,PANEL,WHITE,MUTED,PURPLE,LIME,RED,GREEN=f.BG,f.PANEL,f.WHITE,f.MUTED,f.PURPLE,f.LIME,f.RED,f.GREEN
txt,box,pill,arrow=f.txt,f.box,f.pill,f.arrow
for p in [OUT,BUILD,ASSETS]:p.mkdir(parents=True,exist_ok=True)
for key,id in f.IDS.items():f.RUNS[key]=json.loads(f.source(ROOT/'journey-engine/runs'/id/'run.json').read_text())
for path in ASSETS.glob('*.jpg'):f.source(path)
for path in [ROOT/'scripts/hackathon-film-approved.json',ROOT/'scripts/hackathon-approved-audio.py',ROOT/'outputs/gather-pr-demo/report.json',ROOT/'outputs/gather-pr-demo/muse-code-receipt.json',ROOT/'gather/qa/results/muse-candidate-2026-11-01T23-11-43.791Z/receipt.json']:
 f.source(path)
fix=json.loads(f.source(ROOT/'journey-engine/workspace-data/fixes/4c801e88-44d9-4dfe-8148-2ffb9b9d78f1/fix.json').read_text())
assert fix['status']=='awaiting_review'
candidate=f.source(Path(fix['rounds'][0]['candidateDirectory'])/'app.js')
assert 'const shown=total(room);' in candidate.read_text()

# Film intervals align with measured narration sentence onsets; edits never imply real-time model speed.
B=[
 (0,6.4,'home'),(6.4,15.3,'perspectives'),(15.3,19.2,'journeys'),(19.2,24,'compare'),
 (24,29,'persona'),(29,34.3,'mission'),(34.3,38.3,'devices'),(38.3,44,'explore'),
 (44,47,'new-project'),(47,49.94,'connect'),(49.94,58.5,'gather'),(58.5,68,'gather-people'),
 (68,81.13,'people'),(81.13,84.16,'alex'),(84.16,88,'price'),(88,92.2,'name'),(92.2,99,'success'),
 (99,103.42,'finding'),(103.42,109.96,'arc'),(109.96,112.76,'impact'),(112.76,116.4,'impact-alex'),(116.4,122,'evidence'),
 (122,126.08,'candidate'),(126.08,133.65,'patch'),(133.65,146.51,'retest'),(146.51,155,'review'),
 (155,161,'projects'),(161,169.7,'value'),(169.7,176.11,'research'),(176.11,180,'end')]


def canvas(title='',eyebrow='',gather=False):
 im=Image.new('RGB',(W,H),BG);d=ImageDraw.Draw(im)
 # Quiet geometric background and strong brand, keeping content clear.
 for x,y,h in [(64,32,25),(80,23,34),(96,17,40)]:d.rounded_rectangle((x,y,x+10,y+h),3,fill=PURPLE)
 txt(im,(128,18),'journeylab',31,WHITE,True)
 if gather:pill(im,1510,18,'GATHER · SAMPLE APP',LIME)
 else:txt(im,(1520,27),'META AI HACKATHON',20,MUTED,True)
 d.line((64,79,1856,79),fill='#393344',width=1)
 if eyebrow:txt(im,(64,108),eyebrow,21,PURPLE,True)
 if title:txt(im,(64,150),title,58,WHITE,True,width=1790)
 d.rectangle((0,978,W,H),fill='#100e17')
 return im


def shot(im,name,rect,crop=None):
 image=Image.open(f.source(ASSETS/name)).convert('RGB')
 if crop:image=image.crop(crop)
 x,y,w,h=rect;image=ImageOps.contain(image,(w,h),Image.Resampling.LANCZOS)
 x+=(w-image.width)//2;y+=(h-image.height)//2
 box(im,(x-3,y-3,x+image.width+3,y+image.height+3),'#655a78',14);im.paste(image,(x,y))


def panel(title,main,sub,filename,gather=False,crop=None,eyebrow='JOURNEY LAB / YOUR PRODUCT'):
 im=canvas(title,eyebrow,gather)
 txt(im,(64,325),main,65,WHITE,True,width=510)
 txt(im,(64,610),sub,31,MUTED,width=510)
 shot(im,filename,(620,265,1236,680),crop)
 return im


def people(title='The same task. Different priorities.'):
 im=canvas(title,'AI PERSONAS / CONTEXT SHAPES THE JOURNEY',True)
 for x,name,role,budget,priority,col in [(64,'Alex','Executive assistant','$350','Complete the booking quickly.',GREEN),(984,'Maya','Office coordinator','$250','Stay within the full budget.',PURPLE)]:
  box(im,(x,280,x+872,830),PANEL,28);pill(im,x+35,315,'AI PERSONA',col)
  txt(im,(x+35,390),name,82,col,True);txt(im,(x+35,493),role,33,WHITE)
  txt(im,(x+35,553),budget,112,WHITE,True);txt(im,(x+35,730),priority,31,MUTED)
 txt(im,(64,885),'Book a room for 12 people, with a projector.',39,WHITE,True)
 return im


def layouts():
 L={}
 L['home']=panel('You built an app.','See it through\ndifferent\nperspectives.','Your users.\nTheir goals.\nTheir journeys.','home.jpg')
 L['perspectives']=panel('Give your users a perspective to explore.','Inspired by\nyour users.','Goals · Knowledge\nExpectations · Constraints','personas.jpg')
 L['journeys']=panel('Follow the journey through your app.','A task.\nA perspective.\nA journey.','Recorded actions, observations,\nand outcomes in context.','journeys.jpg')
 L['compare']=panel('Discover what helps. What frustrates.','Compare.\nInvestigate.\nImprove.','Each perspective reveals\nsomething worth exploring.','impact.jpg')
 L['persona']=panel('Start with a person’s context.','Goals.\nKnowledge.\nConstraints.','Define what matters\nto this perspective.','persona-detail.jpg',crop=(212,0,1269,650),eyebrow='DEFINE THE PERSPECTIVE')
 L['mission']=panel('Give the journey a purpose.','Set the task.\nDefine success.','Leave room for discovery.','mission.jpg',crop=(212,0,1269,650),eyebrow='DEFINE THE MISSION')
 L['devices']=panel('Choose the conditions to explore.','Device.\nConnection.\nContext.','Reusable browser device\nand network profiles.','devices.jpg',eyebrow='CHOOSE THE CONDITIONS')
 im=canvas('Watch the persona explore.','POWERED BY META’S MUSE WONDER')
 txt(im,(64,330),'Navigate.\nObserve.\nUnderstand.',68,WHITE,True)
 txt(im,(64,650),'Recorded browser actions\nand persona reactions.',31,MUTED,width=510)
 box(im,(616,259,1860,958),'#655a78',16);L['explore']=im
 L['new-project']=panel('Your product belongs here.','Connect\nyour own app.','Create a project for\nyour product and journeys.','new-project.jpg',crop=(350,240,940,510),eyebrow='YOUR APP / YOUR JOURNEYS')
 L['connect']=panel('Choose where to explore.','Your app.\nYour environment.','Configure the app URL\nand your test environment.','connect.jpg',crop=(265,35,1015,660),eyebrow='CONNECT YOUR WEB APP')
 im=canvas('Meet Gather.','A SAMPLE APP WE CREATED TO SHOW JOURNEY LAB',True)
 txt(im,(64,330),'A room-booking\napp. One example.',63,WHITE,True,width=505)
 txt(im,(64,590),'Different personas.\nA shared task.\nExperiences to investigate.',31,MUTED)
 frame=ImageOps.contain(f.frame_at('maya',6.8),(1190,690),Image.Resampling.LANCZOS)
 fx=654+(1190-frame.width)//2
 box(im,(fx-3,246,fx+frame.width+3,942),'#655a78',16);im.paste(frame,(fx,249))
 txt(im,(64,931),'Gather is a fictional product connected to Journey Lab.',19,MUTED)
 L['gather']=im
 L['gather-people']=panel('Let’s follow their journeys.','One task.\nDifferent\npriorities.','See what each perspective\nreveals about the experience.','persona-detail.jpg',True,crop=(212,0,1269,650),eyebrow='GATHER / EXPLORE THROUGH AI PERSONAS')
 L['people']=people()
 for key,title,main,sub,col in [
  ('alex','A quicker booking flow helps Alex.','A quick path.','Within his $350 budget.',GREEN),
  ('price','The full price arrives at review.','$280 total','Above Maya’s $250 limit.',RED),
  ('name','Changing rooms loses her work.','Enter it again.','The meeting name disappears.',RED),
  ('success','She reaches the goal. With extra work.','Booking\nconfirmed.','A successful outcome\ncan contain friction.',GREEN)]:
  im=canvas(title,'GATHER / RECORDED PERSONA JOURNEY',True)
  txt(im,(64,335),main,76,col,True,width=505);txt(im,(64,570),sub,34,WHITE,width=505)
  box(im,(616,259,1860,958),'#655a78',16)
  txt(im,(64,814),'MUSE WONDER',23,PURPLE,True)
  txt(im,(64,860),'Recorded excerpt\nEditorial playback timing',22,MUTED)
  L[key]=im
 L['finding']=panel('Every finding leads back to evidence.','The moment\nbehind the\nfinding.','A source your team\ncan inspect.','finding.jpg',True,eyebrow='INVESTIGATE / SOURCE-LINKED FINDINGS')
 # The arc is the actual UI capture; the source price frame is an original recording.
 im=canvas('Choose a reaction. See what happened.','EMOTIONAL ARC / RECORDED AI PERSONA REACTIONS',True)
 shot(im,'emotions-full.jpg',(64,260,1000,650),crop=(240,875,990,1250))
 frame=f.frame_at('maya',23.197).crop((140,180,1300,870)).resize((730,434),Image.Resampling.LANCZOS)
 box(im,(1119,260,1853,698),'#655a78',14);im.paste(frame,(1122,263))
 pill(im,1122,727,'ORIGINAL MOMENT · 00:23.197',RED)
 txt(im,(1122,800),'“The $280 total is over\nmy $250 limit…”',30,WHITE,True,width=730)
 txt(im,(64,932),'Actual source recording and recorded synthetic reaction.',20,MUTED)
 L['arc']=im
 L['impact']=panel('Compare journeys side by side.','Before.\nAfter.\nIn context.','Inspect where the\nexperience changes.','impact.jpg',True,eyebrow='CHANGE IMPACT / COMPARE VERSIONS')
 L['impact-alex']=panel('Switch perspectives.','Alex’s\nperspective.','The same change,\na different set of priorities.','impact-alex.jpg',True,eyebrow='CHANGE IMPACT / ANOTHER PERSPECTIVE')
 L['evidence']=panel('Understand where friction appears.','A clearer\nnext step.','Recordings. Reactions.\nFindings in context.','impact.jpg',True,eyebrow='FROM OBSERVATION TO UNDERSTANDING')
 L['candidate']=panel('Turn findings into an improvement.','From insight\nto a candidate.','A proposed change\nyour team can review.','candidate.jpg',True,eyebrow='MUSE CODE / IMPROVE THE EXPERIENCE')
 im=canvas('Two focused improvements.','META’S MUSE CODE / ACTUAL CANDIDATE',True)
 box(im,(64,280,1856,555),PANEL,26)
 txt(im,(98,305),'Reveal the full price before choosing',38,WHITE,True)
 box(im,(98,380,1822,447),'#482b37',12);txt(im,(118,392),'- const shown=QUICK_BOOKING?room.base:total(room);',31,RED,mono=True)
 box(im,(98,465,1822,532),'#293c33',12);txt(im,(118,477),'+ const shown=total(room);',31,GREEN,mono=True)
 for x,num,title,sub in [(64,'01','Show the full total','Atlas $280 · Willow $245'),(675,'02','Preserve entered details','Keep the meeting name'),(1286,'03','Keep the quick path','Preserve what worked for Alex')]:
  box(im,(x,605,x+570,860),PANEL,25);txt(im,(x+28,630),num,27,PURPLE,True)
  txt(im,(x+28,690),title,32,WHITE,True,width=514);txt(im,(x+28,770),sub,26,MUTED,width=514)
 txt(im,(64,923),'Source prices unchanged · Name retention checked separately by scripted browser QA',21,MUTED)
 L['patch']=im
 im=canvas('Fresh journeys. A clearer comparison.','RETEST / MAYA BEFORE AND AFTER',True)
 for x,label,col in [(64,'BEFORE · QUICK BOOKING',RED),(984,'AFTER · FIXED CANDIDATE',GREEN)]:
  pill(im,x,232,label,col);box(im,(x-3,287,x+875,811),'#655a78',16)
 L['retest']=im
 L['review']=panel('The evidence stays with the decision.','Inspect.\nReview.\nDecide.','Code, checks, and journeys.\nCandidate awaiting your review.','code-review.jpg',True,eyebrow='REVIEW / YOUR TEAM STAYS IN CONTROL')
 L['projects']=panel('Gather is one example.','Your product.\nYour journeys.','Explore what matters\nto your users.','projects.jpg',eyebrow='A WORKSPACE FOR YOUR PRODUCTS')
 im=canvas('Bring more perspectives into product decisions.','FOR DEVELOPERS, DESIGNERS, AND PRODUCT TEAMS')
 for x,n,title,body,col in [(64,'01','Discover friction','See the moments\nthat deserve attention.',PURPLE),(675,'02','Find opportunities','Understand what helps\nand where to improve.',LIME),(1286,'03','Test improvements','Compare fresh journeys\nand inspect the evidence.',GREEN)]:
  box(im,(x,310,x+570,850),PANEL,28);txt(im,(x+32,343),n,35,col,True)
  txt(im,(x+32,443),title,45,WHITE,True,width=505);txt(im,(x+32,615),body,33,MUTED,width=505)
 txt(im,(64,912),'Explore. Understand. Improve. Retest.',39,LIME,True)
 L['value']=im
 im=canvas('Better questions for real people.','AI JOURNEYS / HUMAN UNDERSTANDING')
 txt(im,(64,320),'More perspectives.\nBetter questions.',92,WHITE,True)
 txt(im,(64,610),'Use AI journeys to surface what deserves\nvalidation with real users.',42,MUTED)
 pill(im,64,815,'RECORDED EXPLORATION');pill(im,480,815,'INSPECTABLE EVIDENCE');pill(im,910,815,'HUMAN RESEARCH')
 L['research']=im
 im=canvas()
 txt(im,(64,205),'One product.',120,WHITE,True);txt(im,(64,365),'Many journeys.',120,LIME,True)
 txt(im,(64,610),'Understand the experience behind the outcome.',47,WHITE,True)
 txt(im,(64,770),'Built by Edson Henrique',29,PURPLE,True)
 txt(im,(64,832),'Hackathon build: persona journeys, evidence workspace, improvement and retesting.',25,MUTED,width=1770)
 txt(im,(64,916),'Meta’s Muse Wonder  +  Muse Code',27,WHITE,True)
 L['end']=im
 return L


def prepare_clips():
 items=[
 ('explore','alex',[(6.2,12.5,5.7)],(1236,690),(80,160,1280,742)),
 ('alex','alex',[(18.0,22.8,3.03)],(1236,690),(80,160,1280,742)),
 ('price','maya',[(21.197,23.197,2),(23.197,23.197,1.9)],(1236,690),(80,160,1280,742)),
 ('name','maya',[(35.6,40.7,4.2)],(1236,690),(80,160,1280,742)),
 ('success','maya',[(52,55.8,3.8),(55.8,55.8,3)],(1236,690),(80,160,1280,742)),
 ('retest-before','before',[(19.597,22.597,3),(22.597,22.597,4),(22.597,28.497,5.9)],(872,518),(140,180,1160,690)),
 ('retest-after','after',[(17.156,20.156,3),(20.156,20.156,4),(20.156,26.056,5.9)],(872,518),(140,180,1160,690))]
 for name,key,seg,size,crop in items:
  f.prepare_clip(name,key,seg,size,crop)
  beat=next(v for v in B if v[2]==('retest' if name.startswith('retest') else name))
  f.CLIPS[name]['filmVisibleRange']=[beat[0],beat[1]]


def overlay(im,key,t):
 d=ImageDraw.Draw(im)
 if key=='people':
  x=64 if t<6.8 else 984;col=GREEN if x==64 else PURPLE
  d.rounded_rectangle((x,280,x+872,830),28,outline=col,width=4)
 if key=='retest':
  # Review is the explicitly matched stage. Other playback is an editorial comparison.
  delta=t if t<3 else 3 if t<7 else t-4
  for x,k,anchor,col in [(64,'before',19.597,'#b9b2c6'),(984,'after',17.156,PURPLE)]:
   clock=anchor+delta;signals=f.RUNS[k]['experience'];selected=max([j for j,s in enumerate(signals) if s['videoMs']/1000<=clock+.025],default=0)
   txt(im,(x+690,239),f'{clock:06.3f}s',18,WHITE,True)
   txt(im,(x+6,824),signals[selected]['reaction'],21,WHITE,width=856)
   left=x+15;right=x+857;top=904
   for val,colbg in [(2,'#27382f'),(1,'#29342e'),(0,'#302d38'),(-1,'#3d3031'),(-2,'#462e37')]:
    yy=top+(2-val)*8;d.rectangle((left,yy,right,yy+8),fill=colbg)
   pts=[(left+j/(len(signals)-1)*(right-left),top+(2-f.VAL[s['valence']])*8+4) for j,s in enumerate(signals)]
   d.line(pts,fill=col,width=3)
   for j,(px,py) in enumerate(pts):
    r=5 if j==selected else 2;d.ellipse((px-r,py-r,px+r,py+r),fill=col)
  if t>=4.1:pill(im,1435,152,'12 TO 6 ACTIONS',LIME)
  txt(im,(64,951),'Recorded AI reactions · Observation progress · '+('Held at Review booking' if 3<=t<7 else 'Independent sessions; paired at Review booking'),16,MUTED)
 if key in ['price','success']:
  held=(key=='price' and t>=2) or (key=='success' and t>=3.8)
  if held:txt(im,(635,931),'Held source frame',17,'#35303e')
 if key=='end':d.line((64,548,64+round(1250*min(1,t/1.7)),548),fill=PURPLE,width=5)


def render_chapter(i,L,reuse=False):
 c=C[i];target=BUILD/f'chapter-{i:02}.mp4'
 signature=hashlib.sha256(Path(__file__).read_bytes()+json.dumps(f.SOURCES,sort_keys=True).encode()+json.dumps(c).encode()).hexdigest()
 mark=target.with_suffix('.sha256')
 if reuse and target.exists() and mark.exists() and mark.read_text()==signature:return
 enc=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','2',str(target)],stdin=subprocess.PIPE)
 active={};previous=None;last=None;transition=None
 for n in range(c['duration']*FPS):
  now=c['start']+n/FPS;a,b,key=next(x for x in B if x[0]<=now<x[1]);local=now-a
  im=L[key].copy()
  if key!=last:transition=(previous.copy() if previous else None,n);last=key
  names=[key] if key in ['explore','alex','price','name','success'] else ['retest-before','retest-after'] if key=='retest' else []
  for name in names:
   s=f.CLIPS[name]
   if name not in active:active[name]=(*f.reader(s),None,0)
   proc,size,prev,missing=active[name];data=proc.stdout.read(size)
   if len(data)==size:prev=Image.frombytes('RGB',tuple(s['size']),data);missing=0
   else:missing+=1
   if prev is None or missing>2:raise RuntimeError(f'Source clip ended early: {name} {missing}')
   active[name]=(proc,size,prev,missing)
   im.paste(prev,(64 if name.endswith('before') else 984,290) if key=='retest' else (620,264))
  overlay(im,key,local)
  # Soft editorial dissolve; source pixels and factual numbers are unchanged.
  if transition and transition[0] is not None and n-transition[1]<8:im=Image.blend(transition[0],im,(n-transition[1]+1)/8)
  ImageDraw.Draw(im).rectangle((0,1076,round(W*now/180),1079),fill=PURPLE)
  if n==0 or n==c['duration']*FPS//2:im.save(BUILD/f'qa-{i}-{n}.jpg',quality=93)
  enc.stdin.write(im.tobytes());previous=im
 enc.stdin.close()
 if enc.wait():raise RuntimeError('Encoder failed')
 for proc,_,_,_ in active.values():
  while proc.stdout.read(1024*1024):pass
  proc.stdout.close()
  if proc.wait():raise RuntimeError('Decoder failed')
 mark.write_text(signature);print('Rendered chapter',i+1,flush=True)


def exports():
 (BUILD/'concat.txt').write_text(''.join(f"file '{BUILD/f'chapter-{i:02}.mp4'}'\n" for i in range(7)))
 f.ff('-f','concat','-safe',0,'-i',BUILD/'concat.txt','-c','copy','-movflags','+faststart',OUT/'picture.mp4')
 f.music()
 f.ff('-i',OUT/'narration.wav','-i',OUT/'music.wav','-filter_complex','[0:a]loudnorm=I=-18:TP=-2:LRA=9,pan=stereo|c0=c0|c1=c0[v];[1:a]volume=0.65[m];[v][m]amix=inputs=2:normalize=0,alimiter=limit=0.89[out]','-map','[out]','-ar',48000,'-c:a','pcm_s16le',OUT/'mix.wav')
 f.ff('-i',OUT/'picture.mp4','-i',OUT/'mix.wav','-i',OUT/'captions.srt','-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-c:a','aac','-b:a','192k','-c:s','mov_text','-metadata:s:s:0','language=eng','-metadata','title=Journey Lab — One product. Many journeys.','-metadata','comment=Approved script; actual UI and recorded synthetic persona journeys.','-movflags','+faststart','-t',180,OUT/'film.mp4')
 sub=f"subtitles={OUT/'captions.srt'}:force_style='FontName=Avenir Next,Fontsize=9,PrimaryColour=&HFFFFFF&,OutlineColour=&H170E10&,BackColour=&H170E10&,BorderStyle=3,Outline=1,Shadow=0,MarginV=6,MarginL=18,MarginR=18,Alignment=2'"
 f.ff('-i',OUT/'film.mp4','-vf',sub,'-map','0:v','-map','0:a','-c:v','libx264','-preset','veryfast','-crf',18,'-c:a','copy','-threads',3,'-movflags','+faststart',OUT/'film-captioned.mp4')
 f.ff('-ss',177.6,'-i',OUT/'film.mp4','-frames:v',1,'-q:v',2,OUT/'poster.jpg')
 manifest={'title':'Journey Lab · approved three-minute script','duration':180,'dimensions':[W,H],'fps':FPS,'chapters':C,'visualBeats':[{'start':a,'end':b,'layout':k} for a,b,k in B],
  'sourceHashes':f.SOURCES,'clips':{k:{**v,'prepared':str(v['prepared'].relative_to(ROOT))} for k,v in f.CLIPS.items()},
  'exports':{p.name:{'sha256':f.sha(p),'bytes':p.stat().st_size} for p in [OUT/'film.mp4',OUT/'film-captioned.mp4',OUT/'captions.vtt',OUT/'captions.srt',OUT/'narration.wav']},
  'notes':['Approved narration preserved verbatim.','UI captures are actual read-only application states; own-app form entries are illustrative unsaved examples.','Gather is a fictional sample application. Persona reactions are synthetic, not human sentiment.','Recordings are editorial excerpts with playback timing changes and labeled holds.','Maya retest is 12 to 6 recorded actions; Alex quick path preserved without attributing its stop-point difference to optimization.','All room prices unchanged; meeting-name retention independently checked by scripted browser QA.','Candidate remains awaiting_review. No new model run, approval, PR, deployment, or publication performed.','Narration synthesized locally. Music composed procedurally; no third-party recording.']}
 (OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
 print('Exported',OUT/'film-captioned.mp4',flush=True)


def main():
 ap=argparse.ArgumentParser();ap.add_argument('--preview',action='store_true');ap.add_argument('--reuse',action='store_true');ap.add_argument('--export-only',action='store_true');args=ap.parse_args()
 prepare_clips();L=layouts()
 contact=Image.new('RGB',(1440,math.ceil(len(B)/3)*300),BG);d=ImageDraw.Draw(contact)
 for j,(a,b,key) in enumerate(B):
  im=L[key].copy()
  # Include actual clip frames in storyboard previews.
  names=[key] if key in ['explore','alex','price','name','success'] else ['retest-before','retest-after'] if key=='retest' else []
  for name in names:
   dest=BUILD/f'preview-{name}.jpg';f.ff('-ss',min(2.5,(b-a)/2),'-i',f.CLIPS[name]['prepared'],'-frames:v',1,dest)
   img=Image.open(dest);im.paste(img,(64 if name.endswith('before') else 984,290) if key=='retest' else (620,264))
  overlay(im,key,(b-a)/2);im.save(BUILD/f'layout-{key}.jpg',quality=94)
  thumb=im.resize((480,270));x=j%3*480;y=j//3*300;contact.paste(thumb,(x,y+25));d.text((x+8,y+6),f'{a:06.2f}  {key}',fill='white')
 contact.save(OUT/'storyboard.jpg',quality=92)
 if args.preview:return
 if not args.export_only:
  with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda i:render_chapter(i,L,args.reuse),range(7)))
 exports()
if __name__=='__main__':main()
