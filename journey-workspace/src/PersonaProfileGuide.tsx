import {DeviceBadge} from './DeviceBadge';
import {primaryDevice,personaDeviceIds} from './device-context';
import {groups} from './library-authoring';
import {initials,list} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';

export function PersonaSectionNav(){
 const sections=[{id:'identity',title:'Identity'},...groups.personas.map(({id,title})=>({id:id!,title})),{id:'visit',title:'Visit setup'}];
 return <nav className="persona-section-nav" aria-label="Profile sections">{sections.map((section,index)=><a key={section.id} href={`#persona-${section.id}`} onClick={event=>{event.preventDefault();const target=document.getElementById(`persona-${section.id}`);target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});}}><span>{String(index+1).padStart(2,'0')}</span>{section.title}</a>)}</nav>;
}

export function PersonaProfilePreview({form,data}:{form:Row;data:Row}){
 const device=primaryDevice(form,list(data.devices)),ids=personaDeviceIds(form),network=list(data.networkProfiles).find(profile=>profile.id===form.networkProfileId);
 const summary=[{key:'mission',label:'Wants to',empty:'Add a personal goal to give this visit a purpose.'},{key:'context',label:'Arrives with',empty:'Describe the situation behind their visit.'},{key:'priorities',label:'Cares most about',empty:'Add what matters when choices compete.'}];
 return <section className="persona-profile-preview" aria-label="Live persona preview">
  <header><span className="persona-preview-kicker"><Icon name="eye" size={14}/> Live preview</span><span>AI persona</span></header>
  <div className="persona-preview-identity"><span className="library-monogram personas" aria-hidden="true">{initials(form.name.trim()||'New persona')}</span><div><h2>{form.name.trim()||'Your next perspective'}</h2><p>{form.role.trim()||'Add a role or perspective'}</p></div></div>
  <span className="persona-preview-visit"><Icon name={form.continuity==='returning'?'history':'spark'} size={13}/>{form.continuity==='returning'?'Returning visitor':'First-time visitor'}</span>
  <dl>{summary.map(item=><div key={item.key}><dt>{item.label}</dt><dd className={form[item.key]?.trim()?'':'is-placeholder'}>{form[item.key]?.trim()||item.empty}</dd></div>)}</dl>
  <div className="persona-preview-devices"><span>Primary device</span>{device?<><DeviceBadge device={device} network={network}/>{ids.length>1&&<small>+{ids.length-1} other {ids.length===2?'device':'devices'}</small>}</>:<p>Choose a device in Visit setup.</p>}</div>
  <p className="persona-preview-note">An AI Persona shaped by the context you provide. Specific goals and circumstances make it more useful.</p>
 </section>;
}
