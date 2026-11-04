import type {Row} from './lib.ts';

export const UNKNOWN_FILTER_VALUE='__unknown__';
export type FacetOption={value:string;label:string;tone?:string};
export type FacetDefinition<R=Row>={
 key:string;
 label:string;
 getValues:(row:R)=>string|readonly string[]|null|undefined;
 options?:readonly FacetOption[];
 labelValue?:(value:string)=>string;
 /** Legacy query keys are read when the canonical key is absent. */
 aliases?:readonly string[];
 single?:boolean;
 primary?:boolean;
};
export type SortDefinition<R=Row>={
 key:string;
 label:string;
 getValue:(row:R)=>string|number|null|undefined;
 direction:'asc'|'desc';
};
export type TableFilterState={query:string;selections:Record<string,string[]>;sort:string};
export type ResolvedFacetOption=FacetOption&{count:number;selected:boolean};
export type ResolvedFacet<R=Row>=Omit<FacetDefinition<R>,'options'>&{options:ResolvedFacetOption[]};
type StateOptions={defaultSort:string};

const unique=(values:readonly string[])=>[...new Set(values.map(value=>value.trim()).filter(Boolean))];
function selection<R>(state:TableFilterState,facet:FacetDefinition<R>):string[]{
 const values=unique(state.selections[facet.key]||[]);
 return facet.single?values.slice(0,1):values;
}
function valuesFor<R>(row:R,facet:FacetDefinition<R>):string[]{
 const source=facet.getValues(row);
 const values=unique(typeof source==='string'?[source]:source||[]);
 return values.length?values:[UNKNOWN_FILTER_VALUE];
}
const paramsFrom=(search:string|URLSearchParams)=>new URLSearchParams(search);

/** Repeated keys are OR choices; separate facet keys compose with AND. */
export function readTableFilterState<R>(search:string|URLSearchParams,facets:readonly FacetDefinition<R>[],{defaultSort}:StateOptions):TableFilterState{
 const params=paramsFrom(search),selections:Record<string,string[]>={};
 for(const facet of facets){
  const keys=params.has(facet.key)?[facet.key]:facet.aliases||[];
  const values=unique(keys.flatMap(key=>params.getAll(key)));
  if(values.length)selections[facet.key]=facet.single?values.slice(0,1):values;
 }
 return {query:params.get('q')||'',selections,sort:params.get('sort')||defaultSort};
}

/** Preserve unrelated route state and do not mutate the caller's URLSearchParams. */
export function writeTableFilterState<R>(search:string|URLSearchParams,state:TableFilterState,facets:readonly FacetDefinition<R>[],{defaultSort}:StateOptions):URLSearchParams{
 const params=paramsFrom(search);
 params.delete('q');params.delete('sort');
 for(const facet of facets){
  params.delete(facet.key);
  for(const alias of facet.aliases||[])params.delete(alias);
 }
 // Keep spaces while the user types a multiword query; trim only for matching.
 if(state.query)params.set('q',state.query);
 if(state.sort&&state.sort!==defaultSort)params.set('sort',state.sort);
 for(const facet of facets)for(const value of selection(state,facet))params.append(facet.key,value);
 return params;
}

const normalizeSearch=(text:string)=>text.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const usableSortValue=(value:unknown):value is string|number=>typeof value==='number'?Number.isFinite(value):typeof value==='string'&&value.trim().length>0;

export function buildTableFilterModel<R>({rows,facets,state,searchText,sorts=[]}:{
 rows:readonly R[];
 facets:readonly FacetDefinition<R>[];
 state:TableFilterState;
 searchText:(row:R)=>string;
 sorts?:readonly SortDefinition<R>[];
}){
 const terms=normalizeSearch(state.query).trim().split(/\s+/).filter(Boolean);
 const selected=new Map(facets.map(facet=>[facet.key,selection(state,facet)]));
 const indexed=rows.map((row,index)=>({row,index,values:new Map(facets.map(facet=>[facet.key,valuesFor(row,facet)]))}));
 const searched=terms.length?indexed.filter(item=>{
  const text=normalizeSearch(searchText(item.row));
  return terms.every(term=>text.includes(term));
 }):indexed;
 const matches=(item:typeof indexed[number],except?:string)=>facets.every(facet=>{
  const chosen=selected.get(facet.key)!;
  return facet.key===except||!chosen.length||chosen.some(value=>item.values.get(facet.key)!.includes(value));
 });
 const resolvedFacets:ResolvedFacet<R>[]=facets.map(facet=>{
  const known=new Map<string,FacetOption>();
  for(const option of facet.options||[])if(!known.has(option.value))known.set(option.value,option);
  const observed=new Set(indexed.flatMap(item=>item.values.get(facet.key)!));
  const chosen=selected.get(facet.key)!;
  // Both stale selected values and legitimate zero-count options stay inspectable.
  const additions=[...new Set([...observed,...chosen])].filter(value=>!known.has(value))
   .map(value=>({value,label:facet.labelValue?.(value)||(value===UNKNOWN_FILTER_VALUE?'Not recorded':value)}))
   .sort((a,b)=>a.label.localeCompare(b.label,'en',{numeric:true,sensitivity:'base'})||a.value.localeCompare(b.value,'en',{numeric:true,sensitivity:'base'}));
  // Named entities should sort by what people see, not their UUIDs. Explicit
  // option order remains meaningful for severity, status and date windows.
  for(const option of additions)known.set(option.value,option);
  const counts=new Map<string,number>();
  for(const item of searched)if(matches(item,facet.key))for(const value of item.values.get(facet.key)!)counts.set(value,(counts.get(value)||0)+1);
  return {...facet,options:[...known.values()].map(option=>({...option,count:counts.get(option.value)||0,selected:chosen.includes(option.value)}))};
 });
 const sort=sorts.find(candidate=>candidate.key===state.sort)||sorts[0];
 const filtered=searched.filter(item=>matches(item));
 if(sort){
  const sortValues=new Map(filtered.map(item=>[item.index,sort.getValue(item.row)]));
  filtered.sort((a,b)=>{
   const left=sortValues.get(a.index),right=sortValues.get(b.index);
   const leftKnown=usableSortValue(left),rightKnown=usableSortValue(right);
   // Unknown is last in either direction, never coerced to a fabricated zero.
   if(!leftKnown||!rightKnown)return leftKnown?-1:rightKnown?1:a.index-b.index;
   const comparison=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right),'en',{numeric:true,sensitivity:'base'});
   return comparison*(sort.direction==='desc'?-1:1)||a.index-b.index;
  });
 }
 const activeFacetCount=[...selected.values()].filter(values=>values.length>0).length;
 return {rows:filtered.map(item=>item.row),facets:resolvedFacets,total:rows.length,
  activeCount:[...selected.values()].reduce((total,values)=>total+values.length,0)+(terms.length?1:0),
  activeFacetCount,queryActive:terms.length>0,sortKey:sort?.key||state.sort};
}

export const DATE_WINDOW_OPTIONS:readonly FacetOption[]=[
 {value:'24h',label:'Last 24 hours'},
 {value:'7d',label:'Last 7 days'},
 {value:'30d',label:'Last 30 days'},
 {value:'older',label:'More than 30 days ago'},
 {value:'future',label:'Future timestamp'},
 {value:UNKNOWN_FILTER_VALUE,label:'Date not recorded'},
];

/** Date windows overlap intentionally; callers use a single-choice date facet. */
export function dateWindowValues(value:unknown,now=Date.now()):string[]{
 const timestamp=value instanceof Date?value.getTime():typeof value==='number'?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
 if(!Number.isFinite(timestamp)||!Number.isFinite(now))return [UNKNOWN_FILTER_VALUE];
 const age=now-timestamp,day=86_400_000;
 if(age<0)return ['future'];
 if(age>30*day)return ['older'];
 return [...(age<=day?['24h']:[]),...(age<=7*day?['7d']:[]),'30d'];
}
