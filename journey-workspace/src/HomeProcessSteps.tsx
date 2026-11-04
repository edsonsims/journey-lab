import {AppLink} from './App';
import {Icon} from './icons';
import {JourneyProcessIllustration} from './JourneyProcessIllustration';
import './home-process-steps.css';

const steps=[
 {number:'01',kind:'persona',title:'Create an AI Persona with a point of view',description:'Motivation, context, expectations, and constraints shape how the persona makes choices.',roles:[{id:'voice',icon:'activity',model:'Muse Voice Transcribe 1.0',action:'Transcribes your spoken brief'},{id:'wonder',icon:'spark',model:'Muse Wonder 1.0',action:'Drafts the persona’s perspective'}],destination:'/personas',link:'Meet the personas'},
 {number:'02',kind:'mission',title:'Create a mission',description:'Give the persona a specific task, with clear boundaries and success criteria.',roles:[{id:'voice',icon:'activity',model:'Muse Voice Transcribe 1.0',action:'Transcribes your mission brief'},{id:'wonder',icon:'spark',model:'Muse Wonder 1.0',action:'Drafts the mission and success criteria'}],destination:'/charters/new',link:'Create a mission'},
 {number:'03',kind:'journey',title:'Run the mission in your live app',description:'AI Personas click, type, scroll, and navigate your live app—not a mockup—to complete the mission. Journey Lab records their actions and reactions.',roles:[{id:'wonder',icon:'spark',model:'Muse Wonder 1.0',action:'Interacts directly with your app’s UI'},{id:'glimmer',icon:'memory',model:'Muse Glimmer 30B · Q4_K_M',action:'Summarizes observations locally'}],destination:'/runs',link:'Explore journeys'},
 {number:'04',kind:'improvement',title:'Improve, rerun, compare.',description:'Muse Code improves the app. The same AI Persona reruns the same mission to compare actions, reactions, and results before and after.',roles:[{id:'image',icon:'edit',model:'Muse Image 1.0',action:'Creates a design concept'},{id:'code',icon:'code',model:'Muse Code · Spark 1.3',action:'Improves the app’s code'},{id:'wonder',icon:'spark',model:'Muse Wonder 1.0',action:'Reruns the same persona and mission'}],destination:'/impact',link:'See change impact'}
] as const;

export function HomeProcessSteps({hasGather,navigate}:{hasGather:boolean;navigate:(path:string)=>void}){
 return <section className="home-process" aria-labelledby="home-process-title">
  <div className="hv3-section-heading"><h2 id="home-process-title">How Journey Lab works</h2></div>
  <ol className="home-process-grid">{steps.map(step=><li className={'home-process-step is-'+step.kind} key={step.number}>
   <div className="home-process-intro">
    <div className="home-process-heading"><span className="home-process-number" aria-label={'Step '+Number(step.number)}>{step.number}</span><h3>{step.title}</h3></div>
    <div className="home-process-art"><JourneyProcessIllustration kind={step.kind}/></div>
    <p className="home-process-description">{step.description}</p>
   </div>
   <div className="home-process-roles">{step.roles.map(role=><div className="home-process-role" data-model={role.id} key={role.model}><span className="home-process-role-icon"><Icon name={role.icon} size={17}/></span><div><strong>{role.action}</strong><span className="home-process-model-name">{role.model}</span></div></div>)}</div>
   {hasGather&&<AppLink className="home-process-link" to={'/projects/gather'+step.destination} navigate={navigate}>{step.link}<Icon name="arrow" size={14}/></AppLink>}
  </li>)}</ol>
  <details className="home-process-model-details">
   <summary><Icon name="branch" size={18}/><span>How the Meta models work together</span><Icon name="down" size={14}/></summary>
   <div className="home-process-model-grid">
    <div><h3>Muse Voice Transcribe 1.0 <code>muse-voice-transcribe-1.0</code></h3><p>Turns microphone recordings or uploaded audio into editable text for persona briefs, missions, and questions about a journey. Use it whenever speaking is easier than typing.</p></div>
    <div><h3>Muse Wonder 1.0 <code>muse-wonder-1.0</code></h3><p>Drafts persona perspectives and missions with success criteria, chooses browser actions, and explains observed reactions with links to evidence. Recording questions use sampled screenshots. Fresh sessions explore the original and candidate during retests.</p></div>
    <div><h3>Muse Glimmer 30B · Q4_K_M <code>muse-glimmer · local model</code></h3><p>Summarizes and categorizes observations you paste into Local analysis. It runs on your machine when the local model service is configured and running, using the supplied text.</p></div>
    <div><h3>Muse Image 1.0 <code>muse-image-1.0</code></h3><p>Uses a selected screenshot to generate a visual design concept. Choose a proposal and attach it to the next Muse Code revision; implementation and retesting happen after that choice.</p></div>
    <div><h3>Muse Code · Spark 1.3 <code>muse-spark-1.3</code></h3><p>Uses the finding, source context, screenshots, and any selected design proposal to prepare a patch in an isolated copy. Journey Lab runs the configured checks and preserves the patch and Muse Wonder retests for review.</p></div>
    <p className="home-process-review">You define the goals and review the candidate. Reactions come from AI Personas; approving a change does not deploy it.</p>
   </div>
  </details>
 </section>;
}
