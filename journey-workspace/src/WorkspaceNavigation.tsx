import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent,ReactNode} from 'react';
import {Icon} from './icons';
import {navigationGroups,groupForSection,navigationHref,pageLabelForSection} from './workspace-navigation';
import {initials,list} from './lib';
import type {Row} from './lib';

type Props={section:string;detailId?:string;base:string;projectId:string;project?:Row;data:Row;error:string;navigate:(path:string)=>void;onNewProject:()=>void;onRefresh:()=>void};
function Link({path,children,className,current,navigate}:{path:string;children:ReactNode;className:string;current?:'page'|'location';navigate:(path:string)=>void}){return <a href={path} className={className} aria-current={current} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(path);}}>{children}</a>;}
function navKeys(event:KeyboardEvent<HTMLElement>){
 if(event.altKey||event.ctrlKey||event.metaKey||!(event.target instanceof HTMLAnchorElement))return;
 const links=Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]'));
 const index=links.indexOf(event.target);if(index<0)return;
 const next=['ArrowDown','ArrowRight'].includes(event.key)?(index+1)%links.length:['ArrowUp','ArrowLeft'].includes(event.key)?(index-1+links.length)%links.length:event.key==='Home'?0:event.key==='End'?links.length-1:null;
 if(next!==null){event.preventDefault();links[next]?.focus();}
}
export function WorkspaceNavigation({section,detailId,base,projectId,project,data,error,navigate,onNewProject,onRefresh}:Props){
 const [narrow,setNarrow]=useState(()=>window.matchMedia('(max-width:760px)').matches),[open,setOpen]=useState(false);
 const panel=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null),active=groupForSection(section);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)');const update=()=>{setNarrow(media.matches);if(!media.matches)setOpen(false);};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{setOpen(false);},[section,detailId,projectId]);
 useEffect(()=>{
  if(!narrow||!open)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';(panel.current?.querySelector<HTMLElement>('.workspace-section-link[aria-current]')||panel.current?.querySelector<HTMLElement>('[aria-current],a[href]'))?.focus();
  const listener=(event:globalThis.KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
   if(event.key!=='Tab')return;
   const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select')||[]),first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',listener);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',listener);if(previous?.isConnected)previous.focus();};
 },[narrow,open]);
 const go=(path:string)=>{setOpen(false);navigate(path);};
 const demo=projectId==='little-steps'?'/demo.html':null;
 const home=!projectId,projects=list(data.projects),example=['gather','little-steps'].includes(projectId);
 const connection=error?'Offline':home?'Local workspace':data.health?.modelConfigured?'Meta connected':'Connect Meta';
 return <>
  <div className="workspace-mobile-bar"><button ref={toggle} className="workspace-menu-toggle" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} aria-controls="workspace-sidebar" onClick={()=>setOpen(value=>!value)}><Icon name="menu" size={18}/></button><span>{project?.name||'Journey Lab'}</span><small>{pageLabelForSection(section)}</small></div>
  {narrow&&open&&<button className="workspace-nav-scrim" aria-label="Close navigation backdrop" onClick={()=>setOpen(false)} tabIndex={-1}/>}
  <aside ref={panel} id="workspace-sidebar" className={`workspace-sidebar ${open?'is-open':''}`} role={narrow?'dialog':undefined} aria-modal={narrow&&open?true:undefined} aria-label="Workspace navigation" aria-hidden={narrow&&!open?true:undefined} inert={narrow&&!open}>
   <div className="workspace-sidebar-top"><Link navigate={go} path="/" className="brand"><span className="brand-symbol"><span/><span/><span/></span><span>journey<span className="brand-lab">lab</span></span></Link><button className="workspace-nav-close icon-button" aria-label="Close navigation" onClick={()=>setOpen(false)}><Icon name="close" size={17}/></button></div>
   <Link navigate={go} path="/" className={`workspace-primary-link workspace-home-link ${home?'active':''}`} current={home?'page':undefined}><Icon name="coverage" size={18}/><span>Home</span></Link>
   {!home&&<><div className="workspace-nav-label">{example?'EXAMPLE APP':'APP WORKSPACE'}</div><div className="project-select"><span className="project-avatar">{initials(project?.name||'JL')}</span><select aria-label="Current app" value={projectId} onChange={event=>{setOpen(false);event.target.value==='__new__'?onNewProject():navigate(`/projects/${encodeURIComponent(event.target.value)}/runs`);}}>{!projects.some(p=>p.id===projectId)&&<option value={projectId}>{project?.name||'Loading app…'}</option>}{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}<option value="__new__">+ New app</option></select><Icon name="down" size={12}/></div></>}
   <nav className="workspace-primary-nav" aria-label={home?'My apps':'App sections'} onKeyDown={navKeys}>
    {home?<><div className="workspace-nav-label">MY APPS</div>{projects.map(p=><Link navigate={go} path={`/projects/${encodeURIComponent(p.id)}/runs`} className="workspace-primary-link workspace-project-link" key={p.id}><span className="workspace-project-initials">{initials(p.name||'App')}</span><span>{p.name}</span></Link>)}<button className="workspace-primary-link workspace-new-project" onClick={()=>{setOpen(false);onNewProject();}}><Icon name="plus" size={17}/><span>New app</span></button></>:navigationGroups(projectId).map(group=><div className={`workspace-nav-group ${active.key===group.key?'is-active':''}`} data-group={group.key} key={group.key}>
     <Link navigate={go} path={navigationHref(base,group.items[0].key)} className={`workspace-primary-link ${active.key===group.key?'active':''}`} current={active.key===group.key?(group.items.length===1?'page':'location'):undefined}><Icon name={group.icon} size={18}/><span>{group.label}</span>{group.items.length>1&&<Icon name={active.key===group.key?'down':'chevron'} size={12}/>}</Link>
     {active.key===group.key&&group.items.length>1&&<div className="workspace-section-nav" role="group" aria-label={`${group.label} menu`}>{group.items.map(item=><Link navigate={go} key={item.key} path={navigationHref(base,item.key)} className={`workspace-section-link ${section===item.key?'active':''}`} current={section===item.key?(detailId?'location':'page'):undefined}><Icon name={item.icon} size={14}/><span>{item.label}</span>{['runs','findings','fixes'].includes(item.key)&&list(data[item.key]).length>0&&<small>{list(data[item.key]).length}</small>}</Link>)}</div>}
    </div>)}
   </nav>
   <div className="workspace-utilities">
    {demo&&<a className="workspace-demo" href={demo} target="_blank" rel="noreferrer" aria-label="Watch the demo"><Icon name="play" size={15}/><span>Watch demo</span><Icon name="external" size={12}/></a>}
    <div className="workspace-utility-status"><span className="workspace-connection" title={error?'Workspace connection needs attention':home?'Your local Journey Lab workspace':data.health?.modelConfigured?'Local workspace · Meta connected':'Configure Meta in Connections'}><i className={error||(!home&&!data.health?.modelConfigured)?'offline':''}/>{connection}</span><button className="icon-button" aria-label="Refresh workspace" title="Refresh workspace" onClick={onRefresh}><Icon name="refresh" size={15}/></button></div>
   </div>
  </aside>
 </>;
}
