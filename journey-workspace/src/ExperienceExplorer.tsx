import {useMemo} from 'react';
import type {ReactNode} from 'react';
import {AppLink,Button,Empty} from './App';
import {Icon} from './icons';
import {clock,fullDate,label,list} from './lib';
import type {Row} from './lib';
import {SmartFilters,useTableFilters} from './SmartFilters';
import type {CollectionFilterConfig} from './collection-filters';
import {buildExperienceFeedback} from './experience-feedback';
import {insightMomentHref} from './insights-data';
import {ExperienceDetailPanel} from './ExperienceDetailPanel';
import {ExperiencePages} from './ExperiencePages';
import {SummaryStrip} from './CollectionSummary';
import {experienceSummary} from './insight-summary-metrics';
import './experience-feedback.css';

type Props={id?:string;projectId:string;projectName:string;base:string;route:any;navigate:(path:string)=>void;result:Row;environments:Row[];impacts:Row[];impactsLoading:boolean;advanced:ReactNode;advancedOpen:boolean;onAdvanced:()=>void;editor:ReactNode;report:Row|null;reports:Row[]};
const typeNames:Record<string,string>={broken:'Defect',experience:'Experience',product:'Product',business:'Business',unknown:'Not classified'};
const moods:Record<string,string>={very_positive:'Excellent',positive:'Positive',neutral:'Neutral',negative:'Negative',very_negative:'Very negative',unknown:'Unrated'};
const xpKeys=['expand','xpBefore','xpAfter','xpState','xpPersona','xpSide','xpMoment','xpBeforeRuns','xpAfterRuns'];
const readable=(value:string)=>{try{return decodeURIComponent(value);}catch{return value;}};
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;
function identityOptions(rows:Row[],idKey:string,nameKey:string){
 const names=new Map<string,string>();for(const row of rows)if(row[idKey])names.set(row[idKey],row[nameKey]||'Not recorded');
 const repeated=new Map<string,number>();for(const name of names.values())repeated.set(name,(repeated.get(name)||0)+1);
 return [...names].map(([value,name])=>({value,label:repeated.get(name)!>1?`${name} · ${value.slice(0,8)}`:name}));
}
function feedbackFilters(rows:Row[]):CollectionFilterConfig{return {
 facets:[
  {key:'feedbackPersona',label:'Persona',primary:true,getValues:r=>r.personaId,options:identityOptions(rows,'personaId','personaName')},
  {key:'feedbackEnvironment',label:'Environment',primary:true,getValues:r=>r.environmentId,options:identityOptions(rows,'environmentId','environmentName')},
  {key:'feedbackType',label:'Type',primary:true,getValues:r=>r.types,options:Object.entries(typeNames).map(([value,name])=>({value,label:name}))},
  {key:'feedbackFeeling',label:'Reaction',getValues:r=>r.valence||'unknown',options:Object.entries(moods).map(([value,name])=>({value,label:name}))},
  {key:'feedbackPage',label:'Page',getValues:r=>r.pageId,options:identityOptions(rows,'pageId','pageName')}
 ],
 sorts:[{key:'relevant',label:'Problems first',direction:'desc',getValue:r=>({critical:70,high:60,medium:50,low:40}[r.impact as 'critical']||0)+({very_negative:30,negative:20}[r.valence as 'negative']||0)},
 {key:'recent',label:'Newest journeys',direction:'desc',getValue:r=>r.createdAt?Date.parse(r.createdAt):null},
 {key:'page',label:'Page A–Z',direction:'asc',getValue:r=>r.pageName},
 {key:'sequence',label:'Journey order',direction:'asc',getValue:r=>`${r.runId}:${String(r.originalMs??999999999).padStart(12,'0')}`}],
 defaultSort:'relevant',searchText:r=>[r.title,r.why,r.observation,r.reaction,r.personaName,r.journeyName,r.runId,r.environmentName,r.pageName,r.pageUrl,...list(r.findings).flatMap(f=>[f.title,f.observation,f.personaComment])].filter(Boolean).join(' '),
 presets:[{key:'friction',label:'Negative reactions',selections:{feedbackFeeling:['negative','very_negative']}},{key:'positive',label:'Positive reactions',selections:{feedbackFeeling:['positive','very_positive']}},{key:'defects',label:'Defects',selections:{feedbackType:['broken']}}]
};}

export function ExperienceExplorer({id,projectId,projectName,base,route,navigate,result,environments,impacts,impactsLoading,advanced,advancedOpen,onAdvanced,editor,report,reports}:Props){
 const model=useMemo(()=>buildExperienceFeedback({screens:list(result.screens),sourceRuns:list(result.sourceRuns),derivedFeedback:list(result.derivedFeedback),environments,impacts,projectId,projectName}),[result,environments,impacts,projectId,projectName]);
 const params=new URLSearchParams(route.search),page=id?model.pages.find(page=>page.id===readable(id)):undefined;
 const feed=model.takeaways;
 const pageRows=page?feed.filter(item=>item.pageId===page.id):id?[]:feed;
 const config=useMemo(()=>feedbackFilters(feed),[feed]),filters=useTableFilters(pageRows,config,route),rows=filters.rows;
 const grouped=params.get('group')==='page'&&!page,comparison=!!page&&params.get('view')==='compare';
 const selected=[...feed,...model.feedback].find(item=>item.id===params.get('feedback')&&(!page||item.pageId===page.id));
 const groups=grouped?[...new Set(rows.map(row=>row.pageId))].map(pageId=>({page:model.pages.find(item=>item.id===pageId)!,rows:rows.filter(row=>row.pageId===pageId)})):[];
 const summary=experienceSummary(rows,!!page);
 const query=(changes:Record<string,string|null>,path=route.path)=>{const q=new URLSearchParams(route.search);for(const [key,value] of Object.entries(changes)){if(value===null)q.delete(key);else q.set(key,value);}navigate(`${path}${q.size?`?${q}`:''}`);};
 const destination=(target?:Row)=>{const q=new URLSearchParams(route.search);q.delete('feedback');q.delete('view');const saved=new URLSearchParams(q.get('feedbackReturn')||'');q.delete('feedbackReturn');for(const [key,value] of saved)q.append(key,value);xpKeys.forEach(key=>q.delete(key));return `${base}/experience${target?`/${encodeURIComponent(target.id)}`:''}${q.size?`?${q}`:''}`;};
 const open=(row:Row)=>query({feedback:row.id});
 const toggleComparison=()=>{const q=new URLSearchParams(route.search);q.delete('feedback');xpKeys.forEach(key=>q.delete(key));if(!comparison){const saved=new URLSearchParams();for(const [key,value] of [...q])if(key.startsWith('feedback')||['q','sort','group'].includes(key)){saved.append(key,value);q.delete(key);}if(saved.size)q.set('feedbackReturn',saved.toString());q.set('view','compare');q.set('expand',page!.sourcePage.id);}else{q.delete('view');const saved=new URLSearchParams(q.get('feedbackReturn')||'');q.delete('feedbackReturn');for(const [key,value] of saved)q.append(key,value);}navigate(`${route.path}${q.size?`?${q}`:''}`);};
 const compareNavigate=(path:string)=>{const url=new URL(path,'http://local');if(url.pathname!==`${base}/experience`){navigate(path);return;}url.searchParams.set('view','compare');navigate(`${route.path}${url.search}`);};
 return <div className="xf-explorer">
  {page&&<div className="xf-breadcrumb"><AppLink to={destination()} navigate={navigate}><Icon name="back" size={13}/>All feedback</AppLink><span>/</span><span>{page.name}</span></div>}
  <header className="page-heading"><div><h1>{page?page.name:'Experience'}<span className="heading-dot">.</span></h1><p>{page?<><span className="xf-page-url">{page.url}</span><span className="xf-heading-separator">·</span>{plural(page.runIds.length,'journey')} on this screen</>:'What helped. What hurt. Why it mattered.'}</p></div><div className="heading-actions">{!page&&<div className="xf-view-toggle" role="group" aria-label="Group feedback"><button type="button" aria-pressed={!grouped} onClick={()=>query({group:null,feedback:null})}><Icon name="menu" size={12}/>All feedback</button><button type="button" aria-pressed={grouped} onClick={()=>query({group:'page',feedback:null})}><Icon name="folder" size={12}/>By page</button></div>}{page&&<Button icon={comparison?'comment':'branch'} onClick={toggleComparison}>{comparison?'Explore feedback':'Compare versions'}</Button>}{!report&&<Button icon="calibration" onClick={onAdvanced}>Advanced</Button>}</div></header>
  {(report||advancedOpen)&&advanced}{editor}
  {impactsLoading?<div className="xf-loading" role="status">Loading recorded feedback…</div>:id&&!page?<Empty icon="experience" title="This page is outside the selected scope." action={<Button onClick={()=>navigate(destination())}>All feedback</Button>}/>:comparison?<ExperiencePages embedded fixedStateId={page!.state.id} pages={[page!.comparisonPage||page!.sourcePage]} projectId={projectId} projectName={projectName} environments={environments} sourceRuns={list(result.sourceRuns)} impacts={impacts} impactsLoading={false} base={base} route={route} navigate={compareNavigate}/>:<>
   <SummaryStrip count={rows.length} total={pageRows.length} label="feedback" {...summary} ariaLabel="Experience summary" kind="experience"/>
   <SmartFilters filters={filters} primaryFacetLimit={3} noun="feedback" placeholder="Search feedback, personas, journeys…"/>
   {!rows.length?<Empty icon="comment" title={filters.activeCount>0?'No feedback matches these filters.':page?'No meaningful feedback recorded on this page.':'No meaningful feedback recorded yet.'} action={filters.activeCount>0?<Button onClick={filters.clear}>Clear filters</Button>:undefined}/>:grouped?<div className="xf-page-groups">{groups.map(group=><section className="xf-page-group" key={group.page.id}><header><AppLink to={destination(group.page)} navigate={navigate}><Icon name="coverage" size={16}/><span><strong>{group.page.name}</strong><small>{group.page.url}</small></span><Icon name="arrow" size={13}/></AppLink><span>{plural(group.rows.length,'feedback').replace('feedbacks','feedback')} · {plural(new Set(group.rows.map(row=>row.personaId)).size,'persona')}</span></header><FeedbackTable rows={group.rows} base={base} showPage={false} onOpen={open} pageHref={pageId=>destination(model.pages.find(p=>p.id===pageId))} navigate={navigate}/></section>)}</div>:<FeedbackTable rows={rows} base={base} showPage={!page} onOpen={open} pageHref={pageId=>destination(model.pages.find(p=>p.id===pageId))} navigate={navigate}/>}
  </>}
  {reports.length>0&&!page&&<details className="insight-saved-reports"><summary>Saved scope reports · {reports.length}</summary>{reports.map(item=><AppLink key={item.id} to={`${base}/${item.kind}?report=${item.id}`} navigate={navigate}><Icon name="archive" size={14}/><strong>{item.name}</strong><span>{fullDate(item.createdAt)}</span></AppLink>)}</details>}
  {selected&&!comparison&&<ExperienceDetailPanel key={selected.id} environments={environments} row={{id:selected.personaId||selected.runId,name:selected.personaName,before:selected.journeySide,after:null}} side="before" labels={{before:selected.environmentName,after:''}} comparison={false} feedback={selected} projectId={projectId} base={base} navigate={navigate} initialMomentId={selected.moment?.id} initialStateId={selected.state?.id==='unknown'?undefined:selected.state?.id} onClose={()=>query({feedback:null})} onSideChange={()=>{}} onRunChange={()=>{}}/>}
 </div>;
}

function FeedbackTable({rows,base,showPage,onOpen,pageHref,navigate}:{rows:Row[];base:string;showPage:boolean;onOpen:(row:Row)=>void;pageHref:(id:string)=>string;navigate:(path:string)=>void}){
 return <div className="xf-table-wrap"><table className={`xf-table ${showPage?'with-page':'without-page'}`}><thead><tr><th>Feedback</th>{showPage&&<th>Page</th>}<th>Persona</th><th>Journey</th><th>Type</th><th>Reaction</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} className={`xf-feedback-row tone-${row.tone||'unrated'}`}>
  <td className="xf-feedback-cell" data-label="Feedback"><button className="xf-feedback-open" type="button" onClick={()=>onOpen(row)} aria-label={`Open feedback: ${row.title}`}><i/><span><strong>{row.title||'Recorded feedback'}</strong>{row.why&&row.why!==row.title&&<small>{row.why}</small>}{list(row.findings).length>0&&<em>{row.findings.length} linked {row.findings.length===1?'finding':'findings'}</em>}</span><Icon name="chevron" size={12}/></button></td>
  {showPage&&<td data-label="Page"><AppLink className="xf-page-link" to={pageHref(row.pageId)} navigate={navigate}><strong>{row.pageName}</strong><small>{row.pageUrl}</small></AppLink></td>}
  <td data-label="Persona"><span className="xf-persona-name">{String(row.personaName||'Unknown persona').split(' · ')[0]}</span></td>
  <td data-label="Journey" title={`${row.journeyName||'Recorded journey'} · ${row.runId||'Unknown'} · ${row.environmentName}`}>{row.runId?<AppLink className="xf-journey-link" to={insightMomentHref(base.split('/')[2],{...(row.moment||row.source||{}),runId:row.runId,originalMs:row.originalMs})||`${base}/runs/${encodeURIComponent(row.runId)}?tab=journey`} navigate={navigate}><strong>{row.journeyName||`Journey ${row.runId.slice(0,8)}`}</strong><span>{row.createdAt?fullDate(row.createdAt):row.runId.slice(0,8)}{row.originalMs!=null&&<> · <b>{clock(row.originalMs)}</b></>}<Icon name="arrow" size={11}/></span></AppLink>:<span className="xf-context-subtitle">Journey not recorded</span>}</td>
  <td data-label="Type"><div className="xf-type-list">{(row.types?.length?row.types:['unknown']).map((type:string)=><span className={`xf-type type-${type}`} key={type}>{typeNames[type]||label(type)}</span>)}</div></td>
  <td data-label="Reaction"><span className={`xf-reaction tone-${row.tone||'unrated'}`}><i/>{moods[row.valence]||'Unrated'}</span></td>
 </tr>)}</tbody></table></div>;
}
