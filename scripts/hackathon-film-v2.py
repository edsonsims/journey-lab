#!/usr/bin/env python3
"""Value-first 180-second revision: sixteen short beats, first contrast at 16s.

Uses the first-cut renderer's audio/media utilities without overwriting its output.
No provider calls, uploads, product mutations, or candidate approvals.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse, hashlib, importlib.util, json, math, re, shutil, subprocess
from PIL import Image, ImageDraw, ImageOps

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('film_common',ROOT/'scripts/hackathon-film.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
f.OUT=ROOT/'outputs/hackathon-film-v2';f.BUILD=f.OUT/'build';f.ASSETS=f.OUT/'assets'
f.CHAPTERS=json.loads((ROOT/'scripts/hackathon-film-v2.json').read_text())
f.RATE=158
OUT,BUILD,ASSETS=f.OUT,f.BUILD,f.ASSETS
C=f.CHAPTERS;W,H,FPS=1920,1080,30
BG,PANEL,WHITE,MUTED,PURPLE,LIME,RED,GREEN=f.BG,f.PANEL,f.WHITE,f.MUTED,f.PURPLE,f.LIME,f.RED,f.GREEN
txt,box,pill,arrow,base,shot=f.txt,f.box,f.pill,f.arrow,f.base,f.screenshot


def prepare():
    for p in [OUT,BUILD,ASSETS]:p.mkdir(parents=True,exist_ok=True)
    for filename in ['home.jpg','candidate.jpg','personas.jpg','journeys.jpg','emotions.jpg','impact.jpg','experience.png','parent-phone.png']:
        origin=f.source(ROOT/'outputs/hackathon-film-v1/assets'/filename)
        target=ASSETS/filename
        if not target.exists():shutil.copy2(origin,target)
    for key,id in f.IDS.items():
        p=f.source(ROOT/'journey-engine/runs'/id/'run.json');f.RUNS[key]=json.loads(p.read_text())
    for p in [
        ROOT/'outputs/gather-pr-demo/report.json',ROOT/'outputs/gather-pr-demo/muse-code-receipt.json',
        ROOT/'gather/qa/results/muse-candidate-2026-11-01T23-11-43.791Z/receipt.json',
        ROOT/'journey-engine/runs/8b881bbf-a4f7-4bb5-aa7f-c56f35ff076c/run.json',
        ROOT/'journey-engine/runs/8b881bbf-a4f7-4bb5-aa7f-c56f35ff076c/screen-026.png',
        ROOT/'scripts/hackathon-film-v2.json']:
        f.source(p)
    fix=ROOT/'journey-engine/workspace-data/fixes/4c801e88-44d9-4dfe-8148-2ffb9b9d78f1/fix.json'
    data=json.loads(f.source(fix).read_text());assert data['status']=='awaiting_review'
    candidate=f.source(Path(data['rounds'][0]['candidateDirectory'])/'app.js')
    assert 'const shown=total(room);' in candidate.read_text()
    f.audio()
    # Every prepared clip has an explicit visible film interval.
    clips=[
        ('contrast-alex','alex',[(16.237,22.237,6),(22.237,22.237,6)],(872,518),(140,180,1160,690),[16,28]),
        ('contrast-maya','maya',[(17.197,23.197,6),(23.197,23.197,6)],(872,518),(140,180,1160,690),[16,28]),
        ('price-choice','maya',[(6.0,10.0,f.onset(5,1))],(1190,690),(80,160,1280,742),[48,48+f.onset(5,1)]),
        ('price-review','maya',[(21.197,23.197,2),(23.197,23.197,12-f.onset(5,1)-2)],(1190,690),(80,160,1280,742),[48+f.onset(5,1),60]),
        ('name','maya',[(35.6,42.77,10)],(1190,690),(80,160,1280,742),[60,70]),
        ('retest-before','before',[(19.597,22.597,3),(22.597,22.597,5),(22.597,30.597,8)],(872,518),(140,180,1160,690),[106,122]),
        ('retest-after','after',[(17.156,20.156,3),(20.156,20.156,5),(20.156,28.156,8)],(872,518),(140,180,1160,690),[106,122]),
    ]
    for name,key,segments,size,crop,visible in clips:
        f.prepare_clip(name,key,segments,size,crop);f.CLIPS[name]['filmVisibleRange']=visible
    (OUT/'chapters.json').write_text(json.dumps(C,indent=2,ensure_ascii=False)+'\n')
    (OUT/'script.txt').write_text('\n\n'.join(f'{f.stamp(c["start"])} — {c["title"]}\n{c["speech"]}' for c in C)+'\n')


def image_panel(ch,title,filename,main,sub,eyebrow):
    im=base(ch,title,eyebrow)
    shot(im,filename,(650,265,1206,685))
    txt(im,(64,325),main,62,WHITE,True,width=535)
    txt(im,(64,640),sub,31,MUTED,width=520)
    return im


def mini_path(im,x,y,count,color,w=700):
    d=ImageDraw.Draw(im)
    for j in range(count):
        px=x+j*w/(count-1)
        if j: d.line((px-w/(count-1),y,px,y),fill=color,width=4)
        d.ellipse((px-6,y-6,px+6,y+6),fill=color)


def layouts():
    L={}
    L['intro']=image_panel(0,'Understand your app through AI personas.','home.jpg',
        'See the experience\nbefore launch.','Different goals.\nDifferent constraints.\nDifferent journeys.','THIS IS JOURNEY LAB')
    im=base(1,'One change affects many journeys.','THE PROBLEM / BEFORE YOU RELEASE')
    pill(im,64,270,'ONE PROPOSED UPDATE: QUICK BOOKING')
    for x,name,old,new,color in [(64,'ALEX',8,6,GREEN),(984,'MAYA',7,12,RED)]:
        box(im,(x,350,x+872,820),PANEL,28)
        txt(im,(x+34,382),name,28,color,True)
        txt(im,(x+34,442),str(old),120,WHITE,True)
        arrow(im,x+195,531,x+305,color,7)
        txt(im,(x+350,442),str(new),120,color,True)
        txt(im,(x+34,614),'recorded actions',30,MUTED)
        mini_path(im,x+55,735,new,color)
    txt(im,(64,870),'Who benefits? Who does more work?',45,WHITE,True)
    txt(im,(64,943),'Gather · Example booking app · Recorded AI persona journeys',19,MUTED)
    L['change']=im
    im=base(2,'The discrepancy is visible in the journey.','GATHER / SAME PROPOSED CHANGE')
    for x,name,metric,color in [(64,'ALEX / $350 BUDGET','8 TO 6 ACTIONS',GREEN),(984,'MAYA / $250 BUDGET','7 TO 12 ACTIONS',RED)]:
        pill(im,x,235,name,color);pill(im,x+515,235,metric,color)
        box(im,(x-3,292,x+875,816),'#655a78',15)
    txt(im,(64,846),'A shorter route to confirmation.',33,GREEN,True)
    txt(im,(984,846),'A late price surprise. More work.',33,RED,True)
    txt(im,(64,942),'Current to proposed · Recorded session action counts · Both ultimately reach the goal',19,MUTED)
    L['contrast']=im
    im=base(3,'Both succeed. The experience still differs.','WHY COMPLETION IS ONLY PART OF THE STORY')
    for x,key,t in [(64,'alex',22.237),(984,'maya',53.647)]:
        img=f.frame_at(key,t).crop((140,180,1300,870)).resize((872,518),Image.Resampling.LANCZOS)
        box(im,(x-3,292,x+875,816),'#655a78',15);im.paste(img,(x,295))
    txt(im,(64,850),'2 goals reached.',55,LIME,True)
    txt(im,(984,850),'Different effort to get there.',39,WHITE,True)
    txt(im,(64,941),'Actual confirmation frames · Synthetic persona journeys',19,MUTED)
    L['success']=im
    im=base(4,'Give each perspective context.','MUSE WONDER / GOALS DRIVE THE EXPLORATION')
    shot(im,'personas.jpg',(850,260,1006,695))
    for y,name,budget,goal,color in [(300,'Alex','$350','Keep the booking quick.',GREEN),(595,'Maya','$250','Stay within the full total.',PURPLE)]:
        box(im,(64,y,780,y+245),PANEL,24)
        txt(im,(94,y+20),name,53,color,True);txt(im,(500,y+25),budget,57,WHITE,True)
        txt(im,(94,y+115),goal,31,WHITE)
        txt(im,(94,y+175),'12 people · Projector',25,MUTED)
    L['context']=im
    for key,ch,title,metric,sub,color in [
        ('price-choice',5,'Catch the surprise before your customers do.','$220','The room rate looks\nwithin Maya’s budget.',PURPLE),
        ('price-review',5,'The full total changes the decision.','$280','Her complete budget: $250.\nShe has to go back.',RED),
        ('name',6,'Find the work your product makes people repeat.','Again.','Change room.\nLose the meeting name.\nEnter it again.',RED)]:
        im=base(ch,title,'RECORDED BROWSER EVIDENCE / MAYA')
        txt(im,(64,330),metric,110,color,True)
        txt(im,(64,500),sub,35,WHITE,width=500)
        box(im,(647,242,1859,946),'#655a78',20)
        txt(im,(64,820),'A specific moment\nyour team can improve.',30,MUTED,width=490)
        txt(im,(64,946),'Actual recorded excerpts · Editorial playback timing',18,MUTED)
        L[key]=im
    L['reaction']=image_panel(7,'Go from a reaction to the evidence.','emotions.jpg',
        'Find the moment\nthat matters.','Recorded AI reactions\npoint to specific screens\nand actions.','UNDERSTAND WHY THE JOURNEY DIFFERS')
    L['evidence']=image_panel(7,'See exactly what happened.','experience.png',
        '22.597s','A price over budget.\nThe screen behind it.\nEvidence to investigate.','SOURCE MOMENT / ORIGINAL RECORDING')
    L['candidate']=image_panel(8,'Turn feedback into a reviewable fix.','candidate.jpg',
        'Understanding\nbecomes action.','Muse Code prepares\na candidate grounded\nin the findings.','MUSE CODE / A CANDIDATE FOR REVIEW')
    im=base(8,'Fix the friction. Preserve the quick path.','ACTUAL CANDIDATE / app.js')
    box(im,(64,280,1856,565),PANEL,26)
    txt(im,(98,312),'Show the full price before choosing',35,WHITE,True)
    box(im,(98,382,1822,450),'#482b37',12)
    txt(im,(120,395),'- const shown=QUICK_BOOKING?room.base:total(room);',31,RED,mono=True)
    box(im,(98,472,1822,540),'#293c33',12)
    txt(im,(120,486),'+ const shown=total(room);',31,GREEN,mono=True)
    for x,n,title,desc in [(64,'01','Show the total early','The right option is clear.'),(675,'02','Keep entered details','No repeated meeting name.'),(1286,'03','Keep the shortcut','Alex’s quick path stays.')]:
        box(im,(x,615,x+570,855),PANEL,24)
        txt(im,(x+28,642),n,27,PURPLE,True);txt(im,(x+28,695),title,33,WHITE,True)
        txt(im,(x+28,775),desc,27,MUTED,width=515)
    txt(im,(64,923),'Actual Muse Code patch · Source room prices are unchanged',22,MUTED)
    L['code']=im
    L['review']=image_panel(9,'Stay in control of the change.','candidate.jpg',
        'Inspect.\nRetest.\nApprove.','16 independent browser\nchecks passed.\nCandidate awaiting review.','A REVIEWABLE IMPROVEMENT')
    im=base(10,'Retest both perspectives.','FRESH SESSIONS / MAYA BEFORE AND AFTER')
    pill(im,1460,155,'12 TO 6 ACTIONS',LIME)
    for x,label,color in [(64,'BEFORE / QUICK BOOKING',RED),(984,'AFTER / FIXED CANDIDATE',GREEN)]:
        pill(im,x,228,label,color);box(im,(x-3,282,x+875,806),'#655a78',15)
    L['retest']=im
    L['impact']=image_panel(11,'See the whole journey.','impact.jpg',
        'What improved?\nWhat remains?','Paired recordings.\nFull reaction arcs.\nEach perspective in view.','CHANGE IMPACT / ACTUAL JOURNEY LAB WORKSPACE')
    L['phone']=image_panel(12,'Explore needs beyond your own.','parent-phone.png',
        'A parent\non a phone.','LittleSteps / another example\nLimited time. No printer.','DIFFERENT CONTEXTS / DIFFERENT NEEDS')
    L['more-context']=image_panel(12,'Explore different starting points.','personas.jpg',
        'First visit.\nReturning user.\nDifferent needs.','Define the goal and context\nfor the perspective\nyou want to explore.','AI PERSONAS / EXPLICIT CONTEXT')
    im=base(13,'Find it while there is still time to act.','BEFORE LAUNCH / BEFORE THE NEXT RELEASE')
    for x,n,title,body,color in [(64,'01','Who benefits?','A shorter journey\nfor Alex.',GREEN),
        (675,'02','Who does more work?','Late pricing and\nrepeated input for Maya.',RED),
        (1286,'03','What should change?','Early full totals.\nPreserved meeting details.',PURPLE)]:
        box(im,(x,300,x+570,805),PANEL,28)
        txt(im,(x+32,337),n,33,color,True);txt(im,(x+32,430),title,41,WHITE,True,width=505)
        txt(im,(x+32,590),body,32,MUTED,width=505)
    txt(im,(64,865),'Earlier signals. Clearer priorities. Evidence for the next decision.',39,WHITE,True,width=1770)
    txt(im,(64,944),'Illustrated with recorded local change comparisons · Real-user research remains essential',19,MUTED)
    L['prelaunch']=im
    im=base(14,'From discovery to a better experience.','BUILT DURING THE META AI HACKATHON')
    for x,n,label,model,desc in [(64,'01','Explore','MUSE WONDER','Navigate with a persona’s\ngoal and constraints.'),
        (675,'02','Improve','MUSE CODE','Turn sourced findings\ninto a reviewable candidate.'),
        (1286,'03','Retest','MUSE WONDER','Compare fresh journeys\nacross both perspectives.')]:
        box(im,(x,300,x+570,823),PANEL,28)
        txt(im,(x+30,332),n,30,PURPLE,True);txt(im,(x+30,420),label,64,WHITE,True)
        pill(im,x+30,535,model,LIME);txt(im,(x+30,635),desc,31,MUTED,width=510)
    txt(im,(64,885),'Explore. Understand. Improve. Retest.',49,LIME,True)
    L['workflow']=im
    im=base(15,'')
    txt(im,(64,195),'One product.',120,WHITE,True);txt(im,(64,350),'Many journeys.',120,LIME,True)
    txt(im,(64,590),'See the impact before you ship.',61,WHITE,True)
    txt(im,(64,750),'Find the differences. Improve the experience.',35,PURPLE,True)
    txt(im,(64,905),'Journey Lab · Built by Edson Henrique · Meta Global AI Developer Hackathon',25,MUTED)
    L['end']=im
    return L


def key_for(i,t):
    if i==5:return 'price-choice' if t<f.onset(5,1) else 'price-review'
    if i==7:return 'reaction' if t<4 else 'evidence'
    if i==8:return 'candidate' if t<4 else 'code'
    if i==12:return 'phone' if t<5 else 'more-context'
    return ['intro','change','contrast','success','context',None,'name',None,None,'review','retest','impact',None,'prelaunch','workflow','end'][i]


def retest_overlay(im,t):
    delta=t if t<3 else 3 if t<8 else t-5
    for x,key,anchor,color in [(64,'before',19.597,'#b9b2c6'),(984,'after',17.156,PURPLE)]:
        clock=anchor+delta;signals=f.RUNS[key]['experience']
        selected=max([j for j,s in enumerate(signals) if s['videoMs']/1000<=clock+.025],default=0)
        txt(im,(x+700,235),f'{clock:06.3f}s',18,WHITE,True)
        txt(im,(x+10,817),signals[selected]['reaction'],20,WHITE,width=852)
        d=ImageDraw.Draw(im);left=x+24;right=x+850;top=883
        for val,col in [(2,'#27382f'),(1,'#29342e'),(0,'#302d38'),(-1,'#3d3031'),(-2,'#462e37')]:
            yy=top+(2-val)*12;d.rectangle((left,yy,right,yy+12),fill=col)
        points=[(left+j/(len(signals)-1)*(right-left),top+(2-f.VAL[s['valence']])*12+6) for j,s in enumerate(signals)]
        d.line(points,fill=color,width=3)
        for j,(px,py) in enumerate(points):
            r=6 if j==selected else 3;d.ellipse((px-r,py-r,px+r,py+r),fill=color,outline=WHITE if j==selected else None,width=2)
    if 3<=t<8:pill(im,900,155,'HELD REVIEW FRAMES',LIME)
    txt(im,(64,956),'Full recorded AI reactions · Observation progress · Review booking is the paired stage',16,MUTED)


def render(i,L,reuse,signature):
    c=C[i];target=BUILD/f'chapter-{i:02}.mp4';mark=target.with_suffix('.sha256')
    if reuse and target.exists() and mark.exists() and mark.read_text()==signature:
        print('Reuse',i+1,flush=True);return
    encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24',
        '-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','2',str(target)],stdin=subprocess.PIPE)
    active={};last=None;previous=None;transition=None
    for n in range(c['duration']*FPS):
        t=n/FPS;key=key_for(i,t);im=L[key].copy()
        if key!=last:transition=(previous.copy() if previous else None,n);last=key
        names=['contrast-alex','contrast-maya'] if i==2 else ['retest-before','retest-after'] if i==10 else [key] if i in [5,6] else []
        for name in names:
            spec=f.CLIPS[name]
            if name not in active:active[name]=(*f.reader(spec),None,0)
            proc,size,prev,missing=active[name];data=proc.stdout.read(size)
            if len(data)==size:prev=Image.frombytes('RGB',tuple(spec['size']),data);missing=0
            else:missing+=1
            if prev is None or missing>1:raise RuntimeError(f'Prepared recording ended early: {name}')
            active[name]=(proc,size,prev,missing)
            xy=((64 if name.endswith(('alex','before')) else 984),295 if i==2 else 285) if i in [2,10] else (654,249)
            im.paste(prev,xy)
        if i==10:retest_overlay(im,t)
        if i==2 and t>=6:txt(im,(760,909),'Held source frames',18,MUTED)
        if i==4:
            y=300 if t<4 else 595
            ImageDraw.Draw(im).rounded_rectangle((64,y,780,y+245),24,outline=GREEN if y==300 else PURPLE,width=3)
        if i==15:
            ImageDraw.Draw(im).line((64,540,64+int(1270*min(1,t/1.2)),540),fill=PURPLE,width=5)
        if transition and transition[0] is not None and n-transition[1]<6:
            im=Image.blend(transition[0],im,(n-transition[1]+1)/6)
        ImageDraw.Draw(im).rectangle((0,1076,int(W*(c['start']+t)/180),1079),fill=PURPLE)
        if i==15 and t>9.4:im=Image.blend(im,Image.new('RGB',(W,H),BG),(t-9.4)/.6)
        if n in [0,c['duration']*FPS//2,(c['duration']-1)*FPS]:im.save(BUILD/f'qa-{i}-{n}.jpg',quality=92)
        encoder.stdin.write(im.tobytes());previous=im
    encoder.stdin.close()
    if encoder.wait()!=0:raise RuntimeError('Chapter encode failed')
    for proc,_,_,_ in active.values():
        while proc.stdout.read(1024*1024):pass
        proc.stdout.close()
        if proc.wait()!=0:raise RuntimeError('Recording decoder failed')
    mark.write_text(signature);print('Rendered',i+1,'/',len(C),flush=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');parser.add_argument('--reuse',action='store_true');args=parser.parse_args()
    assert sum(c['duration'] for c in C)==180
    assert all(c['start']==sum(x['duration'] for x in C[:i]) for i,c in enumerate(C))
    prepare();L=layouts()
    for k,im in L.items():im.save(BUILD/f'layout-{k}.jpg',quality=92)
    contact=Image.new('RGB',(1600,math.ceil(len(L)/4)*254),BG)
    for j,(k,im) in enumerate(L.items()):
        x=j%4*400;y=j//4*254;contact.paste(im.resize((400,225),Image.Resampling.LANCZOS),(x,y));ImageDraw.Draw(contact).text((x+8,y+229),k,fill='white')
    contact.save(OUT/'storyboard.jpg',quality=92)
    if args.preview:return
    f.music()
    signature=hashlib.sha256((f.sha(__file__)+f.sha(ROOT/'scripts/hackathon-film.py')+json.dumps(f.SOURCES,sort_keys=True)+json.dumps(f.CUES)).encode()).hexdigest()
    with ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda i:render(i,L,args.reuse,signature),range(len(C))))
    f.exports()
    # Correct the review-cut metadata without recompressing picture or sound.
    for name in ['film.mp4','film-captioned.mp4']:
        f.ff('-i',OUT/name,'-map','0','-c','copy','-metadata','title=Journey Lab — See the impact before you ship / Review cut 02','-movflags','+faststart',OUT/'film-tagged.mp4')
        (OUT/'film-tagged.mp4').replace(OUT/name)
    f.ff('-ss',172,'-i',OUT/'film.mp4','-frames:v',1,'-q:v',2,OUT/'poster.jpg')
    html=(ROOT/'scripts/hackathon-film-player.html').read_text().replace('Review cut 01','Review cut 02').replace('Review-01','Review-02').replace('Local review cut · 01','Local review cut · 02')
    html=re.sub(r'const fallbackChapters = \[.*?\];','const fallbackChapters = '+json.dumps(C,ensure_ascii=False)+';',html,flags=re.S)
    html=html.replace('See the experience behind a successful outcome.','See the impact before you ship.')
    (OUT/'index.html').write_text(html)
    changed=[p for p,h in f.SOURCES.items() if f.sha(ROOT/p)!=h]
    if changed:raise RuntimeError(f'Source changed: {changed}')
    manifest={'title':'Journey Lab — See the impact before you ship','reviewCut':2,'durationSeconds':180,'resolution':[W,H],'fps':FPS,
        'narration':{'provider':'local macOS speech synthesis','voice':f.VOICE,'rate':f.RATE,'cues':'narration-cues.json'},
        'editorialIntent':'Introduce the product immediately; first discrepancy at16s. Sixteen8–16second value beats. Original first cut retained.',
        'chapters':C,'clips':[{k:v for k,v in s.items() if k!='prepared'} for s in f.CLIPS.values()],
        'pairedReview':{'filmHold':[109,114],'before':22.597,'after':20.156},
        'sourceHashes':f.SOURCES,'sourcesUnchanged':True,
        'claims':{'AlexCurrentToProposedActions':[8,6],'MayaCurrentToProposedActions':[7,12],'MayaFreshRetestActions':[12,6],'bothGoalsReached':True,'candidateChecks':16},
        'limits':['AI perspectives identify possible friction; they do not predict measured human sentiment.','Before launch is the demonstrated local-build use case, not proof of a prevented production incident.','Prices unchanged; candidate awaiting review.','No external PR synchronization, merge, deployment, or ElevenLabs request.'],
        'exports':{name:{'sha256':f.sha(OUT/name),'duration':f.duration(OUT/name)} for name in ['film.mp4','film-captioned.mp4','picture.mp4','narration.wav','music.wav']}}
    (OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print('Complete:',OUT/'film-captioned.mp4',flush=True)


if __name__=='__main__':main()
