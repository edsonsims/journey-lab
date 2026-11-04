import {DeviceBadge} from './DeviceBadge';
import {configuredEnvironment} from './environment-context';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './icons';
import {api,clock,fullDate,label,list,safeMedia} from './lib';
import type {Row} from './lib';
import {buildEmotionArc} from './emotion-arc';
import {ExperienceEmotionArc} from './ExperienceEmotionArc';
import {insightMomentHref} from './insights-data';
import {experienceScreenState} from './experience-screen-states';
import {AnnotationToggle,EvidenceMedia} from './EvidenceMedia';
import {annotationAt,annotationForMoment,buildEvidenceAnnotations} from './evidence-annotations';
import './experience-detail-panel.css';

type Side='before'|'after';
type Props={row:Row;environments:Row[];side:Side;labels:{before:string;after:string};projectId:string;base:string;comparison?:boolean;feedback?:Row;initialMomentId?:string;initialStateId?:string;onClose:()=>void;onSideChange:(side:Side)=>void;onRunChange:(side:Side,runId:string)=>void;navigate:(path:string)=>void};
const validTime=(time:unknown):time is number=>typeof time==='number'&&Number.isFinite(time)&&time>=0;
const momentId=(moment:Row,index=0)=>String(moment.id||`${moment.runId}:${moment.signalIndex??moment.eventIndex??index}:${moment.originalMs??'unknown'}`);
const tone=(moment:Row)=>({very_positive:'excellent',positive:'positive',neutral:'neutral',negative:'negative',very_negative:'very-negative'} as Record<string,string>)[moment.valence]||'unrated';
const toneLabel=(moment:Row)=>label(tone(moment).replaceAll('-',' '));
const finiteDate=(value:unknown)=>typeof value==='string'&&!Number.isNaN(Date.parse(value));

function DetailLink({to,navigate,children,className=''}:{to:string;navigate:(path:string)=>void;children:React.ReactNode;className?:string}){
 return <a className={className} href={to} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(to);}}>{children}</a>;
}

export function ExperienceDetailPanel({row,environments,side,labels,projectId,base,comparison=true,feedback,initialMomentId,initialStateId,onClose,onSideChange,onRunChange,navigate}:Props){
 const panel=useRef<HTMLElement>(null),closeButton=useRef<HTMLButtonElement>(null),video=useRef<HTMLVideoElement>(null),momentSection=useRef<HTMLElement>(null),videoSection=useRef<HTMLDivElement>(null),playIntent=useRef(false),closeCallback=useRef(onClose),headingId=useId();
 const [reveal,setReveal]=useState<{target:'moment'|'video';nonce:number;focus:boolean}|null>(null);
 function revealSection(target:'moment'|'video',focus=true){setReveal(previous=>({target,nonce:(previous?.nonce||0)+1,focus}));}
 useEffect(()=>{
  if(!reveal)return;
  const target=reveal.target==='video'?videoSection.current:momentSection.current;
  if(reveal.focus)target?.focus({preventScroll:true});
  target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 },[reveal]);
 closeCallback.current=onClose;
 const feedbackRunId=feedback?.runId||feedback?.source?.runId||feedback?.moment?.runId;
 const selectedSide:Row|null=row[side]||(!comparison&&feedback?{runId:feedbackRunId,run:{},context:feedback.context||{},moments:[]}:null),moments=list(selectedSide?.moments);
 const feedbackMatchesRun=!!feedback&&(!feedbackRunId||feedbackRunId===selectedSide?.runId);
 const [selectedId,setSelectedId]=useState(''),[feedbackMode,setFeedbackMode]=useState(!!feedback),[showVideo,setShowVideo]=useState(false),[mediaError,setMediaError]=useState(''),[imageFailed,setImageFailed]=useState(false);
 const [annotationsEnabled,setAnnotationsEnabled]=useState(true),[capturedRun,setCapturedRun]=useState<Row|null>(null),[videoMs,setVideoMs]=useState<number|null>(null);
 useEffect(()=>{
  let current=true;setCapturedRun(null);
  if(selectedSide?.runId)void api(`/runs/${encodeURIComponent(selectedSide.runId)}`).then(run=>{if(current)setCapturedRun(run);}).catch(()=>{});
  return()=>{current=false;};
 },[selectedSide?.runId]);
 const annotations=useMemo(()=>buildEvidenceAnnotations(capturedRun&&capturedRun.id===selectedSide?.runId?capturedRun:{...selectedSide?.run,experience:moments,personaName:row.name}),[capturedRun,selectedSide?.runId,selectedSide?.run,moments,row.name]);
 useEffect(()=>{
  const scoped=initialStateId&&initialStateId!=='all'?moments.filter(moment=>experienceScreenState(projectId,moment).id===initialStateId):moments;
  const chosen=feedbackMatchesRun?feedback?.moment:moments.find(moment=>momentId(moment)===initialMomentId)||scoped.find(moment=>['negative','very_negative'].includes(moment.valence))||scoped[0]||moments[0];
  setSelectedId(chosen?momentId(chosen):'');setFeedbackMode(feedbackMatchesRun);setShowVideo(false);setMediaError('');playIntent.current=false;
 },[row.id,side,selectedSide?.runId,initialMomentId,initialStateId,projectId,feedback?.id,feedbackMatchesRun]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,root=document.getElementById('root'),wasInert=root?.inert,overflow=document.body.style.overflow;
  if(root)root.inert=true;document.body.style.overflow='hidden';closeButton.current?.focus();
  const listener=(event:globalThis.KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeCallback.current();return;}
   if(event.key!=='Tab')return;
   const focusable=Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),details>summary,video[controls],[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0),first=focusable[0],last=focusable.at(-1);
   if(!focusable.length){event.preventDefault();panel.current?.focus();return;}
   if(event.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',listener,true);
  return()=>{document.removeEventListener('keydown',listener,true);document.body.style.overflow=overflow;if(root)root.inert=!!wasInert;if(previous?.isConnected)previous.focus();};
 },[]);
 const showingFeedback=feedbackMode&&feedbackMatchesRun;
 // A retrospective finding is not a reaction at an arbitrary point in the run.
 const selected:Row|undefined=showingFeedback?feedback?.moment||undefined:moments.find(moment=>momentId(moment)===selectedId);
 const standalone=showingFeedback&&!selected;
 const feedbackFindings=list(feedback?.findings),firstFinding=feedbackFindings[0];
 const findingSource=feedback?.source||firstFinding?.source||{};
 const findingRecord:Row={...findingSource,runId:feedbackRunId||selectedSide?.runId,eventIndex:feedback?.eventIndex??findingSource.eventIndex,originalMs:feedback?.originalMs??findingSource.originalMs,screenshot:feedback?.screenshot||findingSource.screenshot||firstFinding?.screenshot,video:feedback?.video||findingSource.video||firstFinding?.video,observation:feedback?.observation||firstFinding?.observation||'',reaction:feedback?.reaction||feedback?.personaComment||firstFinding?.personaComment||'',findingIds:feedbackFindings.map(finding=>finding.id).filter(Boolean)};
 const detail=standalone?findingRecord:selected;
 const selectedAnnotation=selected?annotationForMoment(annotations,selected):null;
 const state=showingFeedback&&feedback?.state?.id?feedback.state:detail?experienceScreenState(projectId,detail):null;
 const src=safeMedia(detail?.video)||safeMedia(selectedSide?.run?.video),frame=safeMedia(detail?.screenshot),time=detail?.originalMs;
 const arc=useMemo(()=>buildEmotionArc({...selectedSide?.run,experience:moments}),[selectedSide?.run,moments]);
 useEffect(()=>{setImageFailed(false);setMediaError('');setVideoMs(validTime(time)?time:null);if(video.current){video.current.pause();if(validTime(time)&&video.current.readyState>=1){try{video.current.currentTime=time/1000;}catch{setMediaError('This video position is unavailable.');}}}},[selectedId,showingFeedback,feedback?.id,side,selectedSide?.runId]);
 function choose(moment:Row){setFeedbackMode(false);setSelectedId(momentId(moment));playIntent.current=false;}
 function returnToFeedback(){setFeedbackMode(true);setSelectedId(feedback?.moment?momentId(feedback.moment):'');setShowVideo(false);playIntent.current=false;revealSection('moment');}
 function seekVideo(){
  const player=video.current;if(!player||!validTime(time))return false;
  if(Number.isFinite(player.duration)&&time/1000>player.duration+.1){setMediaError('This timestamp is outside the available recording.');return false;}
  try{player.currentTime=time/1000;return true;}catch{setMediaError('This video position is unavailable.');return false;}
 }
 function watch(){setMediaError('');playIntent.current=true;setShowVideo(true);revealSection('video');if(video.current?.readyState&&seekVideo()){playIntent.current=false;void video.current.play().catch(()=>setMediaError('Press play to start the recording.'));}}
 const mission=selectedSide?.mission||selectedSide?.run?.personaSnapshot?.mission||selectedSide?.run?.charterSnapshot?.mission;
 const goto=(path:string)=>navigate(path);
 const title=String(row.name||'Persona').split(' · ')[0],role=String(row.name||'').split(' · ').slice(1).join(' · ');
 const environment=configuredEnvironment({...selectedSide?.context,...selectedSide?.run},environments);
 const environmentName=environment?.name||feedback?.environmentName||'Not recorded';
 const journeyName=selectedSide?.run?.name||list(selectedSide?.journeys).find(journey=>journey.id===selectedSide?.runId)?.name||'Recorded journey';
 const findingIds=Array.isArray(detail?.findingIds)?detail.findingIds.filter((id:unknown)=>typeof id==='string'&&id):[];
 const links=showingFeedback&&feedbackFindings.length?feedbackFindings:findingIds.map((id:string)=>list(selectedSide?.findings).find(finding=>finding.id===id)||{id});
 const momentHref=detail&&insightMomentHref(projectId,detail);
 const journeyHref=momentHref||(selectedSide?.runId?`${base}/runs/${encodeURIComponent(selectedSide.runId)}?tab=journey`:null);
 const goalSection=mission&&<details className="epd-goal"><summary><Icon name="charters" size={13}/><strong>The goal</strong><Icon name="down" size={12}/></summary><p>{mission}</p></details>;
 const arcSection=<ExperienceEmotionArc arc={arc} selected={selected} onSelect={choose}/>;
 return createPortal(<div className="epd-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside ref={panel} className="epd-panel" role="dialog" aria-modal="true" aria-labelledby={headingId} data-experience-dialog tabIndex={-1}>
  <header className="epd-header"><div className="epd-persona"><span aria-hidden="true">{title.charAt(0)}</span><div><small>{state?.label||feedback?.pageName||'THE EXPERIENCE'}</small><h2 id={headingId}>{title}</h2>{role&&<p>{role}</p>}</div></div><button ref={closeButton} className="epd-close" type="button" onClick={onClose} aria-label="Close experience details"><Icon name="close" size={19}/></button></header>
  {selectedSide&&comparison&&<div className="epd-version-bar"><div className="epd-version-tabs" role="group" aria-label="Experience version">{(['before','after'] as const).map(value=><button type="button" className={side===value?'selected':''} aria-pressed={side===value} onClick={()=>onSideChange(value)} disabled={!row[value]} key={value}><span>{value==='before'?'BEFORE':'AFTER'}</span><strong>{labels[value]||'Not selected'}</strong></button>)}</div></div>}
  {!selectedSide?<div className="epd-empty"><Icon name="experience" size={27}/><h3>{comparison?'No journey for this version':'Journey unavailable'}</h3><p>{comparison?'Select the other version to inspect its recorded experience.':'The recorded journey could not be loaded.'}</p>{comparison&&<div className="epd-version-tabs" role="group" aria-label="Experience version">{(['before','after'] as const).map(value=><button type="button" className={side===value?'selected':''} aria-pressed={side===value} onClick={()=>onSideChange(value)} disabled={!row[value]} key={value}><span>{value==='before'?'BEFORE':'AFTER'}</span><strong>{labels[value]||'Not selected'}</strong></button>)}</div>}</div>:<div className="epd-content">
  <div className="epd-evidence">
   {detail?<section ref={momentSection} tabIndex={-1} className={`epd-selected-moment tone-${standalone?'unrated':tone(detail)}`} aria-label={standalone?'Finding evidence':'Selected recorded moment'}><header><div>{!standalone&&<span className={`epd-tone tone-${tone(detail)}`}><i/>{toneLabel(detail)}</span>}<strong>{state?.label}</strong></div><time>{validTime(time)?clock(time):'Time not recorded'}</time></header>
    {standalone&&<span className="epd-comment-label">{detail.reaction?'Persona’s retrospective comment':'No timed persona reaction attached'}</span>}
    {detail.reaction?(!annotationsEnabled||!selectedAnnotation||!frame||imageFailed||showVideo)&&<blockquote>{detail.reaction}</blockquote>:!standalone&&<p className="epd-reaction-missing">No persona reaction recorded for this moment.</p>}
    <div className="epd-annotation-controls"><AnnotationToggle enabled={annotationsEnabled} onChange={setAnnotationsEnabled}/></div>
    {showVideo&&src&&validTime(time)?<div ref={videoSection} tabIndex={-1} className="epd-video" role="region" aria-label="Selected moment recording"><EvidenceMedia annotation={annotationAt(annotations,videoMs)} enabled={annotationsEnabled}><video key={`${selectedSide.runId}:${src}`} ref={video} controls controlsList="nofullscreen" disablePictureInPicture playsInline preload="metadata" src={src} aria-label={`${comparison?labels[side]:environmentName} journey video`} onTimeUpdate={()=>setVideoMs((video.current?.currentTime||0)*1000)} onSeeking={()=>setVideoMs((video.current?.currentTime||0)*1000)} onLoadedMetadata={()=>{if(seekVideo()&&playIntent.current){playIntent.current=false;void video.current?.play().catch(()=>setMediaError('Press play to start the recording.'));}}} onError={()=>setMediaError('The recording could not be loaded. The retained feedback remains available.')}/></EvidenceMedia><div><span>Original recording · {clock(videoMs??time)}</span><button type="button" onClick={()=>{void (document.fullscreenElement?document.exitFullscreen():videoSection.current?.requestFullscreen())?.catch(()=>setMediaError('Fullscreen is unavailable in this browser.'));}} aria-label="Fullscreen recording with captions"><Icon name="expand" size={14}/></button><button type="button" onClick={()=>{video.current?.pause();playIntent.current=false;setShowVideo(false);setMediaError('');revealSection('moment');}}>Hide video</button></div></div>:frame&&!imageFailed?<div className="epd-annotated-frame"><EvidenceMedia annotation={selected?annotationForMoment(annotations,selected):null} enabled={annotationsEnabled}><img className="epd-frame" src={frame} alt={`Recorded ${state?.label||'screen'} frame for ${title}${validTime(time)?` at ${clock(time)}`:''}`} onError={()=>setImageFailed(true)}/></EvidenceMedia></div>:<div className="epd-frame-unavailable"><Icon name="film" size={23}/><span>{imageFailed?'Screenshot unavailable':`No screenshot recorded for this ${standalone?'finding':'moment'}`}</span></div>}
    <div className="epd-inline-arc">{arcSection}</div>
    <div className="epd-moment-actions">{src&&validTime(time)?<button className="epd-watch" type="button" onClick={watch}><Icon name="play" size={13}/>{showVideo?'Replay this moment':'Watch this moment'}</button>:<span className="epd-unavailable">{src?'Recording timestamp unavailable':'Video not recorded'}</span>}</div>
    {links.length>0&&<div className="epd-finding-links" aria-label="Linked findings">{links.filter((finding:Row,index:number,all:Row[])=>finding.id&&all.findIndex(item=>item.id===finding.id)===index).map((finding:Row,index:number)=><DetailLink key={finding.id} to={`${base}/findings/${encodeURIComponent(finding.id)}`} navigate={goto}><Icon name="findings" size={12}/>{feedback?finding.title||`Finding ${index+1}`:links.length===1?'Open finding':finding.title||`Finding ${index+1}`}<Icon name="arrow" size={12}/></DetailLink>)}</div>}
    {mediaError&&<p className="epd-media-error" role="status">{mediaError}</p>}
    {state&&<details className="epd-state-basis"><summary>{state.kind==='inferred'?'Screen identified from the observation':state.kind==='recorded'?'Recorded screen state':'Screen not identified'}</summary><p>{state.basis}</p><small>Journey {detail.runId?.slice(0,8)||'unknown'} · event {detail.eventIndex??'unknown'}</small></details>}
   </section>:<><div className="epd-empty small"><Icon name="experience" size={22}/><h3>{moments.length?'Choose a moment':'No recorded moments'}</h3><p>{moments.length?'Use the emotional arc to inspect the recorded details.':'There are no recorded reactions for this journey.'}</p></div><div className="epd-inline-arc">{arcSection}</div></>}
  </div>
  <aside className="epd-context" aria-label="Experience context">
   {feedbackMatchesRun&&<section className={`epd-feedback ${showingFeedback?'active':''}`} aria-label={showingFeedback?'Selected feedback':'Original feedback'} data-feedback-kind={feedback?.kind}><header><span>{!showingFeedback?'Original feedback':feedback?.takeaway?'Experience feedback':feedback?.kind==='finding'?'Finding':'Observation'}</span>{!showingFeedback&&<button type="button" onClick={returnToFeedback}>Back to feedback<Icon name="back" size={12}/></button>}</header><h3>{feedback?.title||feedback?.observation||'Recorded feedback'}</h3>{feedback?.takeaway?<>{feedback.why&&feedback.why!==feedback.title&&<p>{feedback.why}</p>}<HeadlineSources provenance={feedback.takeaway.provenance}/></>:feedback?.observation&&feedback.observation!==feedback.title&&<p>{feedback.observation}</p>}</section>}
  {!comparison&&<div className="epd-single-context"><span><Icon name="environments" size={13}/>Environment · {environmentName}</span><strong>{journeyName}</strong></div>}
   <div className="epd-run-meta"><span className={`epd-outcome ${selectedSide.outcome==='goal_reached'?'reached':''}`}>{selectedSide.outcomeLabel||'Outcome not recorded'}</span><span>{moments.length} recorded reactions</span><DeviceBadge run={{...selectedSide.run,...selectedSide.context}}/></div>
   {list(selectedSide.journeys).length>1&&<label className="epd-run-picker"><span>Journey</span><select aria-label="Detail journey" value={selectedSide.runId} onChange={event=>onRunChange(side,event.target.value)}>{list(selectedSide.journeys).map(run=><option value={run.id} key={run.id}>{run.name||run.id.slice(0,8)}{finiteDate(run.createdAt)?` · ${fullDate(run.createdAt)}`:''} · {run.id.slice(0,8)}</option>)}</select></label>}
   {detail&&<section className="epd-observation" aria-label="What happened"><header><h3>What happened</h3><time>{validTime(time)?clock(time):'Time not recorded'}</time></header><p>{detail.observation||'No screen observation was recorded for this moment.'}</p></section>}
   {mission&&<div className="epd-secondary-goal">{goalSection}</div>}
   <details className="epd-test-details"><summary><Icon name="code" size={13}/>Test details<Icon name="down" size={12}/></summary><dl>{[['Persona',`${row.name} · v${selectedSide.context?.personaVersion??'unknown'}`],['Environment',environmentName],['Environment ID',`${environment?.id||'Unknown'} · v${environment?.version??'unknown'}`],['Build',selectedSide.context?.build?.id||'Not recorded'],['Mission',`${selectedSide.context?.charterId||'Unknown'} · v${selectedSide.context?.charterVersion??'unknown'}`],['Journey',selectedSide.runId]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>{comparison&&row.comparison?.issues?.length>0&&<div className="epd-comparison-issues">{list(row.comparison.issues).map((issue:any,index)=><p key={index}>{typeof issue==='string'?issue:issue.message||issue.code||'Comparison details unavailable.'}</p>)}</div>}</details>
  </aside>
  </div>}
  {journeyHref&&<footer className="epd-navigation"><div><strong>{state?.label||'Recorded journey'}</strong><span>{momentHref?`${clock(time)} · original recording`:'No exact moment recorded'}</span></div><DetailLink to={journeyHref} navigate={goto} className="epd-open-moment">{momentHref?'Open moment in journey':'Open full journey'}<Icon name="arrow" size={15}/></DetailLink></footer>}
 </aside></div>,document.body);
}

function HeadlineSources({provenance}:{provenance:Row|undefined}){
 const citations=list(provenance?.citations);
 if(provenance?.kind!=='meta_recorded_evidence'||!citations.length)return null;
 const sourceLabel=(id:string)=>({
  'moment.observation':'Screen observation','moment.reaction':'Persona reaction',
  'persona.goal':'Persona goal','persona.constraints':'Persona constraints','persona.knowledge':'Persona knowledge',
  'charter.mission':'Journey mission','finding.title':'Finding','finding.observation':'Finding evidence','finding.personaComment':'Persona’s retrospective comment'
 }[id]||(/^prior\.signal\.\d+\.observation$/.test(id)?'Earlier screen observation':/^prior\.signal\.\d+\.reaction$/.test(id)?'Earlier persona reaction':/^action\.\d+\.result$/.test(id)?'Recorded action result':/^action\.\d+\.description$/.test(id)?'Recorded action':label(id.replaceAll('.',' '))));
 return <details className="epd-headline-sources"><summary>Headline sources <span>{citations.length}</span></summary><div>{citations.map((citation,index)=><figure key={`${citation.sourceId}:${index}`}><figcaption>{sourceLabel(citation.sourceId)}</figcaption><blockquote>{citation.exactQuote}</blockquote></figure>)}</div></details>;
}
