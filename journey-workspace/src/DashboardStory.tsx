import {useState} from 'react';
import {AppLink,Button,Modal} from './App';
import {Icon} from './icons';
import type {Row} from './lib';
import {GatherCaseStudy} from './GatherCaseStudy';
import './dashboard-story.css';
import './project-overview.css';

type Props={data:Row;project?:Row;base:string;navigate:(path:string)=>void;onNewJourney:()=>void;onWorkspace:()=>void};
const FILM='/ui/gather-demo-assets/film.mp4',POSTER='/ui/gather-demo-assets/poster.jpg',CAPTIONS='/ui/gather-demo-assets/captions.vtt';

export function DashboardStory({data,base,navigate,onWorkspace}:Props){
 const [film,setFilm]=useState(false),[filmError,setFilmError]=useState(false);
 return <div className="project-guided-example">
  <header className="guide-page-heading"><div><span className="eyebrow">GATHER / EXAMPLE APP</span><h1>Guided example<span className="heading-dot">.</span></h1></div><div><AppLink className="button" to={base+'/dashboard'} navigate={navigate}><Icon name="coverage" size={15}/>App overview</AppLink><Button icon="play" onClick={()=>{setFilmError(false);setFilm(true);}}>Watch the 90-second story</Button></div></header>
  <GatherCaseStudy data={data} base={base} navigate={navigate} onWorkspace={onWorkspace} onFilm={()=>{setFilmError(false);setFilm(true);}}/>
  {film&&<Modal title="Journey Lab in action · Gather example" wide onClose={()=>setFilm(false)}><div className="story-film">{filmError?<div className="story-unavailable"><Icon name="film" size={28}/><h3>The local demo film is unavailable.</h3><p>The guided example and source recordings remain available in this workspace.</p><Button onClick={()=>setFilm(false)}>Return to guided example</Button></div>:<video controls tabIndex={0} playsInline preload="metadata" poster={POSTER} onError={()=>setFilmError(true)} aria-label="90-second Gather demo with English narration"><source src={FILM} type="video/mp4"/><track kind="captions" src={CAPTIONS} srcLang="en" label="English" default/></video>}<p>90-second edited example · English narration & captions · recorded AI Persona journeys. Playback makes no model calls.</p></div></Modal>}
 </div>;
}
