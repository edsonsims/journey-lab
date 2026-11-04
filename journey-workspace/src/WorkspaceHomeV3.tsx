import {Button} from './App';
import {HomeProcessSteps} from './HomeProcessSteps';
import {Icon} from './icons';
import {list} from './lib';
import type {Row} from './lib';
import './workspace-home-v3.css';

const meetingRoom=new URL('./assets/dashboard-story/meeting-room.png',import.meta.url).href;

type Props={data:Row;navigate:(path:string)=>void;onNewProject:()=>void};
type Perspective='alex'|'maya'|'sam'|'priya'|'jordan'|'casey';
const personaIds:Record<Perspective,string>={alex:'gather-assistant',maya:'gather-coordinator',sam:'gather-first-time',priya:'gather-second-language',jordan:'gather-slow-mobile',casey:'gather-keyboard'};

// An editorial illustration of the fictional Gather scenario, not live run metrics.
// Recorded results and their eligibility checks remain in the guided example.
const reactionScale={
 excellent:{label:'Excellent',color:'#29835e'},
 good:{label:'Good',color:'#3f75c0'},
 neutral:{label:'Neutral',color:'#7d7891'},
 bad:{label:'Bad',color:'#b4792a'},
 'very-bad':{label:'Very bad',color:'#bf4f5e'}
} as const;
type ReactionLevel=keyof typeof reactionScale;
const perspectives=[
 {id:'alex',name:'Alex',role:'Executive assistant',priority:'Make it quick.',icon:'clock',tone:'violet',side:'left',steps:['Choose a room','Review total','Confirm booking'],emotions:['Optimistic','Confident','Delighted'],levels:['good','good','excellent'],points:[[24,44],[120,28],[216,18]],path:'M24 44 C66 44 77 28 120 28 S172 18 216 18'},
 {id:'sam',name:'Sam',role:'First-time visitor',priority:'Help me get started.',icon:'spark',tone:'blue',side:'left',steps:['Read introduction','Compare rooms','Choose a room'],emotions:['Unsure','Curious','Confident'],levels:['neutral','good','good'],points:[[24,44],[120,38],[216,22]],path:'M24 44 C34 12 60 12 74 35 S104 60 120 38 S178 16 216 22'},
 {id:'jordan',name:'Jordan',role:'Mobile · slow connection',priority:'Help me through the wait.',icon:'devices',tone:'teal',side:'left',steps:['Open rooms on mobile','Wait for room details','Retry after a stall'],emotions:['Interested','Impatient','Frustrated'],levels:['good','bad','bad'],points:[[24,25],[120,41],[216,54]],path:'M24 25 C64 1 68 62 120 41 S168 5 180 35 S202 66 216 54'},
 {id:'maya',name:'Maya',role:'Office coordinator',priority:'Make every dollar count.',icon:'tokens',tone:'amber',side:'right',steps:['See full price','Change rooms','Confirm booking'],emotions:['Concerned','Frustrated','Relieved'],levels:['neutral','bad','good'],points:[[24,18],[120,58],[216,24]],path:'M24 18 H65 Q83 18 83 36 V45 Q83 58 98 58 H128 Q145 58 145 43 V37 Q145 24 163 24 H216'},
 {id:'casey',name:'Casey',role:'Needs keyboard access',priority:'Can’t confirm a booking by keyboard.',icon:'keyboard',tone:'slate',side:'right',steps:['Navigate by keyboard','Confirm button is unreachable','Booking cannot finish'],emotions:['Hopeful','Frustrated','Excluded'],levels:['good','bad','very-bad'],points:[[24,22],[120,48],[216,64]],path:'M24 22 H65 V35 H94 V48 H120 H154 V64 H216'},
 {id:'priya',name:'Priya',role:'Second-language user',priority:'Make the terms clear.',icon:'comment',tone:'rose',side:'right',steps:['Read unfamiliar terms','Open a simple explanation','Confirm the booking'],emotions:['Confused','Relieved','Delighted'],levels:['bad','good','excellent'],points:[[24,54],[120,34],[216,17]],path:'M24 54 H68 Q86 54 86 44 V43 Q86 34 101 34 H120 Q143 34 143 25 Q143 17 160 17 H216'}
] as const;

type PersonaIllustration=typeof perspectives[number];
function EmotionFace({level}:{level:ReactionLevel}){
 return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/>{level==='excellent'?<><path d="M5.5 7.8q1.5-2.2 3 0m3 0q1.5-2.2 3 0"/><path d="M6 10.5h8q-.6 5-4 5t-4-5Z"/></>:<><path d="M6.8 7.5v.2m6.4-.2v.2"/>{level==='good'?<path d="M6.5 11.5q3.5 4 7 0"/>:level==='bad'?<path d="M6.5 14q3.5-4 7 0"/>:level==='very-bad'?<><path d="m5.5 5.2 3 1.2m3 0 3-1.2M6 14.5q4-6 8 0"/><path d="m6 14.5 1 .8m6-.8 1-.8"/></>:<path d="M7 12.5h6"/>}</>}</svg>;
}
function PersonaRoute({persona}:{persona:PersonaIllustration}){
 const gradientId='hv3-route-color-'+persona.id;
 return <span className="hv3-route-preview" aria-hidden="true">
  <span className="hv3-route-drawing"><svg viewBox="0 0 240 76" preserveAspectRatio="none"><defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">{persona.levels.map((level,index)=><stop key={index} offset={(index*50)+'%'} stopColor={reactionScale[level].color}/>)}</linearGradient></defs><path d={persona.path} stroke={'url(#'+gradientId+')'}/>{persona.id==='casey'&&<path className="hv3-route-stop" d="M229 57v14"/>}</svg>{persona.points.map(([x,y],index)=><span key={index} className="hv3-route-face" data-reaction={persona.levels[index]} style={{left:(x/240*100)+'%',top:(y/76*100)+'%'}}><EmotionFace level={persona.levels[index]}/></span>)}</span>
  <span className="hv3-route-emotions">{persona.emotions.map((emotion,index)=><span key={emotion} data-reaction={persona.levels[index]}>{emotion}</span>)}</span>
 </span>;
}

export function WorkspaceHomeV3({data,navigate,onNewProject}:Props){
 const hasGather=list(data.projects).some(project=>project.id==='gather');

 return <div className="home-v3">
  <div className="hv3-utility-bar"><Button icon="plus" onClick={onNewProject}>New app</Button></div>

  <section className="hv3-hero" aria-labelledby="hv3-title">
   <div className="hv3-intro">
    <h1 id="hv3-title" className="hv3-brand" aria-label="Journey Lab"><span className="hv3-brand-symbol" aria-hidden="true"><span/><span/><span/></span><span className="hv3-brand-name">journey<span className="hv3-brand-lab">lab</span></span></h1>
    <div className="hv3-intro-copy">
     <p className="hv3-intro-lead"><strong>Understand your product through the eyes of AI Personas.</strong></p>
     <p>Each AI Persona has different goals, expectations, and constraints that shape their experiences.</p>
     <p>Follow their journeys, discover what delights or frustrates them, and turn their feedback into better experiences.</p>
    </div>
   </div>

   <div className="hv3-universe" data-focus="all">
    <div className="hv3-journey-map hv3-network" aria-label="Six example AI personas connected to the same app">
     <svg className="hv3-branches hv3-network-branches" viewBox="0 0 1000 540" preserveAspectRatio="none" aria-hidden="true">
      {perspectives.map((persona,index)=>{
       const y=[86,270,454][index%3],left=persona.side==='left';
       return <path key={persona.id} className={'hv3-network-branch hv3-tone-'+persona.tone} data-active="true" d={left?`M500 270 H430 C400 270 400 ${y} 365 ${y} H160`:`M500 270 H570 C600 270 600 ${y} 635 ${y} H840`}/>;
      })}
     </svg>
     <div className="hv3-product">
      <span className="hv3-node-label">ONE SHARED STARTING POINT</span>
      <div className="hv3-app-window" role="img" aria-label="Illustrated Gather booking app: Atlas room, 12 seats, projector, 220 dollars room rate before fees">
       <div className="hv3-window-bar"><span/><span/><span/><small>Gather</small><Icon name="external" size={10}/></div>
       <div className="hv3-mini-app"><div className="hv3-mini-brand"><Icon name="environments" size={15}/><b>Gather</b><span>Meeting spaces</span></div><img src={meetingRoom} alt=""/><div className="hv3-room-heading"><strong>Room to come together.</strong><span>A space for your next big idea.</span></div><div className="hv3-room-details"><div><b>Atlas</b><span>12 seats · Projector</span></div><div><b>$220</b><span>room rate / hour</span></div></div><div className="hv3-mock-action">Find your space<Icon name="arrow" size={12}/></div></div>
      </div>
      <span className="hv3-product-caption">One app. A shared starting point.</span>
     </div>
     {(['left','right'] as const).map(side=><div className="hv3-network-column" data-side={side} key={side}>
      {perspectives.filter(persona=>persona.side===side).map(persona=><a key={persona.id} className={'hv3-persona hv3-network-node hv3-tone-'+persona.tone} href={hasGather?'/projects/gather/personas/'+personaIds[persona.id]:undefined} aria-label={hasGather?'Open '+persona.name+'’s persona: '+persona.role:undefined} onClick={event=>{if(!hasGather||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate('/projects/gather/personas/'+personaIds[persona.id]);}}>
       <span className="hv3-persona-top"><span className="hv3-avatar" aria-hidden="true">{persona.name[0]}<span><Icon name={persona.icon} size={12}/></span></span><span className="hv3-identity"><strong>{persona.name}</strong><span>{persona.role}</span></span><Icon name="arrow" size={14}/></span>
       <strong className="hv3-priority" data-blocked={persona.id==='casey'}>{persona.priority}</strong><PersonaRoute persona={persona}/>
      </a>)}
     </div>)}

    </div>

   </div>

  </section>

  <HomeProcessSteps hasGather={hasGather} navigate={navigate}/>

 </div>;
}
