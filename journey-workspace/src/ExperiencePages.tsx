import {useMemo} from 'react';
import {AppLink} from './App';
import {Icon} from './icons';
import {clock,label,list} from './lib';
import type {Row} from './lib';
import {experienceCountPills,insightMomentHref,screenDisplayIdentity} from './insights-data';

import {buildExperienceCatalog,buildExperiencePerspectives,experienceObservations,experienceFindingMoments} from './experience-perspectives';
import {experienceScreenState,experienceStateGroups} from './experience-screen-states';
import {ExperienceDetailPanel} from './ExperienceDetailPanel';
import './experience-perspectives.css';

const tones:Record<string,string>={very_positive:'excellent',positive:'positive',neutral:'neutral',negative:'negative',very_negative:'very-negative'};
const plural=(n:number,unit:string)=>`${n} ${unit}${n===1?'':'s'}`;

export function ExperiencePills({screen}:{screen:Row}){
 const pills=experienceCountPills(screen);
 return <div className="experience-count-pills" aria-label="Recorded signals and findings">{pills.length?pills.map(pill=><span key={pill.key} className={`experience-count-pill ${pill.tone}`} title={pill.description} aria-label={pill.description}><b>{pill.count}</b>{pill.label}</span>):<span className="insight-no-signals">No signals recorded</span>}</div>;
}
export function MomentLink({moment,base,navigate}:{moment:Row;base:string;navigate:(path:string)=>void}){
 return <span className="experience-moment-target" title={moment.reaction||moment.observation||'Open recorded moment'}><AppLink className={`insight-moment-link tone-${tones[moment.valence]||'unrated'}`} to={insightMomentHref(base.split('/')[2],moment)||`${base}/runs/${moment.runId}?tab=journey`} navigate={navigate}><Icon name="play" size={12}/><span>{moment.originalMs!=null?clock(moment.originalMs):'View journey'} · {label(tones[moment.valence]||'unrated')}</span></AppLink></span>;
}

type ExperienceProps={embedded?:boolean;fixedStateId?:string;pages:Row[];projectId:string;projectName:string;environments:Row[];sourceRuns:Row[];impacts:Row[];impactsLoading:boolean;base:string;route:any;navigate:(path:string)=>void};
type Side='before'|'after';
const panelKeys=['xpPersona','xpSide','xpMoment'];
const runKeys=['xpBeforeRuns','xpAfterRuns'];
function runChoices(value:string|null):Record<string,string>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.fromEntries(Object.entries(parsed).filter(([,id])=>typeof id==='string')) as Record<string,string>:{};}catch{return {};}}
function observationTone(observation:Row){return ({critical:'very-negative',high:'negative',medium:'negative',low:'negative'} as Record<string,string>)[observation.impact]||tones[observation.moment?.valence]||'neutral';}
function stateSlice(side:Row|null,stateId:string,projectId:string):Row|null{
 if(!side||!stateId)return side;
 const moments=list(side.moments).filter(moment=>experienceScreenState(projectId,moment).id===stateId);
 const evaluations=list(side.evaluations).filter(item=>experienceFindingMoments(item,moments).length>0);
 return {...side,moments,observations:experienceObservations({moments,evaluations}),stateFiltered:true};
}

export function ExperiencePages(props:ExperienceProps){
 const expanded=new URLSearchParams(props.route.search).get('expand');
 return <div className="xp-pages">{props.pages.map(page=><ExperiencePage key={page.id} {...props} page={page} isOpen={!!props.embedded||expanded===page.id}/>)}</div>;
}
function ExperiencePage({page,isOpen,projectId,projectName,environments,sourceRuns,impacts,impactsLoading,base,route,navigate,fixedStateId,embedded}:ExperienceProps&{page:Row;isOpen:boolean}){
 const params=new URLSearchParams(route.search),identity=screenDisplayIdentity(page,projectName);
 const catalog=useMemo(()=>buildExperienceCatalog(page,sourceRuns,environments,impacts),[page,sourceRuns,environments,impacts]);
 const beforeId=params.get('xpBefore')??catalog.defaultBeforeId,afterId=params.get('xpAfter')??catalog.defaultAfterId;
 const selectedPersona=params.get('xpPersona'),activeSide:Side=params.get('xpSide')==='before'?'before':'after';
 const selection={beforeId,afterId,beforeRuns:runChoices(params.get('xpBeforeRuns')),afterRuns:runChoices(params.get('xpAfterRuns'))};
 const perspectives=buildExperiencePerspectives(page,catalog,selection),selected=perspectives.find(row=>row.id===selectedPersona);
 const beforeVariant=catalog.variants.find(variant=>variant.id===beforeId),afterVariant=catalog.variants.find(variant=>variant.id===afterId),comparison=catalog.comparisons.find(item=>item.beforeId===beforeId&&item.afterId===afterId);
 const comparisonMode=!!afterId,labels={before:beforeVariant?.label||'Before',after:afterVariant?.label||'After'};
 const allMoments=perspectives.flatMap(row=>[...list(row.before?.moments),...list(row.after?.moments)]),screenStates=experienceStateGroups(projectId,allMoments),stateId=fixedStateId||params.get('xpState')||'';
 const selectedState=screenStates.find(state=>state.id===stateId),pagePeople=new Set(list(page.contexts).map(item=>item.context?.personaId));
 const totalFindings=new Set(list(page.evaluations).filter(item=>item.kind==='finding').map(item=>item.id)).size;
 const firstObservation=list(page.lowMoments)[0]?.observation||list(page.moments).at(-1)?.observation;
 const navigateQuery=(q:URLSearchParams)=>navigate(`${base}/experience${q.size?`?${q}`:''}`);
 const setQuery=(changes:Record<string,string|null>,clearPanel=false)=>{const q=new URLSearchParams(route.search);if(clearPanel)panelKeys.forEach(key=>q.delete(key));for(const [key,value] of Object.entries(changes)){if(value===null)q.delete(key);else q.set(key,value);}navigateQuery(q);};
 const toggle=()=>{const q=new URLSearchParams(route.search);['xpBefore','xpAfter','xpState','moments',...panelKeys,...runKeys].forEach(key=>q.delete(key));if(isOpen)q.delete('expand');else q.set('expand',page.id);navigateQuery(q);};
 const chooseVersion=(side:Side,value:string)=>setQuery({[side==='before'?'xpBefore':'xpAfter']:value,xpState:null,[side==='before'?'xpBeforeRuns':'xpAfterRuns']:null},true);
 const open=(row:Row,side:Side,observation?:Row)=>{const moment=observation?.moment;setQuery({xpPersona:row.id,xpSide:side,xpMoment:moment?.id||null});};
 const shortOption=(variant:Row)=>`${variant.label}${variant.kind==='retained'?` · ${variant.stage==='repair'?'retest':'original'}`:` · ${variant.description}`}`;
 return <article className={`xp-page ${isOpen?'is-open':''} ${embedded?'is-embedded':''}`}>
  {!embedded&&<button type="button" className="xp-page-heading" onClick={toggle} aria-expanded={isOpen} aria-controls={`xp-page-${encodeURIComponent(page.id)}`} aria-label={`${isOpen?'Collapse':'Compare'} ${identity.name}`}>
   <Icon name="chevron" size={15}/><span className="xp-page-identity"><strong>{identity.name}</strong><small>{page.urls?.length===1?identity.url:page.routePattern||identity.url}</small></span>
   {!isOpen&&<span className="xp-page-observation">{firstObservation||'No observations recorded yet.'}</span>}
   <span className="xp-page-totals"><span><b>{pagePeople.size}</b> personas</span><span><b>{page.counts.eligibleRuns}</b> journeys</span>{totalFindings>0&&<span><b>{totalFindings}</b> findings</span>}</span>
  </button>}
  {isOpen&&<section className="xp-page-body" id={`xp-page-${encodeURIComponent(page.id)}`} aria-label={`Experience comparison for ${identity.name}`}>
   {impactsLoading?<p className="xp-empty" role="status">Loading recorded comparisons…</p>:<>
   <div className="xp-comparison-controls"><div className="xp-version-pair">
    <label className="xp-version-select before"><span>{comparisonMode?'Before':'Version'}</span><select aria-label="Before version" value={beforeId} onChange={event=>chooseVersion('before',event.target.value)}>{!catalog.variants.length&&<option value="">No recorded version</option>}{beforeId&&!beforeVariant&&<option value={beforeId}>Version outside this scope</option>}{catalog.variants.map(variant=><option key={variant.id} value={variant.id}>{shortOption(variant)}</option>)}</select></label>
    <Icon name="arrow" size={16}/><label className="xp-version-select after"><span>{comparisonMode?'After':'Compare with'}</span><select aria-label="After version" value={afterId} onChange={event=>chooseVersion('after',event.target.value)}><option value="">No comparison</option>{afterId&&!afterVariant&&<option value={afterId}>Version outside this scope</option>}{catalog.variants.map(variant=><option key={variant.id} value={variant.id}>{shortOption(variant)}</option>)}</select></label>
   </div><div className="xp-comparison-meta">{comparison?<><span className="xp-pair-label"><Icon name="branch" size={12}/>{comparison.stage==='repair'?'Repair retest':'Original comparison'}</span><AppLink to={`${base}/impact/${comparison.impactId}?stage=${comparison.stage}`} navigate={navigate}>Change impact<Icon name="arrow" size={11}/></AppLink></>:<span className="xp-pair-label">{comparisonMode?'Custom comparison':'Recorded experience'}</span>}</div></div>
   {!fixedStateId&&screenStates.length>0&&<div className="xp-state-bar" role="group" aria-label="Screen states"><span><Icon name="coverage" size={13}/>Screen</span><button type="button" aria-pressed={!stateId} onClick={()=>setQuery({xpState:null},true)}>All screens</button>{screenStates.map(state=><button type="button" key={state.id} aria-pressed={stateId===state.id} title={state.inferredCount?'Identified from recorded observations; details keep the source.':undefined} onClick={()=>setQuery({xpState:state.id},true)}>{state.label}</button>)}{stateId&&!selectedState&&<button type="button" aria-pressed="true" onClick={()=>setQuery({xpState:null},true)}>State outside this scope<Icon name="close" size={11}/></button>}</div>}
   {perspectives.length?<div className="xp-perspective-table-wrap"><table className={`xp-perspective-table ${comparisonMode?'is-comparison':'is-single'}`}><thead><tr><th>Persona</th><th><i className="xp-side-dot before"/>{labels.before}</th>{comparisonMode&&<th><i className="xp-side-dot after"/>{labels.after}</th>}<th><span className="sr-only">Details</span></th></tr></thead><tbody>{perspectives.map(row=>{
    const before=stateSlice(row.before,stateId,projectId),after=stateSlice(row.after,stateId,projectId),role=row.name.includes(' · ')?row.name.split(' · ').slice(1).join(' · '):row.after?.run?.personaSnapshot?.role||row.before?.run?.personaSnapshot?.role;
    return <tr key={row.id} className="xp-persona-row"><th scope="row"><button type="button" className="xp-persona-button" onClick={()=>open(row,row.after?'after':'before')} aria-label={`View ${row.name.split(' · ')[0]}'s experience`}><span className="xp-avatar">{row.name.slice(0,1)}</span><span><strong>{row.name.split(' · ')[0]}</strong>{role&&<small>{role}</small>}<small>{plural(row.journeyCount,'journey')}</small></span></button>{comparisonMode&&row.comparison.status!=='matched'&&<span className="xp-context-note" title={row.comparison.issues?.join(' ')}><Icon name="info" size={11}/>{row.comparison.label}</span>}</th>
    <ObservationCell side={before} name={row.name} sideName="before" sideLabel={labels.before} onOpen={observation=>open(row,'before',observation)}/>{comparisonMode&&<ObservationCell side={after} name={row.name} sideName="after" sideLabel={labels.after} onOpen={observation=>open(row,'after',observation)}/>}
    <td className="xp-details-cell"><button type="button" className="xp-details-button" aria-label={`Open details for ${row.name}`} onClick={()=>open(row,row.after?'after':'before')}><Icon name="arrow" size={16}/></button></td></tr>;
   })}</tbody></table></div>:<p className="xp-empty">No journeys for these versions in this scope. Choose another version or adjust Scope.</p>}
   </>}
  </section>}
  {isOpen&&selected&&<ExperienceDetailPanel key={`${page.id}:${selected.id}`} environments={environments} row={selected} side={activeSide} labels={labels} projectId={projectId} base={base} navigate={navigate} initialMomentId={params.get('xpMoment')||undefined} initialStateId={stateId||undefined} onClose={()=>{const q=new URLSearchParams(route.search);panelKeys.forEach(key=>q.delete(key));navigateQuery(q);}} onSideChange={side=>setQuery({xpSide:side,xpMoment:null})} onRunChange={(side,runId)=>{const key=side==='before'?'xpBeforeRuns':'xpAfterRuns';setQuery({[key]:JSON.stringify({...runChoices(params.get(key)),[selected.id]:runId}),xpMoment:null});}}/>}
 </article>;
}
function ObservationCell({side,name,sideName,sideLabel,onOpen}:{side:Row|null;name:string;sideName:Side;sideLabel:string;onOpen:(observation?:Row)=>void}){
 if(!side)return <td className="xp-observation-cell" data-side={sideName} data-side-label={`${label(sideName)} · ${sideLabel}`}><span className="xp-no-data">No journey in this version</span></td>;
 const observations=list(side.observations),visible=observations.slice(0,2),hasNegative=list(side.moments).some(moment=>['negative','very_negative'].includes(moment.valence));
 return <td className={`xp-observation-cell ${hasNegative?'has-friction':''}`} data-side={sideName} data-side-label={`${label(sideName)} · ${sideLabel}`}><div className="xp-observation-stack">{visible.length?visible.map(observation=><button type="button" className={`xp-observation ${observationTone(observation)}`} key={observation.id} onClick={()=>onOpen(observation)} aria-label={`${name.split(' · ')[0]}, ${sideName}: ${observation.title}`}><i/><span>{observation.title}</span><Icon name="chevron" size={12}/></button>):<span className="xp-no-data">{side.stateFiltered&&!list(side.moments).length?'This screen was not observed in this journey.':'No observation text recorded. Open details to inspect the reactions.'}</span>}</div><div className="xp-observation-meta">{!side.stateFiltered&&side.outcome&&<span className={`xp-outcome ${side.outcome==='goal_reached'?'reached':''}`}><Icon name={side.outcome==='goal_reached'?'check':'info'} size={11}/>{side.outcomeLabel}</span>}{observations.length>2&&<button type="button" onClick={()=>onOpen()}>+{observations.length-2} observations</button>}{side.selectionRequired&&<button type="button" title="Change the selected journey in details" onClick={()=>onOpen()}>{side.selectionExplicit?'Selected':'Latest'} of {side.journeys.length} journeys</button>}</div></td>;
}
