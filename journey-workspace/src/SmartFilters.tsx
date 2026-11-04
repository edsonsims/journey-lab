import {useEffect,useId,useRef,useState} from 'react';
import type {MouseEvent} from 'react';
import {Icon} from './icons';
import {buildTableFilterModel,readTableFilterState,writeTableFilterState} from './table-filters';
import type {FacetDefinition,SortDefinition,TableFilterState} from './table-filters';
import type {Row} from './lib';

export type FilterPreset={key:string;label:string;selections:Record<string,string[]>};
type FilterConfig={facets:FacetDefinition[];sorts:SortDefinition[];defaultSort:string;searchText:(row:Row)=>string;presets:FilterPreset[]};
type FilterRoute={path:string;search:string;navigate:(path:string,replace?:boolean)=>void};

export function useTableFilters(rows:Row[],config:FilterConfig,route:FilterRoute){
 const state=readTableFilterState(route.search,config.facets,{defaultSort:config.defaultSort});
 if(!config.sorts.some(sort=>sort.key===state.sort))state.sort=config.defaultSort;
 const model=buildTableFilterModel({rows,facets:config.facets,state,searchText:config.searchText,sorts:config.sorts});
 function commit(next:TableFilterState,replace=false){
  const params=writeTableFilterState(route.search,next,config.facets,{defaultSort:config.defaultSort});
  route.navigate(`${route.path}${params.size?`?${params}`:''}`,replace);
 }
 function setFacet(key:string,values:string[]){commit({...state,selections:{...state.selections,[key]:values}});}
 function toggle(key:string,value:string){
  const current=state.selections[key]||[],single=config.facets.find(facet=>facet.key===key)?.single;
  setFacet(key,current.includes(value)?current.filter(item=>item!==value):single?[value]:[...current,value]);
 }
 return {...model,state,config,setFacet,toggle,
  setQuery:(query:string)=>commit({...state,query},true),
  setSort:(sort:string)=>commit({...state,sort}),
  clear:()=>commit({...state,query:'',selections:{}}),
  clearFacets:()=>commit({...state,selections:{}}),
  applyPreset:(preset:FilterPreset)=>commit({...state,selections:preset.selections}),
 };
}

export type TableFiltersController=ReturnType<typeof useTableFilters>;
export function SmartFilters({filters,noun,placeholder,primaryFacetLimit=2}:{filters:TableFiltersController;noun:string;placeholder?:string;primaryFacetLimit?:number}){
 const {state,facets,config}=filters;
 const id=useId(),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null),optionSearch=useRef<HTMLInputElement>(null);
 const [open,setOpen]=useState(false),[facetKey,setFacetKey]=useState(facets[0]?.key||''),[optionQuery,setOptionQuery]=useState(''),[panelMode,setPanelMode]=useState<'facet'|'all'>('all'),[anchor,setAnchor]=useState(0);
 const active=facets.find(facet=>facet.key===facetKey)||facets[0];
 const primary=facets.filter(facet=>facet.primary).slice(0,primaryFacetLimit);
 const selectedOptions=facets.flatMap(facet=>facet.options.filter(option=>option.selected).map(option=>({facet,option})));
 const moreCount=facets.filter(facet=>!primary.some(item=>item.key===facet.key)&&state.selections[facet.key]?.length).length;
 const equalPreset=(preset:FilterPreset)=>facets.every(facet=>{
  const a=[...(state.selections[facet.key]||[])].sort(),b=[...(preset.selections[facet.key]||[])].sort();
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
 });
 const selectedPreset=config.presets.find(equalPreset)?.key||(filters.activeFacetCount?'custom':'all');
 function show(event:MouseEvent<HTMLButtonElement>,key?:string){
  trigger.current=event.currentTarget;
  const mode=key?'facet':'all';
  if(open&&mode===panelMode&&(!key||key===facetKey)){setOpen(false);return;}
  if(key)setFacetKey(key);
  const bounds=root.current?.getBoundingClientRect(),button=event.currentTarget.getBoundingClientRect();
  if(bounds)setAnchor(Math.max(0,Math.min(button.left-bounds.left,bounds.width-284)));
  setPanelMode(mode);setOptionQuery('');setOpen(true);
 }
 function close(restore=false){setOpen(false);if(restore)trigger.current?.focus();}
 useEffect(()=>{
  if(!open)return;
  const compact=window.matchMedia('(max-width:620px)').matches;
  if(compact){panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'nearest',behavior:'instant'});}
  else (optionSearch.current||panel.current?.querySelector<HTMLInputElement>('fieldset input:not(:disabled)'))?.focus({preventScroll:true});
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close(true);}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open,facetKey,panelMode]);
 const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
 const optionRows=active?.options.filter(option=>!optionQuery||normalize(option.label).includes(normalize(optionQuery)))||[];
 return <div className="smart-filters" ref={root} data-filter-layout="compact">
  <div className="smart-filter-toolbar">
   <div className="smart-search"><Icon name="search" size={15}/><input id="collection-search" type="search" aria-label={`Search ${noun}`} value={state.query} onChange={event=>filters.setQuery(event.target.value)} placeholder={placeholder||`Search ${noun}…`}/><kbd>/</kbd></div>
   {config.presets.length>0&&<label className="smart-view"><span className="sr-only">Quick view for {noun}</span><select aria-label={`Quick view for ${noun}`} value={selectedPreset} onChange={event=>{const preset=config.presets.find(item=>item.key===event.target.value);if(preset)filters.applyPreset(preset);else filters.clearFacets();}}><option value="all">All views</option>{selectedPreset==='custom'&&<option value="custom" disabled>Custom view</option>}{config.presets.map(preset=><option key={preset.key} value={preset.key}>{preset.label}</option>)}</select></label>}
   <div className="smart-filter-actions">
    {primary.map(facet=><button key={facet.key} type="button" className={`smart-filter-trigger ${state.selections[facet.key]?.length?'has-selection':''}`} aria-label={`Filter by ${facet.label.toLowerCase()}`} aria-expanded={open&&panelMode==='facet'&&active?.key===facet.key} aria-controls={id} onClick={event=>show(event,facet.key)}><span>{facet.label}</span>{!!state.selections[facet.key]?.length&&<b>{state.selections[facet.key].length}</b>}<Icon name="down" size={11}/></button>)}
    {facets.length>0&&<button type="button" className={`smart-filter-trigger smart-more ${moreCount?'has-selection':''}`} aria-label={`Filters for ${noun}`} title="More filters" aria-expanded={open&&panelMode==='all'} aria-controls={id} onClick={event=>show(event)}><Icon name="calibration" size={13}/><span className="smart-more-label">More</span><span className="smart-more-label-mobile">Filters</span>{moreCount>0&&<b>{moreCount}</b>}</button>}
    <label className="smart-sort"><Icon name="sort" size={13}/><select aria-label={`Sort ${noun}`} value={state.sort} onChange={event=>filters.setSort(event.target.value)}>{config.sorts.map(sort=><option value={sort.key} key={sort.key}>{sort.label}</option>)}</select></label>
   </div>
   {filters.activeCount>0&&<button type="button" className="smart-clear" onClick={filters.clear} aria-label={`Clear all filters for ${noun}`} title="Clear search and filters"><Icon name="close" size={13}/><span>Clear</span></button>}
   <span className="smart-result-count" role="status" aria-label={`${filters.rows.length.toLocaleString('en')} of ${filters.total.toLocaleString('en')} ${noun}`} title={`${filters.rows.length.toLocaleString('en')} of ${filters.total.toLocaleString('en')} ${noun}`}><strong>{filters.rows.length.toLocaleString('en')}</strong><span>/ {filters.total.toLocaleString('en')}</span></span>
  </div>
  {filters.activeCount>0&&<div className="smart-filter-chips" aria-label="Active filters">
   {state.query.trim()&&<button type="button" className="smart-filter-chip" aria-label={`Remove search: ${state.query}`} onClick={()=>filters.setQuery('')}><Icon name="search" size={11}/><span>{state.query}</span><Icon name="close" size={11}/></button>}
   {selectedOptions.map(({facet,option})=><button type="button" key={`${facet.key}:${option.value}`} className={`smart-filter-chip ${option.tone?`filter-tone-${option.tone}`:''}`} aria-label={`Remove ${facet.label}: ${option.label}`} onClick={()=>filters.toggle(facet.key,option.value)}><span className="smart-chip-label">{facet.label}:</span><span>{option.label}</span><Icon name="close" size={11}/></button>)}
  </div>}
  {open&&active&&<div className={`smart-filter-panel ${panelMode==='facet'?'is-single-facet':''}`} ref={panel} id={id} role="dialog" tabIndex={-1} aria-label={`Filter ${noun}`} style={panelMode==='facet'?{left:anchor}:undefined}>
   <header><strong>{panelMode==='facet'?active.label:'More filters'}</strong><button type="button" className="icon-button" aria-label="Close filters" onClick={()=>close(true)}><Icon name="close" size={14}/></button></header>
   <div className="smart-filter-panel-body">
    {panelMode==='all'&&<div className="smart-filter-categories" aria-label="Filter categories">{facets.map(facet=><button type="button" key={facet.key} aria-pressed={facet.key===active.key} onClick={()=>{setFacetKey(facet.key);setOptionQuery('');}}><span>{facet.label}</span>{!!state.selections[facet.key]?.length&&<b>{state.selections[facet.key].length}</b>}<Icon name="chevron" size={11}/></button>)}</div>}
    <section className="smart-filter-options">
     {panelMode==='all'&&<div className="smart-options-heading"><strong>{active.label}</strong></div>}
     {(active.options.length>8||optionQuery)&&<div className="smart-option-search"><Icon name="search" size={13}/><input ref={optionSearch} type="search" aria-label={`Search ${active.label.toLowerCase()} options`} placeholder="Find a value…" value={optionQuery} onChange={event=>setOptionQuery(event.target.value)}/></div>}
     <fieldset><legend className="sr-only">{active.label}</legend>
      {active.single&&!optionQuery&&<label className="smart-filter-option"><input type="radio" name={`${id}-${active.key}`} checked={!state.selections[active.key]?.length} onChange={()=>filters.setFacet(active.key,[])}/><span>Any {active.label.toLowerCase()}</span></label>}
      {optionRows.map(option=><label key={option.value} className={`smart-filter-option ${option.selected?'selected':''} ${option.tone?`filter-tone-${option.tone}`:''} ${!option.count&&!option.selected?'no-matches':''}`}><input type={active.single?'radio':'checkbox'} name={`${id}-${active.key}`} checked={option.selected} disabled={!option.count&&!option.selected} onChange={()=>active.single?filters.setFacet(active.key,[option.value]):filters.toggle(active.key,option.value)}/>{option.tone&&<i aria-hidden="true"/>}<span>{option.label}</span><small>{option.count.toLocaleString('en')}</small></label>)}
      {!optionRows.length&&<p className="smart-no-options">{optionQuery?'No matching values.':'No values recorded yet.'}</p>}
     </fieldset>
    </section>
   </div>
   <footer>{!!state.selections[active.key]?.length?<button type="button" className="smart-panel-clear" onClick={()=>filters.setFacet(active.key,[])}>Clear {active.label.toLowerCase()}</button>:<span>{filters.rows.length.toLocaleString('en')} matching</span>}<button type="button" onClick={()=>close(true)}>Done<Icon name="check" size={12}/></button></footer>
  </div>}
 </div>;
}
