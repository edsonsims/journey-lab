import {WorkspaceOverview} from './WorkspaceOverview';
import {AppLink,Button} from './App';
import {Icon} from './icons';
import type {Row} from './lib';
import './project-overview.css';

type Props={data:Row;project?:Row;base:string;navigate:(path:string)=>void;onNewJourney:()=>void};
export function ProjectDashboard({data,project,base,navigate,onNewJourney}:Props){
 const gather=data.projectId==='gather',example=gather||data.projectId==='little-steps';
 return <div className="project-dashboard">
  <header className="page-heading">
   <div><div className="eyebrow">{example?'EXAMPLE APP':'APP WORKSPACE'} / {project?.name||'MY APP'}</div><h1>App overview<span className="heading-dot">.</span></h1><p>Track outcomes, find friction, and decide what to improve next in {project?.name||'this app'}.</p></div>
   <div className="heading-actions"><Button icon="experience" onClick={()=>navigate(base+'/experience')}>View experience</Button><Button kind="primary" icon="plus" onClick={onNewJourney}>New journey <kbd>N</kbd></Button></div>
  </header>
  {gather&&<aside className="project-guide-invitation" aria-label="Gather guided example"><span className="project-guide-invitation-icon"><Icon name="branch" size={20}/></span><div><strong>See how Journey Lab explores this product.</strong><p>Follow a proposed booking change through Alex and Maya’s perspectives, feedback, and fresh retests.</p></div><AppLink className="button" to={base+'/guide'} navigate={navigate}>Follow the guided example<Icon name="arrow" size={15}/></AppLink></aside>}
  <WorkspaceOverview data={data} base={base} navigate={navigate} onNewJourney={onNewJourney}/>
 </div>;
}
