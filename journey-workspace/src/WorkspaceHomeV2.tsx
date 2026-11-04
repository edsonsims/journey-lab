import {useState} from 'react';
import {AppLink,Button} from './App';
import {HomeVersionSwitch} from './HomeVersionSwitch';
import {Icon} from './icons';
import {initials,list} from './lib';
import type {Row} from './lib';
import './workspace-home-v2.css';

const meetingRoom=new URL('./assets/dashboard-story/meeting-room.png',import.meta.url).href;

type Props={data:Row;navigate:(path:string)=>void;onNewProject:()=>void};
type Perspective='all'|'alex'|'maya'|'sam'|'priya'|'jordan'|'casey';

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
 const gradientId='hv2-route-color-'+persona.id;
 return <span className="hv2-route-preview" aria-hidden="true">
  <span className="hv2-route-drawing"><svg viewBox="0 0 240 76" preserveAspectRatio="none"><defs><linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">{persona.levels.map((level,index)=><stop key={index} offset={(index*50)+'%'} stopColor={reactionScale[level].color}/>)}</linearGradient></defs><path d={persona.path} stroke={'url(#'+gradientId+')'}/>{persona.id==='casey'&&<path className="hv2-route-stop" d="M229 57v14"/>}</svg>{persona.points.map(([x,y],index)=><span key={index} className="hv2-route-face" data-reaction={persona.levels[index]} style={{left:(x/240*100)+'%',top:(y/76*100)+'%'}}><EmotionFace level={persona.levels[index]}/></span>)}</span>
  <span className="hv2-route-emotions">{persona.emotions.map((emotion,index)=><span key={emotion} data-reaction={persona.levels[index]}>{emotion}</span>)}</span>
 </span>;
}

const takeaways:Record<Exclude<Perspective,'all'>,{label:string;title:string;description:string;chapter?:string}>={
 alex:{label:'ALEX · FROM THE GATHER EXAMPLE',title:'Keep the easy path easy.',description:'Alex can accept the $280 total within a $350 allowance. An improvement should preserve the straightforward booking experience.',chapter:'people'},
 maya:{label:'MAYA · FROM THE GATHER EXAMPLE',title:'Find the friction a success metric misses.',description:'A $220 room becomes $280 with fees, beyond Maya’s $250 budget. Changing rooms means entering the meeting name again.',chapter:'mismatch'},
 sam:{label:'SAM · PERSPECTIVE TO EXPLORE',title:'What does a first visit feel like?',description:'Give Sam the goal of choosing a suitable room without knowing the app. Explore whether the labels and next steps provide enough guidance.'},
 priya:{label:'PRIYA · ILLUSTRATED LANGUAGE BARRIER',title:'Clear language turns confusion into delight.',description:'Priya is booking in a second language in this illustrated scenario. Unfamiliar booking terms cause confusion, but a plain-language explanation makes the costs and conditions clear. Priya confirms with confidence and feels supported by the app.'},
 jordan:{label:'JORDAN · ILLUSTRATED SLOW CONNECTION',title:'A quick mobile task becomes a long wait.',description:'Jordan is booking on a phone with a slow connection in this illustrated scenario. Room details take too long to load, and a stalled request prompts a retry. Without clear loading feedback, Jordan cannot tell whether the app is still working—interest turns into impatience and frustration.'},
 casey:{label:'CASEY · ILLUSTRATED ACCESSIBILITY BARRIER',title:'Casey needs keyboard access. The app blocks it.',description:'Casey relies on keyboard navigation to book a room. In this illustrated scenario, the app’s room picker cannot receive keyboard focus. Casey cannot choose a room or complete the booking—an accessibility failure turns hope into frustration and exclusion.'}
};

const capabilities=[
 {number:'01',icon:'personas',title:'Give AI a point of view',description:'Goals, expectations, and constraints shape each persona.',destination:'/personas',link:'Meet the personas'},
 {number:'02',icon:'runs',title:'Follow every turn',description:'Watch recorded journeys and the moments that change the experience.',destination:'/runs',link:'Explore journeys'},
 {number:'03',icon:'experience',title:'Understand the experience',description:'Connect persona reactions and friction to the evidence.',destination:'/experience',link:'Explore insights'},
 {number:'04',icon:'branch',title:'Improve. Then compare.',description:'Review a Muse Code candidate and retest each perspective.',destination:'/impact',link:'See change impact'}
];

export function WorkspaceHomeV2({data,navigate,onNewProject}:Props){
 const [perspective,setPerspective]=useState<Perspective>('all');
 const projects=[...list(data.projects)].sort((a,b)=>(a.id==='gather'?0:a.id==='little-steps'?1:2)-(b.id==='gather'?0:b.id==='little-steps'?1:2));
 const hasGather=projects.some(project=>project.id==='gather');
 const takeaway=perspective==='all'?null:takeaways[perspective],selectedPersona=perspectives.find(persona=>persona.id===perspective);

 return <div className="home-v2">
  <div className="hv2-utility-bar home-version-actions"><HomeVersionSwitch version="v2" navigate={navigate}/><Button icon="plus" onClick={onNewProject}>New app</Button></div>

  <section className="hv2-hero" aria-labelledby="hv2-title">
   <div className="hv2-intro">
    <h1 id="hv2-title">One App. <span>Many Journeys.</span></h1>
    <div className="hv2-intro-copy">
     <p className="hv2-intro-lead"><strong>Understand your product through the eyes of AI personas.</strong></p>
     <p>Each AI Persona has different goals, expectations, and constraints that shape their experiences.</p>
     <p>Follow their journeys, discover what delights or frustrates them, and turn their feedback into better experiences.</p>
    </div>
   </div>

   <div className="hv2-universe" data-focus={perspective}>
    <div className="hv2-map-toolbar">
     <div className="hv2-emotion-legend" aria-label="Illustrated emotion scale">
      <span>EMOTIONAL MOMENTS</span><ul>{(Object.keys(reactionScale) as ReactionLevel[]).map(level=><li key={level}><span className="hv2-legend-face" data-reaction={level}><EmotionFace level={level}/></span><span>{reactionScale[level].label}</span></li>)}</ul>
     </div>
     <div className="hv2-focus-options" role="group" aria-label="Highlight a perspective">
      <span>Choose any persona</span><button type="button" aria-pressed={perspective==='all'} aria-controls="hv2-perspective-detail" onClick={()=>setPerspective('all')}>All perspectives</button>
     </div>
    </div>


    <div className="hv2-journey-map hv2-network" aria-label="Six example AI personas connected to the same app">
     <svg className="hv2-branches hv2-network-branches" viewBox="0 0 1000 540" preserveAspectRatio="none" aria-hidden="true">
      {perspectives.map((persona,index)=>{
       const y=[86,270,454][index%3],left=persona.side==='left';
       return <path key={persona.id} className={'hv2-network-branch hv2-tone-'+persona.tone} data-active={perspective==='all'||perspective===persona.id} d={left?`M500 270 H430 C400 270 400 ${y} 365 ${y} H160`:`M500 270 H570 C600 270 600 ${y} 635 ${y} H840`}/>;
      })}
     </svg>
     <div className="hv2-product">
      <span className="hv2-node-label">ONE SHARED STARTING POINT</span>
      <div className="hv2-app-window" role="img" aria-label="Illustrated Gather booking app: Atlas room, 12 seats, projector, 220 dollars room rate before fees">
       <div className="hv2-window-bar"><span/><span/><span/><small>Gather</small><Icon name="external" size={10}/></div>
       <div className="hv2-mini-app"><div className="hv2-mini-brand"><Icon name="environments" size={15}/><b>Gather</b><span>Meeting spaces</span></div><img src={meetingRoom} alt=""/><div className="hv2-room-heading"><strong>Room to come together.</strong><span>A space for your next big idea.</span></div><div className="hv2-room-details"><div><b>Atlas</b><span>12 seats · Projector</span></div><div><b>$220</b><span>room rate / hour</span></div></div><div className="hv2-mock-action">Find your space<Icon name="arrow" size={12}/></div></div>
      </div>
      <span className="hv2-product-caption">One app. A shared starting point.</span>
     </div>
     {(['left','right'] as const).map(side=><div className="hv2-network-column" data-side={side} key={side}>
      {perspectives.filter(persona=>persona.side===side).map(persona=><button type="button" key={persona.id} className={'hv2-persona hv2-network-node hv2-tone-'+persona.tone} data-active={perspective==='all'||perspective===persona.id} aria-label={'Explore '+persona.name+'’s perspective: '+persona.role} aria-pressed={perspective===persona.id} aria-controls="hv2-perspective-detail" onClick={()=>setPerspective(persona.id)}>
       <span className="hv2-persona-top"><span className="hv2-avatar" aria-hidden="true">{persona.name[0]}<span><Icon name={persona.icon} size={12}/></span></span><span className="hv2-identity"><strong>{persona.name}</strong><span>{persona.role}</span></span><Icon name="arrow" size={14}/></span>
       <strong className="hv2-priority" data-blocked={persona.id==='casey'}>{persona.priority}</strong><PersonaRoute persona={persona}/>
      </button>)}
     </div>)}

    </div>

    <div className="hv2-perspective-detail" id="hv2-perspective-detail" data-perspective={perspective} hidden={!takeaway}>{takeaway&&<>
     <span className="hv2-detail-symbol" aria-hidden="true"><Icon name={selectedPersona?.icon||'personas'} size={21}/></span>
     <div aria-live="polite" aria-atomic="true"><span className="hv2-detail-label">{takeaway.label}</span><h2>{takeaway.title}</h2><p>{takeaway.description}</p>{selectedPersona&&<div className="hv2-route-detail"><span>{selectedPersona.id==='casey'?'ONE POSSIBLE JOURNEY · BLOCKED BY A KEYBOARD BARRIER':'ONE POSSIBLE JOURNEY'}</span><ol>{selectedPersona.steps.map((step,index)=><li key={step}><span className="hv2-detail-face" data-reaction={selectedPersona.levels[index]} aria-hidden="true"><EmotionFace level={selectedPersona.levels[index]}/></span><span><strong>{step}</strong><span data-reaction={selectedPersona.levels[index]}>{selectedPersona.emotions[index]}<span className="hv2-reaction-label"> · {reactionScale[selectedPersona.levels[index]].label}</span></span></span>{index<2&&<Icon name="arrow" size={12}/>}</li>)}</ol></div>}</div>
     {hasGather&&<AppLink to={takeaway.chapter?'/projects/gather/guide?chapter='+takeaway.chapter:'/projects/gather/personas'} navigate={navigate} className="hv2-text-link">{takeaway.chapter?'Follow the story':'Explore the persona library'}<Icon name="arrow" size={15}/></AppLink>}
    </>}</div>
   </div>

  </section>

  <section className="hv2-capabilities" aria-labelledby="hv2-capabilities-title">
   <div className="hv2-section-heading"><div><span className="hv2-eyebrow">FROM PERSPECTIVE TO PROGRESS</span><h2 id="hv2-capabilities-title">Every journey has something to tell you.</h2></div><p>Muse Wonder explores.<br/>Muse Code prepares improvements for review.</p></div>
   <ol className="hv2-capability-list">{capabilities.map(item=><li key={item.number}><div className="hv2-capability-top"><span><Icon name={item.icon} size={20}/></span><small>{item.number}</small></div><h3>{item.title}</h3><p>{item.description}</p>{hasGather&&<AppLink className="hv2-text-link" to={'/projects/gather'+item.destination} navigate={navigate}>{item.link}<Icon name="arrow" size={13}/></AppLink>}</li>)}</ol>
  </section>

  <section className="hv2-projects" aria-labelledby="hv2-projects-title">
   <div className="hv2-section-heading"><div><span className="hv2-eyebrow">MY WORKSPACE</span><h2 id="hv2-projects-title" tabIndex={-1}>My apps</h2></div><Button icon="plus" onClick={onNewProject}>New app</Button></div>
   {projects.length?<div className="hv2-project-list">{projects.map(project=>{
    const example=project.id==='gather'||project.id==='little-steps'||project.id==='fieldnote-acceptance-2026-11-01';
    return <AppLink key={project.id} to={'/projects/'+encodeURIComponent(String(project.id))+'/runs'} navigate={navigate} className="hv2-project-link"><span className={'hv2-project-icon '+(example?'is-example':'')}>{example?<Icon name={project.id==='gather'?'environments':project.id==='little-steps'?'spark':'folder'} size={21}/>:initials(String(project.name||'App'))}</span><span className="hv2-project-copy"><strong>{project.name||'Untitled app'}</strong><span>{project.id==='gather'?'Meeting room booking for teams.':project.id==='little-steps'?'Learning activities for children, at home and in class.':project.id==='fieldnote-acceptance-2026-11-01'?'Project notes and ideas, organized in one place.':project.description||'Personas, journeys, and possibilities.'}</span></span><span className="hv2-project-kind">{example?'Example app':'App workspace'}</span><Icon name="arrow" size={17}/></AppLink>;
   })}</div>:<div className="hv2-empty"><Icon name="folder" size={27}/><h3>Every journey starts with a product.</h3><p>Create an app and give your personas somewhere to explore.</p><Button kind="primary" onClick={onNewProject}>Create my first app</Button></div>}
  </section>
 </div>;
}
