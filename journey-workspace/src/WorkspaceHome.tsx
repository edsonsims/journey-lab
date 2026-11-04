import {useRef} from 'react';
import {AppLink,Button} from './App';
import {DashboardFeaturePanel} from './DashboardFeaturePanel';
import {HomeVersionSwitch} from './HomeVersionSwitch';
import {Icon} from './icons';
import {initials,list} from './lib';
import type {Row} from './lib';
import './dashboard-story.css';
import './workspace-home.css';

type Props={data:Row;navigate:(path:string)=>void;onNewProject:()=>void};
const workflow=[
 {title:'Define a perspective',description:'Give each persona a goal, context, and expectations.',icon:'personas',tone:'violet',outcome:'Persona brief'},
 {title:'Follow the journey',description:'Watch how they explore your product, moment by moment.',icon:'runs',tone:'blue',outcome:'Recorded journey'},
 {title:'Find what matters',description:'Connect helpful moments and friction to recorded evidence.',icon:'experience',tone:'rose',outcome:'Grounded feedback'},
 {title:'Improve and retest',description:'Review a proposed fix, then compare fresh journeys.',icon:'branch',tone:'teal',outcome:'Before & after'}
];
const examples:Record<string,{description:string;context:string;icon:string}>= {
 gather:{description:'Meeting room booking for teams.',context:'One booking change. Two different perspectives.',icon:'environments'},
 'little-steps':{description:'Learning activities for children, at home and in class.',context:'A teacher with a printer. A parent with a phone.',icon:'spark'},
 'fieldnote-acceptance-2026-11-01':{description:'Project notes and ideas, organized in one place.',context:'Capture an idea. Find it when you need it.',icon:'folder'}
};
const projectOrder=(project:Row)=>project.id==='gather'?0:project.id==='little-steps'?1:2;

export function WorkspaceHome({data,navigate,onNewProject}:Props){
 const projects=[...list(data.projects)].sort((a,b)=>projectOrder(a)-projectOrder(b));
 const hasGather=projects.some(project=>project.id==='gather'),projectsSection=useRef<HTMLElement>(null);
 function showProjects(){
  projectsSection.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});
  projectsSection.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 }
 return <div className="workspace-home">
  <header className="page-heading home-page-heading"><div><div className="eyebrow">JOURNEY LAB / MY WORKSPACE</div><h1>Home<span className="heading-dot">.</span></h1><p>Your products. Different perspectives. A clearer next step.</p></div><div className="home-version-actions"><HomeVersionSwitch version="v1" navigate={navigate}/><Button icon="plus" onClick={onNewProject}>New app</Button></div></header>
  <section className={'story-intro home-platform-hero '+(!hasGather?'home-platform-hero-no-example':'')} aria-label="What Journey Lab does">
   <div className="story-intro-copy"><span className="story-kicker">PRODUCT FEEDBACK THROUGH AI PERSONAS</span><h2>One product.<br/><span>Many journeys.</span></h2><p className="story-promise">Understand your product through the eyes of AI personas.</p><p>Different goals, expectations, and constraints shape every experience. Follow their journeys, discover what delights or frustrates them, and turn their feedback into better experiences.</p><div className="story-intro-actions">{hasGather?<AppLink className="button primary" to="/projects/gather/guide" navigate={navigate}>See Journey Lab in action<Icon name="arrow" size={15}/></AppLink>:<Button kind="primary" icon="plus" onClick={onNewProject}>Start with an app</Button>}<Button icon="folder" onClick={showProjects}>Explore my apps</Button></div><div className="story-models"><span><Icon name="runs" size={14}/><strong>Muse Wonder</strong> explores through each persona</span><span><Icon name="code" size={14}/><strong>Muse Code</strong> prepares improvements for review</span></div></div>
   {hasGather?<div className="home-example-preview"><div className="home-example-label"><span><Icon name="folder" size={13}/><strong>Gather example</strong> inside Journey Lab</span><AppLink to="/projects/gather/guide" navigate={navigate}>Follow the guided example<Icon name="arrow" size={12}/></AppLink></div><DashboardFeaturePanel base="/projects/gather" projectId="gather" hasGather={true} navigate={navigate}/></div>:<div className="home-perspective-visual" aria-label="One product explored through different persona goals"><div className="home-product-node"><Icon name="environments" size={25}/><span>Your product</span></div><div className="home-perspective-paths" aria-hidden="true"><span/><span/><span/></div><div className="home-perspective-nodes"><span><Icon name="clock" size={20}/>Different goals</span><span><Icon name="personas" size={20}/>Different contexts</span><span><Icon name="experience" size={20}/>Different experiences</span></div><p>Each app brings its personas, journeys and evidence together.</p></div>}
  </section>
  <section className="home-workflow" aria-labelledby="home-workflow-title">
   <header className="home-workflow-heading"><h2 id="home-workflow-title">How Journey Lab works</h2><p>From a persona’s point of view to an improvement you can evaluate.</p></header>
   <ol className="home-workflow-list" role="list">{workflow.map((step,index)=><li className="home-workflow-step" data-tone={step.tone} key={step.title}>
    <div className="home-workflow-top"><span className="home-workflow-icon" aria-hidden="true"><Icon name={step.icon} size={23}/></span><span className="home-workflow-number" aria-hidden="true">0{index+1}</span></div>
    <h3>{step.title}</h3><p>{step.description}</p>
    <div className="home-workflow-outcome"><span aria-hidden="true"/>{step.outcome}</div>
    {index<workflow.length-1&&<span className="home-workflow-connector" aria-hidden="true"><Icon name="arrow" size={14}/></span>}
   </li>)}</ol>
  </section>
  <section className="home-projects" id="home-projects" aria-labelledby="home-projects-title" ref={projectsSection}>
   <div className="home-projects-heading"><div><span className="story-kicker">A WORKSPACE FOR EVERY PRODUCT</span><h2 id="home-projects-title" tabIndex={-1}>My apps</h2><p>Choose a product to explore its journeys, insights and next improvements.</p></div><Button icon="plus" onClick={onNewProject}>New app</Button></div>
   {projects.length?<div className="home-project-grid">{projects.map(project=>{
    const example=examples[project.id],base='/projects/'+encodeURIComponent(String(project.id));
    const description=example?.description||(typeof project.description==='string'&&project.description.trim())||'An app workspace for personas, recorded journeys and feedback.';
    return <article className={'home-project-card '+(example?'is-example':'')} key={project.id}>
     <div className="home-project-card-top"><span className={'home-project-mark '+(project.id==='gather'?'is-gather':project.id==='little-steps'?'is-little-steps':'')}>{example?<Icon name={example.icon} size={23}/>:initials(String(project.name||'App'))}</span>{example?<span className="home-project-type">Example app</span>:<span className="home-project-type home-project-type-own">App workspace</span>}</div>
     <h3><AppLink to={base+'/runs'} navigate={navigate}>{project.name||'Untitled app'}</AppLink></h3><p className="home-project-description">{description}</p>{example&&<p className="home-project-context">{example.context}</p>}
     <div className="home-project-actions"><AppLink className="button" to={base+'/runs'} navigate={navigate}>Open app<Icon name="arrow" size={14}/></AppLink>{project.id==='gather'&&<AppLink className="home-guide-link" to={base+'/guide'} navigate={navigate}><Icon name="play" size={13}/>Guided example</AppLink>}</div>
    </article>;
   })}</div>:<div className="home-project-empty"><span><Icon name="folder" size={25}/></span><h3>Start with a product you want to understand.</h3><p>Create an app, connect its environment, and give your personas somewhere to explore.</p><Button kind="primary" icon="plus" onClick={onNewProject}>Create my first app</Button></div>}
   {projects.some(project=>!!examples[project.id])&&<p className="home-projects-note"><Icon name="info" size={14}/>Example apps demonstrate Journey Lab with fictional products and synthetic personas.</p>}
  </section>
 </div>;
}
