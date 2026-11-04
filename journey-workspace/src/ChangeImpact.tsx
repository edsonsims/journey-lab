import {DeviceBadge} from './DeviceBadge';
import {configuredEnvironment} from './environment-context';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {AppLink,Badge,Button,Empty,ResourceState,useResource} from './App';
import {list,label,num,clock,safeMedia} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';
import {SmartFilters,useTableFilters} from './SmartFilters';
import type {FilterPreset} from './SmartFilters';
import {Player} from './Player';
import {JourneyMatchReview} from './JourneyMatchReview';
import {buildEmotionComparison} from './emotion-comparison';
import {planImpactMomentSeek} from './impact-moment-seek';
import type {ImpactMomentSeek} from './impact-moment-seek';
import type {ComparisonAnchor} from './emotion-comparison';
import {usePairedPlayback} from './usePairedPlayback';
import {impactStagePairs,impactOutcome,recordedCount,preferredImpactPair,repairRecordingsComplete} from './change-impact';
import {impactOrigin,formatImpactDate,comparisonLabels} from './impact-origin';
import {buildImpactExperience} from './impact-experience';
import {ImpactPerspectives} from './ImpactPerspectives';
import {ImpactEmotionalLandscape} from './ImpactEmotionalLandscape';
import type {ImpactMomentSelection,ImpactPlaybackPosition} from './ImpactEmotionalLandscape';
import {getImpactExample} from './impact-examples';
import type {JourneyReviewDecision} from './journey-matching';
import type {ImpactStage} from './change-impact';
import './change-impact.css';
import './impact-collection.css';
import './impact-evidence-navigation.css';
import {SummaryStrip} from './CollectionSummary';
import {impactCollectionRows,impactCollectionAssessment,impactCollectionSource,impactCollectionPersonas,impactCollectionSearchText,impactCollectionSummary} from './impact-collection';

type MomentRequest=ImpactMomentSelection&{nonce:number;impactId:string;stage:ImpactStage};
type Props={id?:string;projectId:string;environments:Row[];base:string;navigate:(path:string)=>void;route:any;revision:number};
const pairName=(pair:Row)=>pair.personaName||pair.before?.personaSnapshot?.name||pair.after?.personaSnapshot?.name||pair.before?.personaName||pair.personaId||'Persona';
const filters={
 facets:[{key:'status',label:'Assessment',primary:true,getValues:impactCollectionAssessment,labelValue:(value:string)=>value==='illustrated'?'Illustrated scenario':label(value)},{key:'source',label:'Source',primary:true,getValues:impactCollectionSource}],
 sorts:[{key:'updated',label:'Recently updated',getValue:(row:Row)=>row.updatedAt,direction:'desc' as const},{key:'title',label:'Name',getValue:(row:Row)=>row.title,direction:'asc' as const}],
 defaultSort:'updated',searchText:impactCollectionSearchText,
 presets:[{key:'all',label:'All changes',selections:{}},{key:'inconclusive',label:'Needs attention',selections:{status:['inconclusive']}},{key:'completed',label:'Recorded',selections:{status:['completed']}},{key:'illustrated',label:'Illustrated examples',selections:{status:['illustrated']}}] as FilterPreset[],
};

export function ChangeImpact(props:Props){return props.id?<ImpactDetail {...props} id={props.id}/>:<ImpactList {...props}/>;}

function ImpactList({projectId,base,navigate,route,revision}:Props){
 const resource=useResource(`/change-impacts?projectId=${encodeURIComponent(projectId)}`,revision,true);
 const records=useMemo(()=>impactCollectionRows(list(resource.data?.changeImpacts)),[resource.data]),table=useTableFilters(records,filters,route);
 const listSummary=impactCollectionSummary(table.rows);
 if(!resource.data)return <ResourceState {...resource}/>;
 return <div className="impact-workbench"><header className="impact-heading"><div><h1>Change impact<span>.</span></h1><p>What changed. Who felt it.</p></div></header>
 <SummaryStrip count={table.rows.length} total={records.length} label={table.rows.length===1?'change':'changes'} {...listSummary} secondary={[]} ariaLabel="Change summary" kind="change-impact"/>
 {listSummary.examples>0&&<p className="impact-collection-note"><Icon name="info" size={13}/>Totals cover {listSummary.saved} saved {listSummary.saved===1?'assessment':'assessments'}. Illustrated examples are excluded.</p>}
 <SmartFilters filters={table} noun="changes" placeholder="Search changes, people, PRs…"/>
 {table.rows.length?<div className="table-wrap"><table className="data-table impact-table impact-collection-table"><thead><tr><th>Change</th><th>Source</th><th>Assessment</th><th>Perspectives</th><th>Fix</th><th/></tr></thead><tbody>{table.rows.map(record=>{const source=impactOrigin(record),personas=impactCollectionPersonas(record),detailPath=`${base}/impact/${record.id}`;return <tr key={record.id} data-evidence={record.isExample?'illustrated':'saved'}><td className="impact-collection-change"><AppLink className="row-title" to={detailPath} navigate={navigate}><span className="impact-change-icon"><Icon name={record.isExample?'spark':'branch'}/></span><span><strong>{record.title}</strong><small>{record.changeSummary||record.intent}</small></span></AppLink></td><td>{record.isExample?<><span className="impact-collection-source"><Icon name="spark" size={13}/><strong>Illustrated example</strong></span><small className="impact-table-date">{record.product}</small></>:<><SourceIdentity record={record}/><small className="impact-table-date">{source.sourceEvent.at?`${source.sourceEvent.label} ${formatImpactDate(source.sourceEvent.at)}`:`Assessed ${formatImpactDate(source.assessedAt)}`}</small></>}</td><td>{record.isExample?<span className="impact-collection-example-state">Authored scenario</span>:<Badge value={record.report?.status||'pending'}/>}</td><td><div className="impact-collection-perspectives"><AppLink to={detailPath} navigate={navigate}>{num(personas.length)} {personas.length===1?'perspective':'perspectives'}</AppLink><div className="impact-collection-names">{personas.slice(0,4).map(persona=><AppLink key={persona.id} to={`${detailPath}?persona=${encodeURIComponent(persona.id)}`} navigate={navigate}><span title={`Open ${persona.name}’s perspective`}>{persona.name.split(' · ')[0]}</span></AppLink>)}{personas.length>4&&<AppLink to={detailPath} navigate={navigate}><span title={personas.slice(4).map(persona=>persona.name).join(', ')}>+{personas.length-4}</span></AppLink>}</div></div></td><td>{record.fixId?<AppLink to={`${base}/fixes/${record.fixId}`} navigate={navigate}>{repairRecordingsComplete(record)?'Retested':'Retest pending'}</AppLink>:<span className="muted">—</span>}</td><td><AppLink to={detailPath} navigate={navigate} className="row-arrow"><Icon name="arrow" size={16}/><span className="sr-only">Review {record.title}</span></AppLink></td></tr>;})}</tbody></table></div>:<Empty icon="branch" title="No changes match this view." action={table.activeCount?<Button onClick={table.clear}>Clear filters</Button>:undefined}>Adjust the filters to see the other changes.</Empty>}
 {resource.error&&<p className="form-error" role="alert">{resource.error}</p>}</div>;
}

function SourceIdentity({record}:{record:Row}){
 const source=impactOrigin(record);
 if(record.isExample)return <span className="impact-source-identity"><Icon name="spark" size={13}/><strong>Example</strong></span>;
 return <span className={`impact-source-identity tone-${source.tone}`}><Icon name="branch" size={13}/>{source.href?<a href={source.href} target="_blank" rel="noreferrer">{source.label}<Icon name="external" size={11}/></a>:<strong>{source.label}</strong>}{source.kind==='pull_request'&&<span>{source.state==='merged'?'Merged':'Proposed'}</span>}</span>;
}

function ImpactDetail({id,projectId,environments,base,navigate,route,revision}:Props&{id:string}){
 const example=useMemo(()=>getImpactExample(id),[id]);
 const resource=useResource(example?null:`/change-impacts/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`,revision,true),record=example||resource.data;
 const [detailsTarget,setDetailsTarget]=useState<HTMLDivElement|null>(null);
 const [moment,setMoment]=useState<MomentRequest>();
 const [playbackPosition,setPlaybackPosition]=useState<ImpactPlaybackPosition>();
 const requestSequence=useRef(0);
 const query=new URLSearchParams(route.search),stage:ImpactStage=query.get('stage')==='repair'?'repair':'proposal';
 const pairs=useMemo(()=>impactStagePairs(record,stage),[record,stage]),selected=pairs.find(pair=>pair.personaId===query.get('persona'))||preferredImpactPair(pairs);
 const playbackScope=`${id}-${stage}-${selected?.personaId}-${selected?.beforeRunId}-${selected?.afterRunId}`;
 const repairRecorded=repairRecordingsComplete(record);
 const fixResource=useResource(record?.fixId?`/fixes/${record.fixId}`:null,revision,true),fix=fixResource.data;
 const round=list(fix?.rounds).find(item=>item.id===(record?.roundId||fix?.currentRoundId))||list(fix?.rounds).at(-1);
 function select(nextStage:ImpactStage,personaId?:string){const params=new URLSearchParams(route.search);params.set('stage',nextStage);if(personaId)params.set('persona',personaId);else params.delete('persona');route.navigate(`${route.path}?${params}`,true);}
 function inspectMoment(selection:ImpactMomentSelection){setMoment({...selection,nonce:++requestSequence.current,impactId:id,stage});}

 if(!record)return <ResourceState {...resource}/>;
 const labels=comparisonLabels(record,stage),source=impactOrigin(record),sourceStatus=record.report?.status||'pending';
 const changeContext=<ImpactChangeContext key={record.id} record={record}/>;
 return <div className="impact-workbench impact-detail"><div className="detail-nav"><div className="impact-breadcrumb"><AppLink to={`${base}/impact`} navigate={navigate}><Icon name="back" size={15}/>All changes</AppLink><SourceIdentity record={record}/></div><span className="impact-assessment-date">{example?`${example.product} · Authored scenario`:`Assessment created ${formatImpactDate(source.assessedAt)}`}</span></div>
 <header className="impact-heading"><div>{(source.repository||source.sourceEvent.at)&&<div className="impact-source-row">{source.repository&&<span>{source.repository}</span>}{source.sourceEvent.at&&<time dateTime={source.sourceEvent.at}>{source.sourceEvent.label} {formatImpactDate(source.sourceEvent.at)}</time>}</div>}<h1>{String(record.title||'Change impact').replace(/\.$/,'')}<span>.</span></h1></div>{!example&&<Badge value={sourceStatus}/>}</header>
 {changeContext}

 <div className="impact-comparison-bar"><div className="impact-stagebar"><div><div className="impact-stage-tabs" role="tablist" aria-label="Change comparison"><button type="button" role="tab" aria-selected={stage==='proposal'} className={stage==='proposal'?'selected':''} onClick={()=>select('proposal',selected?.personaId)}>Change impact</button>{(record.fixId||record.report?.repair||stage==='repair')&&<button type="button" role="tab" aria-selected={stage==='repair'} className={stage==='repair'?'selected':''} onClick={()=>select('repair',selected?.personaId)}>Fix impact{repairRecorded&&<i aria-label="Retests recorded"/>}</button>}</div></div>{record.fixId&&<AppLink className="button" to={`${base}/fixes/${record.fixId}`} navigate={navigate}><Icon name="fixes" size={15}/>Review fix<Icon name="arrow" size={14}/></AppLink>}</div>
 <div className="impact-comparison-context" aria-label="Compared versions"><span className="impact-version-before"><i/>{labels.before}</span><Icon name="arrow" size={14}/><span className="impact-version-after"><i/>{labels.after}</span>{stage==='repair'&&fix?.title&&<small>{fix.title}</small>}</div></div>
 {pairs.length&&selected?<>
 {selected.controls?.issues?.length>0&&<div className="impact-control-warning" role="status"><Icon name="info" size={16}/><div><strong>{selected.controls.status==='mismatch'?'These journeys are not equivalent controls.':'Comparison controls'}</strong>{list(selected.controls.issues).map((issue:any,index)=><p key={index}>{typeof issue==='string'?issue:issue.message||issue.code||'Control unavailable'}</p>)}</div></div>}
 <div className="impact-perspective-workspace impact-video-workspace">
  <section id="impact-evidence" className="impact-evidence-section impact-selected-comparison" aria-label="Selected persona before and after details">
   <h2 className="sr-only">{pairName(selected)} · Before &amp; after</h2>
   <div className="impact-playback"><ImpactEvidence key={playbackScope} playbackScope={playbackScope} onPlaybackPosition={setPlaybackPosition} pair={selected} labels={labels} base={base} navigate={navigate} isExample={!!example} detailsTarget={detailsTarget} moment={moment?.impactId===id&&moment.stage===stage&&moment.personaId===selected.personaId?moment:undefined}/></div>
   <ImpactEmotionalLandscape compact key={`${id}-${stage}`} pairs={pairs} selectedId={selected.personaId} onSelect={personaId=>select(stage,personaId)} onMomentSelect={inspectMoment} playbackPosition={playbackPosition?.scope===playbackScope?playbackPosition:undefined} labels={labels} isExample={!!example}/>
   <div className="impact-selected-tools" ref={setDetailsTarget}/>
  </section>
  <aside className="impact-perspective-rail"><ImpactPerspectives compact pairs={pairs} selectedId={selected.personaId} onSelect={personaId=>select(stage,personaId)}/></aside>
 </div></>:<div className="impact-pending"><Icon name={stage==='repair'?'fixes':'film'} size={28}/><div><h2>{stage==='repair'?'No fix retest yet.':'No paired journeys yet.'}</h2><p>{stage==='repair'?'Retest the candidate to compare its impact.':'Record each persona on both versions to compare.'}</p></div></div>}
 {!example&&<details className="impact-provenance"><summary><Icon name="code" size={14}/>Builds, metrics &amp; comparison controls</summary><div className="impact-builds">{(['baseline','proposal'] as const).map(side=><div key={side}><strong>{record[side]?.label||(side==='baseline'?'Current':'Change')}</strong><code>{record[side]?.sourceHash||'Source identity not captured'}</code><span>Environment {configuredEnvironment(record[side],environments)?.name||'not recorded'} · version {configuredEnvironment(record[side],environments)?.version??'—'}</span></div>)}{round?.candidateHash&&<div><strong>Fixed candidate</strong><code>{round.candidateHash}</code><span>{list(round.changedFiles).length} changed files · {label(fix?.status)}</span></div>}</div>{selected&&<div className="impact-technical-metrics">{(['before','after'] as const).map(side=><span key={side}>{labels[side]} · {num(selected.metrics?.[side]?.totalTokens)} tokens · Recorded {formatImpactDate(selected[side]?.createdAt)}</span>)}</div>}{record.report?.limitations?.length>0&&<ul>{list(record.report.limitations).map((item:any,index)=><li key={index}>{String(item)}</li>)}</ul>}</details>}
 {resource.error&&<p className="form-error" role="alert">{resource.error}</p>}</div>;
}

function ImpactChangeContext({record}:{record:Row}){
 const source=impactOrigin(record),changes=list(record.changes);
 return <section className="impact-change-context" aria-label="What changed"><details className="impact-change-disclosure"><summary className="impact-change-inline"><strong>What changed:</strong><span className="impact-change-summary">{record.changeSummary||record.intent||'No change summary recorded.'}</span><span className="impact-change-count">{changes.length?`${changes.length} ${changes.length===1?'change':'changes'}`:'Details'}<Icon name="down" size={13}/></span></summary>{changes.length>0&&<ul className="impact-change-list">{changes.map((change,index)=><li key={index}>{String(change)}</li>)}</ul>}{source.baseRef||source.headRef?<div className="impact-refs"><code>{source.baseRef||'Base'}</code><Icon name="arrow" size={12}/><code>{source.headRef||'Change'}</code></div>:null}</details></section>;
}

function ImpactPersonaGoal({pair}:{pair:Row}){
 const mission=pair.before?.personaSnapshot?.mission||pair.after?.personaSnapshot?.mission;
 return mission?<details className="impact-persona-goal"><summary>Persona goal</summary><p>{mission}</p></details>:null;
}

function ImpactPersonaHeader({pair,children}:{pair:Row;children?:ReactNode}){
 return <div className="comparison-toolbar"><div className="impact-recording-label"><Icon name={pair.isExample?'info':'film'} size={15}/><div><strong>{pairName(pair)}</strong><ImpactPersonaGoal pair={pair}/></div></div>{children}</div>;
}

function ImpactEvidence({pair,labels,base,navigate,isExample,moment,detailsTarget,playbackScope,onPlaybackPosition}:{pair:Row;labels:{before:string;after:string};base:string;navigate:(path:string)=>void;isExample:boolean;moment?:MomentRequest;detailsTarget:HTMLElement|null;playbackScope:string;onPlaybackPosition:(position:ImpactPlaybackPosition)=>void}){
 const beforeResource=useResource(!isExample&&pair.beforeRunId&&!pair.before?`/runs/${pair.beforeRunId}`:null,0,true),afterResource=useResource(!isExample&&pair.afterRunId&&!pair.after?`/runs/${pair.afterRunId}`:null,0,true);
 const before=pair.before||beforeResource.data,after=pair.after||afterResource.data;
 const [reviewDecisions,setReviewDecisions]=useState<JourneyReviewDecision[]>([]);
 const [reviewPortalTarget,setReviewPortalTarget]=useState<HTMLDivElement|null>(null);
 const [linked,setLinked]=useState(true),[anchors,setAnchors]=useState<ComparisonAnchor>(),[clocks,setClocks]=useState({before:0,after:0}),[notice,setNotice]=useState('');
 const [durations,setDurations]=useState<{before?:number;after?:number}>({});
 const [failedMedia,setFailedMedia]=useState<Partial<Record<'before'|'after',boolean>>>({});
 const [momentAvailability,setMomentAvailability]=useState<ImpactMomentSeek>();
 const [beforeSeek,setBeforeSeek]=useState<{ms:number;nonce:number}>(),[afterSeek,setAfterSeek]=useState<{ms:number;nonce:number}>();
 const [scenarioPoints,setScenarioPoints]=useState<Partial<Record<'before'|'after',ImpactMomentSelection['point']>>>({});
 const [expanded,setExpanded]=useState(false);
 const handledMoment=useRef<number|undefined>(undefined),players=useRef<HTMLDivElement>(null);
 const model=useMemo(()=>{
  const withDuration=(run:Row|undefined,ms:number|undefined,failed?:boolean)=>run?{...run,...(ms==null?{}:{originalDurationMs:ms,videoDurationMs:ms}),...(failed?{video:null}:{})}:null;
  return buildEmotionComparison(withDuration(before,durations.before,failedMedia.before),withDuration(after,durations.after,failedMedia.after),anchors);
 },[before,after,durations,failedMedia,anchors]);
 const canLink=!isExample&&!failedMedia.before&&!failedMedia.after&&!!safeMedia(before?.video)&&!!safeMedia(after?.video);
 const playback=usePairedPlayback({enabled:linked&&canLink,beforeId:before?.id,afterId:after?.id,beforeAnchorMs:model.anchors.beforeMs,afterAnchorMs:model.anchors.afterMs});
 const updateBefore=useCallback((ms:number)=>setClocks(current=>current.before===ms?current:{...current,before:ms}),[]),updateAfter=useCallback((ms:number)=>setClocks(current=>current.after===ms?current:{...current,after:ms}),[]);
 useEffect(()=>{
  if(isExample)return;
  const sidePosition=(side:'before'|'after')=>({ms:clocks[side],durationMs:durations[side]??null,available:!failedMedia[side]&&!!safeMedia((side==='before'?before:after)?.video)&&(!momentAvailability||momentAvailability[side==='before'?'beforeState':'afterState']==='available')});
  onPlaybackPosition({scope:playbackScope,personaId:pair.personaId,before:sidePosition('before'),after:sidePosition('after'),inspection:momentAvailability&&moment&&handledMoment.current===moment.nonce?{side:moment.side,pointId:moment.point.id}:undefined});
 },[isExample,playbackScope,pair.personaId,clocks,durations,failedMedia,before,after,momentAvailability,moment,onPlaybackPosition]);
 function pause(){playback.pause();players.current?.querySelectorAll('video').forEach(video=>video.pause());}
 function pairMoments(beforeMs:number,afterMs:number,title?:string){if(!Number.isFinite(beforeMs)||!Number.isFinite(afterMs))return;pause();setMomentAvailability(undefined);setAnchors({beforeMs,afterMs});setLinked(true);if(canLink){setBeforeSeek(undefined);setAfterSeek(undefined);if(anchors?.beforeMs===beforeMs&&anchors?.afterMs===afterMs)playback.seek(0);}else{setBeforeSeek({ms:beforeMs,nonce:Date.now()});setAfterSeek({ms:afterMs,nonce:Date.now()});}setNotice(title||'Selected moments aligned');}
 function reset(){pause();setMomentAvailability(undefined);setAnchors(undefined);setNotice('');setLinked(true);setBeforeSeek({ms:0,nonce:Date.now()});setAfterSeek({ms:0,nonce:Date.now()});}
 useEffect(()=>{
  if(!moment||handledMoment.current===moment.nonce)return;
  if(isExample){setScenarioPoints(current=>({...current,[moment.side]:moment.point}));handledMoment.current=moment.nonce;return;}
  // Wait for actual metadata when the saved report has no recording duration.
  if(moment.point.ms!=null&&(canLink&&(model.before.videoDurationMs==null||model.after.videoDurationMs==null)||model[moment.side].hasVideo&&model[moment.side].videoDurationMs==null))return;
  const target=planImpactMomentSeek(model,moment.side,moment.point.ms);
  if(target.canLink){
   if(!linked){setLinked(true);return;}
   if(!playback.state.ready)return;
   pause();
   if(!playback.seek(target.commonMs!))return;
   setBeforeSeek(undefined);setAfterSeek(undefined);
  }else{
   pause();setLinked(false);
   if(target.beforeMs!=null)setBeforeSeek({ms:target.beforeMs,nonce:moment.nonce});
   if(target.afterMs!=null)setAfterSeek({ms:target.afterMs,nonce:moment.nonce});
  }
  setMomentAvailability(target);setNotice(target.label);handledMoment.current=moment.nonce;
 },[moment,isExample,model,canLink,linked,playback.state.ready]);
 const experience=useMemo(()=>buildImpactExperience({...pair,before,after},reviewDecisions),[pair,before,after,reviewDecisions]);
 return <><div className={`impact-recordings ${linked&&canLink?'is-linked':''}${expanded?' is-expanded':''}`}>
 <ImpactPersonaHeader pair={{...pair,before,after}}>{isExample?<span className="impact-evidence-kind">Illustrated scenario · no recordings</span>:<div><button className="text-button comparison-link-button" type="button" disabled={!canLink} aria-pressed={linked&&canLink} title={linked&&canLink?'Original recordings linked. Play, pause and seeking stay together.':'Link the original recordings for synchronized playback.'} onClick={()=>{pause();setLinked(value=>!value);setNotice('');}}><Icon name="calibration" size={13}/>{linked&&canLink?'Linked':'Link videos'}</button><button type="button" className="text-button" disabled={!canLink||(linked&&!playback.state.ready)} onClick={()=>{setMomentAvailability(undefined);if(linked)playback.play();else players.current?.querySelectorAll('video').forEach(video=>void video.play().catch(()=>{}));}}><Icon name="play" size={13}/>Play both</button><button type="button" className="text-button" disabled={!before?.video&&!after?.video} onClick={pause}><Icon name="pause" size={13}/>Pause</button><button type="button" className="text-button impact-expand-videos" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><Icon name="expand" size={13}/>{expanded?'Compact videos':'Expand videos'}</button></div>}</ImpactPersonaHeader>
 <div className="comparison-players" ref={players} onPlayCapture={()=>setMomentAvailability(undefined)} onErrorCapture={event=>{const video=event.target as HTMLVideoElement,side=video.closest('[data-evidence-side]')?.getAttribute('data-evidence-side');if(video.tagName==='VIDEO'&&(side==='before'||side==='after'))setFailedMedia(current=>({...current,[side]:true}));}} onLoadedMetadataCapture={event=>{const video=event.target as HTMLVideoElement,side=video.closest('[data-evidence-side]')?.getAttribute('data-evidence-side');if(video.dataset.recordingMode==='original'&&(side==='before'||side==='after')&&Number.isFinite(video.duration))setDurations(current=>({...current,[side]:video.duration*1000}));}}>{(['before','after'] as const).map(side=>{
  const run=side==='before'?before:after,unavailable=momentAvailability&&momentAvailability[side==='before'?'beforeState':'afterState']!=='available',points=model[side].points,point=scenarioPoints[side]||points.find(item=>item.value!=null&&item.value<0)||points[0];
  return <div key={side} data-evidence-side={side} className={unavailable?'impact-moment-unavailable':undefined}><div className={`comparison-side ${side==='after'?'after':''}`}><span><strong>{side==='before'?'Before':'After'} · {labels[side]}</strong><small>{impactOutcome(pair,side)} · {recordedCount(pair.metrics?.[side]?.interactionActions)??'—'} {isExample?'scenario actions':'actions'}</small></span>{!isExample&&run&&<DeviceBadge run={run}/>} {!isExample&&run?.id&&<AppLink to={`${base}/runs/${run.id}?tab=journey`} navigate={navigate}>Full journey<Icon name="arrow" size={12}/></AppLink>}</div>{!isExample&&unavailable&&<p className="impact-moment-availability" role="status">No corresponding frame at the selected moment.</p>}{isExample?<div className="impact-scenario-side"><span className="impact-evidence-kind">No recording · Illustrated scenario</span><p>{run?.scenario?.summary||'No scenario summary is available.'}</p><div className={`impact-scenario-observation iel-tone-${point?.tone.key||'unrated'}`} aria-live="polite"><strong>{point?.tone.label||'Not assessed'}</strong><blockquote>{point?.entry.reaction||point?.entry.personaComment||'No reaction available.'}</blockquote>{point?.entry.observation&&<p>{point.entry.observation}</p>}</div></div>:run?<Player key={run.id} run={run} compact compactCaption initialMode="original" seek={side==='before'?beforeSeek:afterSeek} onTime={side==='before'?updateBefore:updateAfter} onUserSeek={()=>setMomentAvailability(undefined)} videoRef={side==='before'?playback.beforeRef:playback.afterRef} lockOriginal={linked&&canLink}/>:<div className="comparison-pending"><Icon name="film" size={28}/><h3>{labels[side]} recording</h3><p>The recorded session will appear here.</p></div>}</div>;
 })}</div>
 {!isExample&&(anchors||playback.state.error||linked&&canLink&&(!playback.state.ready||playback.state.buffering)||notice&&momentAvailability&&momentAvailability.status!=='linked')&&<div className="comparison-sync-status" role="status"><Icon name="info" size={13}/><strong>{linked&&canLink?playback.state.buffering?'Buffering both recordings…':playback.state.ready?'Original recordings linked':'Loading recordings':'Independent playback'}</strong><span>{notice||(anchors?'Aligned at the selected moments.':'Arc moments seek both recordings by elapsed time.')}</span>{anchors&&<button type="button" className="text-button" onClick={reset}>Reset alignment</button>}{playback.state.error&&<span className="sync-error">{playback.state.error}</span>}</div>}
 </div>
 {!isExample&&detailsTarget&&createPortal(<><JourneyMatchReview reviewOnly sessionOnly compact externalReview reviewPortalTarget={reviewPortalTarget} onReviewChange={setReviewDecisions} comparisonLabels={labels} fixId="" roundId="" before={before||null} after={after||null} beforeMs={clocks.before} afterMs={clocks.after} anchorBeforeMs={model.anchors.beforeMs} anchorAfterMs={model.anchors.afterMs} onPair={pairMoments} onReset={reset} onPreview={()=>players.current?.scrollIntoView({behavior:'smooth',block:'center'})} recordingChart={null}/>
 <div className="impact-comparison-footer"><details className="impact-comparison-details"><summary>Comparison details<Icon name="down" size={12}/></summary><div className="impact-comparison-detail-content"><p>{experience.summary}</p><p>{experience.emotion.compared} matched · {experience.coverage.unmatchedBefore+experience.coverage.unmatchedAfter} unmatched</p><div className="impact-moment-shortcuts" aria-label="Experience highlights">{experience.highlights.map(highlight=><button type="button" key={highlight.id} className={highlight.direction==='lower'?'is-negative':'is-positive'} onClick={()=>pairMoments(highlight.beforeMs,highlight.afterMs,highlight.title)} title={`${highlight.beforeTone} → ${highlight.afterTone}`}><Icon name={highlight.direction==='lower'?'activity':'check'} size={13}/>{highlight.direction==='lower'?'Less positive':'More positive'} at {highlight.title}<time>{clock(highlight.beforeMs)} ↔ {clock(highlight.afterMs)}</time></button>)}</div></div></details><div className="impact-review-tools" ref={setReviewPortalTarget}/></div></>,detailsTarget)}
 </>;
}
