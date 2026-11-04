import {DeviceBadge} from './DeviceBadge';
import {ScreenshotSlideshow} from './ScreenshotSlideshow';
import {EmotionBadge} from './EvidenceMedia';
import {annotationForFrame,buildEvidenceAnnotations} from './evidence-annotations';
import {useMemo,useState} from 'react';
import {Row,clock,person,safeMedia} from './lib';
import {Icon} from './icons';
import {buildFindingPath,technicalEvidence,displayUrl,safeDisplay,safeRecord} from './finding-context';

type Jump = (ms:number)=>void;
const timed=(ms:unknown):ms is number=>typeof ms==='number'&&Number.isFinite(ms);
function routeLabel(value:string){try{const u=new URL(value);return u.pathname+u.search;}catch{return value;}}

function Moment({ms,onSeek,label='Jump to'}:{ms:unknown,onSeek:Jump,label?:string}){
 return timed(ms)?<button className="evidence-time" onClick={()=>onSeek(ms)} aria-label={`${label} ${clock(ms)} in the recording`} title="Original recording time"><Icon name="play" size={11}/><time>{clock(ms)}</time></button>:<span className="evidence-untimed" title="No video timestamp captured">Untimed</span>;
}

export function FindingSummary({finding:f}:{finding:Row}){
 return <div className="finding-story finding-summary">
  {f.claimStatus==='hypothesis'&&<div className="finding-hypothesis-note"><strong>Business hypothesis · Not measured</strong><p>{f.provenance==='review-hypothesis'?'Added during review from the recorded evidence.':'A possible business consequence inferred from this journey.'}{f.sourceFindingId&&<> <a href={`/projects/${f.projectId}/findings/${f.sourceFindingId}`}>View the supporting finding</a>.</>}</p></div>}
  <div className="finding-contrast">
   <section className="finding-observation"><h2><Icon name="eye" size={18}/>What happened</h2><p>{f.observation||'No observation recorded.'}</p></section>
   <section className="finding-expected"><h2><Icon name="check" size={18}/>Expected</h2><p>{typeof f.expected==='string'?f.expected:f.expected?.text||'Not established in this recording.'}</p>{(f.expectationSource||f.expected?.source)&&<details className="expectation-basis"><summary>Basis for this expectation</summary><p>{f.expectationSource||f.expected.source}</p></details>}</section>
  </div>
 </div>;
}

export function FindingStory({finding:f,run,onSeek}:{finding:Row,run?:Row,onSeek:Jump}){
 const comment=f.claimStatus!=='hypothesis'&&typeof f.personaComment==='string'?f.personaComment.trim():'';
 const personaName=run?person(run):f.personaName||'Persona';
 return <div className="finding-story">
  {comment?<figure className="finding-perspective" aria-label={`Comment from ${personaName}`}><blockquote>“{comment}”</blockquote><figcaption><span aria-hidden="true">—</span><strong>{personaName}</strong></figcaption></figure>:<section className="finding-perspective finding-interpretation"><h2>{f.claimStatus==='hypothesis'?'Business hypothesis':f.interpretation?'Finding interpretation':'Persona comment'}</h2><p>{f.interpretation||'No public comment captured for this finding.'}</p></section>}
  {f.claimStatus==='hypothesis'&&f.validationPlan&&<section className="finding-hypothesis-validation"><h2>How to test this hypothesis</h2><p>{f.validationPlan}</p></section>}
  {run&&<><NavigationPath key={`path-${f.id}`} run={run} finding={f} onSeek={onSeek}/><EvidenceWorkbench key={`evidence-${f.id}`} run={run} finding={f} onSeek={onSeek}/></>}
  {f.uncertainty&&<details className="finding-limits" open={f.claimStatus==='hypothesis'?true:undefined}><summary>What this finding doesn’t establish</summary><p>{f.uncertainty}</p></details>}
 </div>;
}

function NavigationPath({run,finding,onSeek}:{run:Row,finding:Row,onSeek:Jump}){
 const [throughEvidence,setThroughEvidence]=useState(false);
 const path=useMemo(()=>buildFindingPath(run,finding,{throughEvidence}),[run,finding,throughEvidence]);
 const extended=useMemo(()=>buildFindingPath(run,finding,{throughEvidence:true}),[run,finding]);
 const mission=run.persona?.mission||run.charterSnapshot?.mission;
 const actionCount=path.steps.filter(s=>s.kind!=='landing').length;
 return <section className="finding-path" aria-labelledby="finding-path-title">
  <div className="story-section-heading"><div><h2 id="finding-path-title">How they got here</h2><p>{actionCount} {actionCount===1?'action':'actions'} · {throughEvidence?'Through the last linked evidence':'Up to the finding'}</p></div>{extended.cutoffEventIndex!==path.anchor.eventIndex&&<label className="path-scope"><input type="checkbox" checked={throughEvidence} onChange={e=>setThroughEvidence(e.target.checked)}/>Include later evidence</label>}</div>
  {mission&&<details className="path-mission"><summary>Persona’s goal</summary><p>{safeDisplay(mission)}</p></details>}
  {path.limitation&&<p className="evidence-empty">{path.limitation}</p>}
  <ol className="navigation-path">{path.steps.map((step,i)=>{
   const hasDetails=step.toUrl||step.fromUrl||step.kind==='input'||step.reaction||step.observation||step.detail||safeMedia(step.screenshot);
   return <li key={step.id} className={step.attempted?'path-rejected':''} data-event-index={step.eventIndex}>
   <span className="path-order" aria-hidden="true">{step.kind==='landing'?<Icon name="environments" size={14}/>:i+(path.steps[0]?.kind==='landing'?0:1)}</span>
   <div className="path-step-body">{hasDetails?<details className="path-step-details"><summary><h3>{step.title}</h3></summary><div className="path-step-content">
    {(step.toUrl||step.fromUrl)&&<div className="path-route">{step.fromUrl&&step.toUrl!==step.fromUrl&&<><span title={step.fromUrl}>{routeLabel(step.fromUrl)}</span><Icon name="arrow" size={12}/></>}<span title={step.toUrl||step.fromUrl}>{routeLabel(step.toUrl||step.fromUrl)}</span></div>}
    {step.kind==='input'&&<div className="path-input"><span>Input sent{step.field?` · ${step.field}`:''}</span><code>{step.value===''?'(empty text)':step.value}</code></div>}
    {step.reaction&&<p className="path-reaction">“{step.reaction}”</p>}
    {(step.observation||step.detail||safeMedia(step.screenshot))&&<div className="path-context">{step.observation&&<p><strong>Before acting</strong>{step.observation}</p>}{step.detail&&<p>{step.detail}</p>}{safeMedia(step.screenshot)&&<a href={step.screenshot} target="_blank" rel="noreferrer">View captured screen <Icon name="external" size={12}/></a>}</div>}
   </div></details>:<div className="path-step-heading"><h3>{step.title}</h3></div>}<Moment ms={step.ms} onSeek={onSeek}/></div>
  </li>;})}</ol>
  {(path.anchor.eventIndex!=null||path.anchor.ms!=null)&&<div className="path-destination"><Icon name="findings" size={16}/><div><strong>{throughEvidence?'Original finding':'Finding observed here'}</strong>{path.anchor.url&&<span title={path.anchor.url}>{routeLabel(path.anchor.url)}</span>}</div><Moment ms={path.anchor.ms} onSeek={onSeek} label="View finding at"/></div>}
 </section>;
}

function RecordDetails({event,onSeek}:{event:Row,onSeek:Jump}){
 const [feedback,setFeedback]=useState('');
 return <div className="evidence-record"><div className="evidence-record-tools"><Moment ms={event.videoMs} onSeek={onSeek}/><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(safeDisplay(event));setFeedback('Copied');}catch{setFeedback('Select the record below to copy.');}}}>Copy record</button><span role="status">{feedback}</span></div><pre tabIndex={0}>{safeDisplay(event)}</pre></div>;
}

type EvidenceCategory='screenshots'|'logs'|'network'|'payloads'|'context';
export function EvidenceWorkbench({run,finding,onSeek}:{run:Row,finding:Row,onSeek:Jump}){
 const [scope,setScope]=useState<'moment'|'run'>('moment');
 const data=useMemo(()=>technicalEvidence(run,finding,scope),[run,finding,scope]);
 const [category,setCategory]=useState<EvidenceCategory>(()=>technicalEvidence(run,finding).network.length?'network':'screenshots');
 const [feedback,setFeedback]=useState('');
 const [slideshow,setSlideshow]=useState<{frames:Row[],index:number}|null>(null);
 const annotations=useMemo(()=>buildEvidenceAnnotations(run),[run]);
 const categories:{id:EvidenceCategory,label:string,count?:number}[]=[{id:'screenshots',label:'Screenshots',count:data.screenshots.length},{id:'logs',label:'Logs',count:data.logs.length},{id:'network',label:'Network',count:data.network.length},{id:'payloads',label:'Payloads',count:data.payloads.length},{id:'context',label:'Journey context'}];
 const context={runId:run.id,environment:run.environmentName,environmentVersion:run.environmentVersion,environmentVersionId:run.environmentVersionId,target:displayUrl(run.target),persona:person(run),personaVersion:run.personaVersion,charter:run.charterName,charterVersion:run.charterVersion,deviceSnapshot:run.deviceSnapshot,networkProfileSnapshot:run.networkProfileSnapshot,viewport:run.viewport,model:run.model,productFingerprint:run.productFingerprint,integrityStatus:run.integrityStatus,capturePolicy:run.capturePolicy};
 const exportEvidence=()=>{try{const blob=new Blob([JSON.stringify(safeRecord({findingId:finding.id,scope,window:data.window,context,screenshots:data.screenshots,logs:data.logs,network:data.network,payloads:data.payloads}),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`finding-${String(finding.id||'evidence').replace(/[^a-zA-Z0-9_-]/g,'_')}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setFeedback('Evidence exported');}catch{setFeedback('Export failed. Individual records can still be copied.');}};
 return <section className="finding-evidence" aria-labelledby="finding-evidence-title">
  <div className="story-section-heading"><div><h2 id="finding-evidence-title">Technical evidence</h2><p>{scope==='moment'?(timed(data.window.startMs)&&timed(data.window.endMs)?`${clock(data.window.startMs)}–${clock(data.window.endMs)} · original recording`:'Available events near the finding'):'All captured events in this journey'}</p></div><div className="segmented evidence-scope" aria-label="Evidence scope"><button aria-pressed={scope==='moment'} className={scope==='moment'?'selected':''} onClick={()=>setScope('moment')}>Near this moment</button><button aria-pressed={scope==='run'} className={scope==='run'?'selected':''} onClick={()=>setScope('run')}>Entire journey</button></div></div>
  <div className="evidence-workbench">
   {scope==='moment'&&data.limited&&<p className="evidence-empty">{data.window.startMs==null&&data.window.endMs==null?'This recording has no usable timing anchor. Only explicitly linked evidence is shown; choose Entire journey for other captured events.':'Some timing information was not captured. This is the available context around the recorded anchor.'}</p>}
   <div className="evidence-categories" role="group" aria-label="Evidence category">{categories.map(t=><button key={t.id} aria-pressed={t.id===category} onClick={()=>setCategory(t.id)}>{t.label}{t.count!=null&&<span>{t.count}</span>}</button>)}</div>
   <div className="evidence-panel" aria-label={`${categories.find(t=>t.id===category)?.label} evidence`}>
    {category==='screenshots'&&(data.screenshots.length?<div className="finding-frames">{data.screenshots.map((e:Row,index:number)=>{const annotation=annotationForFrame(annotations,e);return <figure key={e.index}><button type="button" className="finding-frame-image" aria-haspopup="dialog" aria-label={`Open screenshot ${index+1} of ${data.screenshots.length}`} onClick={()=>setSlideshow({frames:data.screenshots,index})}><img src={safeMedia(e.screenshot)} alt={`Captured screen, event ${e.index}: ${routeLabel(displayUrl(e.url))}`} loading="lazy"/>{e.linked&&<span>Linked evidence</span>}{annotation&&<EmotionBadge annotation={annotation} small/>}</button><figcaption><span>Frame {e.index}</span><Moment ms={e.videoMs} onSeek={onSeek}/></figcaption>{annotation?.caption&&<p className="finding-frame-reaction">{annotation.caption}</p>}<p title={displayUrl(e.url)}>{routeLabel(displayUrl(e.url))}</p></figure>;})}</div>:<p className="evidence-empty">No screenshots captured in this scope.</p>)}
    {category==='logs'&&(data.logs.length?<div className="evidence-log-list">{data.logs.map((e:Row,i:number)=><details className="diagnostic-record" key={e.index??i}><summary><span className={`diagnostic-kind ${/error|rejected|stop/.test(e.type)?'diagnostic-error':''}`}>{String(e.type).replaceAll('_',' ')}</span><div><strong>{safeDisplay(e.message||e.error||e.text||e.reason||'Recorded event',400)}</strong><small>{e.channel} · event {e.index??'—'}</small></div><time>{clock(e.videoMs)}</time><Icon name="down" size={12}/></summary><RecordDetails event={e} onSeek={onSeek}/></details>)}</div>:<p className="evidence-empty">No logs captured {scope==='moment'?'near this finding':'in this journey'}. This does not establish that the browser had no errors.</p>)}
    {category==='network'&&(data.network.length?<div className="network-records"><div className="network-head" aria-hidden="true"><span>Status</span><span>Method</span><span>Request</span><span>Type / time</span></div>{data.network.map((e:Row,i:number)=><details className="network-record" key={e.index??i}><summary><span className={`http-status ${Number(e.status)>=400||e.type==='network_error'?'http-error':''}`}>{e.status??(e.type==='network_error'?'Failed':'—')}</span><code>{e.method||'—'}</code><span className="network-url" title={displayUrl(e.url)}>{routeLabel(displayUrl(e.url))||'URL not captured'}{e.type==='network_error'&&<small>{safeDisplay(e.message||e.error||'Request failed',180)}</small>}</span><span className="network-meta">{e.resourceType||'Unknown type'}<time>{clock(e.videoMs)} <Icon name="down" size={11}/></time></span></summary><RecordDetails event={e} onSeek={onSeek}/></details>)}</div>:<p className="evidence-empty">No network events captured {scope==='moment'?'near this finding':'in this journey'}.</p>)}
    {category==='payloads'&&(data.payloads.length?<div className="payload-records">{data.payloads.map((e:Row,i:number)=><article key={e.index??i}><div className="payload-heading"><strong>{e.method||'Payload'} {routeLabel(displayUrl(e.url))}</strong><Moment ms={e.videoMs} onSeek={onSeek}/></div>{(['request','response','payload'] as const).filter(k=>e[`${k}Captured`]).map(k=><details key={k} open><summary>{k==='payload'?'Captured payload':`${k==='request'?'Request':'Response'} body`}</summary><pre tabIndex={0}>{safeDisplay(k==='payload'?e.payload:e[`${k}Body`])}</pre></details>)}</article>)}</div>:<p className="evidence-empty">{data.bodyCapture==='off'?'Payload capture was off for this journey.':data.bodyCapture==='unknown'?'Payload capture settings were not recorded for this older journey.':'No payloads were captured in this scope.'}</p>)}
    {category==='context'&&<div className="evidence-run-context"><dl><div><dt>Environment</dt><dd>{run.environmentName||'Not recorded'}{run.environmentVersion!=null&&` · v${run.environmentVersion}`}</dd></div><div><dt>Persona</dt><dd>{person(run)}{run.personaVersion!=null&&` · v${run.personaVersion}`}</dd></div><div><dt>Mission</dt><dd>{run.charterName||'Not recorded'}{run.charterVersion!=null&&` · v${run.charterVersion}`}</dd></div><div><dt>Device</dt><dd><DeviceBadge run={run}/></dd></div><div><dt>Payload capture</dt><dd>{data.bodyCapture==='unknown'?'Not recorded':data.bodyCapture==='on'?'Enabled':'Off'}</dd></div><div><dt>Target</dt><dd>{displayUrl(run.target)||'Not recorded'}</dd></div></dl><details><summary>Version identity and capture settings</summary><pre tabIndex={0}>{safeDisplay(context)}</pre></details></div>}
   </div>
   <div className="evidence-footer"><span>{scope==='moment'?'Nearby events are context, not proof of cause.':'Showing the complete captured record.'}{category==='screenshots'&&scope==='moment'?' Linked frames are included at their original times.':''}</span><button className="text-button" onClick={exportEvidence}>Export JSON <Icon name="external" size={12}/></button></div>
   {feedback&&<p className="evidence-export-status" role="status">{feedback}</p>}
  </div>
  {slideshow&&<ScreenshotSlideshow run={run} frames={slideshow.frames} initialIndex={slideshow.index} onClose={()=>setSlideshow(null)} onSeek={onSeek}/>}
 </section>;
}
