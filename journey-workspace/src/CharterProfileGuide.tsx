import {configuredEnvironments} from './environment-context';
import {list} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';
import './charter-preview.css';

const sections=[
 {id:'identity',title:'Identity',icon:'charters'},
 {id:'mission',title:'Objective',icon:'eye'},
 {id:'boundaries',title:'Boundaries',icon:'coverage'},
 {id:'outcomes',title:'Finish line',icon:'check'},
 {id:'launch',title:'Launch setup',icon:'environments'},
 {id:'knowledge',title:'Knowledge',icon:'memory'},
 {id:'limits',title:'Limits',icon:'calibration'}
];

export function CharterSectionNav(){
 return <nav className="charter-section-nav" aria-label="Mission sections">{sections.map(section=><a key={section.id} href={`#charter-${section.id}`} onClick={event=>{event.preventDefault();const target=document.getElementById(`charter-${section.id}`);target?.scrollIntoView({block:'start'});target?.focus({preventScroll:true});}}><Icon name={section.icon} size={14}/>{section.title}</a>)}</nav>;
}

export function CharterProfilePreview({form,data}:{form:Row;data:Row}){
 const environment=configuredEnvironments(data.environments).find(item=>item.id===form.defaultEnvironmentId);
 const personaIds=Array.isArray(form.personaIds)?form.personaIds:[];
 const personas=personaIds.map(id=>list(data.personas).find(person=>person.id===id)||{id,name:id});
 const summary=[
  {key:'mission',label:'Explore',icon:'eye',empty:'Add an objective before launching a journey.'},
  {key:'scope',label:'Stay within',icon:'coverage',empty:'Define where exploration begins and ends.'},
  {key:'successCriteria',label:'Success looks like',icon:'check',empty:'Describe a result you can observe.'}
 ];
 return <section className="charter-profile-preview" aria-label="Live mission preview">
  <header><span><Icon name="eye" size={14}/> Live preview</span><span>Mission</span></header>
  <div className="charter-preview-identity"><span className="charter-preview-mark"><Icon name="charters" size={22}/></span><div><h2>{form.name?.trim()||'Your next exploration'}</h2>{form.description?.trim()&&<p>{form.description.trim()}</p>}</div></div>
  <dl className="charter-preview-summary">{summary.map(item=><div key={item.key}><dt><Icon name={item.icon} size={13}/>{item.label}</dt><dd className={form[item.key]?.trim()?'':'is-placeholder'}>{form[item.key]?.trim()||item.empty}</dd></div>)}</dl>
  <div className="charter-preview-launch"><div><span><Icon name="environments" size={13}/> Default environment</span><p>{environment?`${environment.name}${environment.archived?' · archived':''}`:form.defaultEnvironmentId||'Choose at launch'}</p></div><div><span><Icon name="personas" size={13}/> Suggested personas{personas.length>0&&<b>{personas.length}</b>}</span>{personas.length?<ul>{personas.slice(0,2).map(person=><li key={person.id} title={person.name}>{person.name}</li>)}{personas.length>2&&<li className="charter-preview-more">+{personas.length-2} more</li>}</ul>:<p>Choose at launch</p>}</div></div>
 </section>;
}
