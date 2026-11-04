import {useId,useMemo,useState} from 'react';
import {initials} from './lib';
import type {Row} from './lib';
import {buildImpactPerspectives,filterImpactPerspectives,impactPerspectiveSummary,impactPerspectiveTakeaway,perspectiveFilters} from './impact-perspectives';
import type {ImpactPerspective,PerspectiveFilter} from './impact-perspectives';
import './impact-perspectives.css';

function CountPair({before,after}:{before:number|null;after:number|null}){
 return <span className="ip-count-pair"><span>{before??'—'}</span><span aria-hidden="true">→</span><span>{after??'—'}</span></span>;
}
function MatchedTone({item}:{item:ImpactPerspective}){
 const emotion=item.emotion;
 if(!emotion.compared)return <span className="ip-unavailable" title="No comparable rated action matches">No rated matches</span>;
 return <span className="ip-tone-counts" aria-label={`${emotion.higher} matched moments more positive, ${emotion.lower} less positive, ${emotion.same} unchanged`}>
  {emotion.higher>0&&<span className="ip-tone-higher" title="More positive at matched moments">{emotion.higher} more positive</span>}
  {emotion.lower>0&&<span className="ip-tone-lower" title="Less positive at matched moments">{emotion.lower} less positive</span>}
  {emotion.same>0&&<span className="ip-tone-same" title="Same tone at matched moments">{emotion.same} unchanged</span>}
 </span>;
}
function Reactions({item}:{item:ImpactPerspective}){
 const a=item.beforeReactions,b=item.afterReactions;
 return <span title={`Before: ${a.rated} rated reactions${a.unrated?`, ${a.unrated} unrated`:''}. After: ${b.rated} rated reactions${b.unrated?`, ${b.unrated} unrated`:''}.`}>
  <CountPair before={a.negative} after={b.negative}/>
 </span>;
}
function Goal({item}:{item:ImpactPerspective}){
 return <span className="ip-goal"><span>{item.beforeOutcome}<span aria-hidden="true"> → </span>{item.afterOutcome}</span><span className={`ip-outcome ip-outcome-${item.tone}`}>{item.stateLabel}</span></span>;
}

export function ImpactPerspectives({pairs,selectedId,onSelect,compact=false}:{pairs:Row[];selectedId?:string;onSelect:(personaId:string)=>void;compact?:boolean}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<PerspectiveFilter>('all');
 const filterId=useId(),headingId=useId();
 const items=useMemo(()=>buildImpactPerspectives(pairs),[pairs]);
 const visible=useMemo(()=>filterImpactPerspectives(items,query,filter),[items,query,filter]);
 const summary=useMemo(()=>impactPerspectiveSummary(items),[items]);
 const selected=items.find(item=>item.id===selectedId),selectedOutside=selected&&!visible.some(item=>item.id===selectedId);
 const reset=()=>{setQuery('');setFilter('all');};
 if(!items.length)return null;
 const controls=<>
  <div className="ip-controls">
   <label className="ip-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Search personas and observations" placeholder={compact?'Find a person…':'Find a persona or observation…'} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <label className="ip-filter" htmlFor={filterId}><span className="ip-sr-only">Filter perspectives</span><select id={filterId} value={filter} onChange={event=>setFilter(event.target.value as PerspectiveFilter)}>{perspectiveFilters.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
   <span className="ip-result-count" aria-live="polite">{visible.length} of {items.length}</span>
   {(query||filter!=='all')&&<button className="ip-clear" type="button" onClick={reset}>Clear</button>}
  </div>
  {selectedOutside&&<div className="ip-pinned-selection"><span><strong>Selected: {selected.name}</strong><small>Outside these filters</small></span><button type="button" onClick={reset}>Show in list</button></div>}
 </>;
 return <section className={`ip-overview${compact?' ip-compact':''}`} aria-labelledby={headingId}>
  <header className="ip-heading"><h3 id={headingId}>Perspectives <span>{items.length}</span></h3>
   {items.length>2&&<div className="ip-summary">
    <span className={summary.attention?'ip-summary-attention':''}><b>{summary.attention}</b> need attention</span>
    <span className={summary.betterExperience?'ip-summary-improved':''}><b>{summary.betterExperience}</b> better experience</span>
    {summary.incomplete>0&&<span><b>{summary.incomplete}</b> incomplete</span>}
   </div>}
  </header>
  {compact?<>
   {(items.length>2||query||filter!=='all')&&controls}
   <div className="ip-compact-key"><span>Essential stats</span><span>Before → after</span></div>
   <div className="ip-compact-list" role="group" aria-label="Choose a persona comparison">
    {visible.map(item=>{const [displayName,...roleParts]=item.name.split(' · '),displayRole=roleParts.join(' · ')||item.role,takeaway=impactPerspectiveTakeaway(item);return <button key={item.id} type="button" className={`ip-card ip-compact-card ip-accent-${item.tone} ${item.id===selectedId?'ip-selected':''}`} aria-pressed={item.id===selectedId} onClick={()=>onSelect(item.id)}>
     <span className="ip-card-top"><span className="ip-avatar">{initials(displayName)}</span><span className="ip-identity"><strong title={item.name}>{displayName}</strong>{displayRole&&<small title={displayRole}>{displayRole}</small>}</span><span className="ip-select-indicator" aria-hidden="true">{item.id===selectedId?'✓':'↗'}</span></span>
     <span className="ip-compact-summary"><span className={`ip-outcome ip-outcome-${item.tone}`} title={`${item.beforeOutcome} → ${item.afterOutcome}`}>{takeaway.goal}</span></span>
     <span className="ip-compact-metrics">
      <span><small>Actions</small><CountPair before={item.beforeActions} after={item.afterActions}/></span>
      <span><small>Negative reactions</small><Reactions item={item}/></span>
     </span>
     {takeaway.changes.length>0&&<span className="ip-takeaway" title={takeaway.text}>{takeaway.changes.join(' · ')}</span>}
     {item.id===selectedId&&<span className="ip-compact-context">
      {item.isExample&&item.observation!==item.stateLabel&&<span className="ip-card-observation" title={item.observationDetail||undefined}>{item.observation}</span>}
      <span className="ip-detail-metric"><small>Matched tone</small><MatchedTone item={item}/></span>
     </span>}
    </button>;})}
    {!visible.length&&<div className="ip-empty"><span>No perspectives match these filters.</span><button type="button" onClick={reset}>Show all {items.length}</button></div>}
   </div>
  </>:items.length<=2?<div className="ip-cards" role="group" aria-label="Choose a persona comparison">
   {items.map(item=><button key={item.id} type="button" className={`ip-card ip-accent-${item.tone} ${item.id===selectedId?'ip-selected':''}`} aria-pressed={item.id===selectedId} onClick={()=>onSelect(item.id)}>
    <span className="ip-card-top"><span className="ip-avatar">{initials(item.name)}</span><span className="ip-identity"><strong>{item.name}</strong>{item.role&&<small>{item.role}</small>}</span><span className="ip-select-indicator" aria-hidden="true">{item.id===selectedId?'✓':'↗'}</span></span>
    <Goal item={item}/>
    <span className="ip-card-metrics"><span><small>Actions</small><CountPair before={item.beforeActions} after={item.afterActions}/></span><span><small>Negative reactions</small><Reactions item={item}/></span><span><small>Matched tone</small><MatchedTone item={item}/></span></span>
    <span className="ip-card-observation" title={item.observationDetail||undefined}>{item.observation}</span>
   </button>)}
  </div>:<>
   {controls}
   <div className="ip-table-scroll"><table className="ip-table">
    <caption className="ip-sr-only">Persona impact, before and after. Journeys needing attention appear first.</caption>
    <thead><tr><th scope="col">Persona</th><th scope="col">Goal <span>Before → after</span></th><th scope="col">Actions <span>Before → after</span></th><th scope="col">Negative reactions <span>Before → after</span></th><th scope="col">Matched tone <span>More · less · same</span></th></tr></thead>
    <tbody>{visible.map(item=><tr key={item.id} className={`ip-accent-${item.tone} ${item.id===selectedId?'ip-selected':''}`}>
     <td><button type="button" className="ip-persona-select" onClick={()=>onSelect(item.id)} aria-pressed={item.id===selectedId} aria-label={`${item.id===selectedId?'Selected: ':'Review '}${item.name}`}>
      <span className="ip-avatar">{initials(item.name)}</span><span className="ip-identity"><strong>{item.name}{item.id===selectedId&&<span className="ip-selected-label">Selected</span>}</strong>{item.role&&<small>{item.role}</small>}<span className="ip-row-observation" title={item.observationDetail||undefined}>{item.observation}</span></span>
     </button></td><td><Goal item={item}/></td><td><CountPair before={item.beforeActions} after={item.afterActions}/></td><td><Reactions item={item}/></td><td><MatchedTone item={item}/></td>
    </tr>)}</tbody>
   </table></div>
   {!visible.length&&<div className="ip-empty"><span>No perspectives match these filters.</span><button type="button" onClick={reset}>Show all {items.length}</button></div>}
  </>}
 </section>;
}

export default ImpactPerspectives;
