import {useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {api,clock} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';
import {buildJourneyMatches,applyJourneyReview} from './journey-matching';
import {MatchedJourneyComparison} from './MatchedJourneyComparison';
import type {MatchedEmotionItem} from './MatchedJourneyComparison';
import {DragStepAlignment} from './DragStepAlignment';
import type {DragStepPair} from './DragStepAlignment';
import {replaceJourneyPair} from './journey-review-edits';

type Decision={beforeId:string;afterId:string;status:'accepted'|'rejected';source:'suggested'|'manual';note?:string};
type SavedReview={revision:number;decisions:Decision[];updatedAt:string|null;historyCount:number};
type Step=ReturnType<typeof buildJourneyMatches>['beforeSteps'][number];
type Match=ReturnType<typeof applyJourneyReview>['matches'][number];
type DragDraft={value:DragStepPair;previous:(DragStepPair&{source:'suggested'|'manual'})|null;restore:{beforeMs:number;afterMs:number;title:string}};

/** One mounted review belongs to one immutable round/run pair. No polling overwrites edits. */
export function JourneyMatchReview({fixId,roundId,before,after,beforeMs,afterMs,anchorBeforeMs,anchorAfterMs,onPair,onReset,onPreview,recordingChart,sessionOnly=false,compact=false,defaultMode,comparisonLabels,comparisonHeading,onReviewChange,externalReview=false,reviewPortalTarget,reviewOnly=false}:{reviewOnly?:boolean;externalReview?:boolean;reviewPortalTarget?:HTMLElement|null;onReviewChange?:(decisions:Decision[])=>void;comparisonLabels?:{before:string;after:string};comparisonHeading?:string;fixId:string;roundId:string;before:Row|null;after:Row|null;beforeMs:number;afterMs:number;anchorBeforeMs:number;anchorAfterMs:number;onReset:()=>void;onPreview:()=>void;onPair:(beforeMs:number,afterMs:number,title?:string)=>void;recordingChart:ReactNode;sessionOnly?:boolean;compact?:boolean;defaultMode?:'steps'|'time'}){
 const [mode,setMode]=useState<string|null>(null),[open,setOpen]=useState(false),[showRejected,setShowRejected]=useState(false);
 const [saved,setSaved]=useState<SavedReview|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [editing,setEditing]=useState<string|null>(null),[editAfter,setEditAfter]=useState('');
 const [manualBefore,setManualBefore]=useState(''),[manualAfter,setManualAfter]=useState('');
 const [dragDraft,setDragDraft]=useState<DragDraft|null>(null);
 const dragPanel=useRef<HTMLDivElement>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const panel=useRef<HTMLDivElement>(null),initialized=useRef(false),inflight=useRef(false),pairCallback=useRef(onPair);
 pairCallback.current=onPair;
 const suggestions=useMemo(()=>buildJourneyMatches(before,after),[before,after]);
 const reviewed=useMemo(()=>applyJourneyReview(suggestions,saved?.decisions||[]),[suggestions,saved]);
 const byBefore=useMemo(()=>new Map(suggestions.beforeSteps.map(step=>[step.id,step])),[suggestions]);
 const byAfter=useMemo(()=>new Map(suggestions.afterSteps.map(step=>[step.id,step])),[suggestions]);
 const items:MatchedEmotionItem[]=useMemo(()=>reviewed.activeMatches.flatMap(match=>{
  const a=byBefore.get(match.beforeId),b=byAfter.get(match.afterId);
  return a&&b?[{id:match.id,title:a.title,before:a.point,after:b.point,reviewed:match.status==='accepted',reason:match.reasons.join(' · ')}]:[];
 }),[reviewed,byBefore,byAfter]);
 useEffect(()=>{if(saved)onReviewChange?.(saved.decisions);},[saved,onReviewChange]);
 const selectedId=items.find(item=>item.before.ms===anchorBeforeMs&&item.after.ms===anchorAfterMs)?.id||null;
 const anchoredMatch=reviewed.matches.find(match=>byBefore.get(match.beforeId)?.ms===anchorBeforeMs&&byAfter.get(match.afterId)?.ms===anchorAfterMs);
 const pending=reviewed.matches.filter(match=>match.status==='suggested'||match.status==='review').length;
 const rejected=reviewed.matches.filter(match=>match.status==='rejected').length;
 const activeMode=mode||defaultMode||(items.length>=2?'steps':'time');
 const ready=(sessionOnly||!!roundId)&&!!before?.id&&!!after?.id;
 const path=`/fixes/${fixId}/alignment`;
 const dragDecisions=useMemo(()=>dragDraft?replaceJourneyPair(saved?.decisions||[],dragDraft.value,dragDraft.previous):[],[saved,dragDraft]);
 const dragConflict=dragDraft?applyJourneyReview(suggestions,dragDecisions).conflicts[0]?.reason:null;
 useEffect(()=>{
  if(!ready){setLoading(false);return;}
  if(sessionOnly){setSaved({revision:0,decisions:[],updatedAt:null,historyCount:0});setLoading(false);setError('');return;}
  let active=true;setLoading(true);setError('');
  const query=new URLSearchParams({roundId,beforeRunId:before!.id,afterRunId:after!.id});
  api(`${path}?${query}`).then(data=>{if(active)setSaved(data);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[path,roundId,before?.id,after?.id,reload,ready,sessionOnly]);
 useEffect(()=>{
  if(reviewOnly||loading||!saved||initialized.current||items.length<2||activeMode!=='steps')return;
  initialized.current=true;
  const first=items[0];
  if(first&&first.before.ms!==null&&first.after.ms!==null){pairCallback.current(first.before.ms,first.after.ms,first.title);}
 },[loading,saved,items,activeMode,reviewOnly]);
 function select(item:MatchedEmotionItem){
  if(inflight.current||item.before.ms===null||item.after.ms===null)return;
  setDragDraft(null);setError('');
  pairCallback.current(item.before.ms,item.after.ms,item.title);
 }
 function review(){if(inflight.current)return;if(dragDraft)cancelDrag();setOpen(true);requestAnimationFrame(()=>{panel.current?.scrollIntoView({behavior:'smooth',block:'nearest'});panel.current?.focus({preventScroll:true});});}
 function startDrag(item?:MatchedEmotionItem){
  if(loading||inflight.current||!saved)return;
  const chosen=item?{beforeId:item.before.id,afterId:item.after.id}:anchoredMatch||reviewed.activeMatches[0];
  const firstBefore=suggestions.beforeSteps.find(step=>step.ms!==null&&suggestions.beforeDurationMs!==null&&step.ms<=suggestions.beforeDurationMs);
  const firstAfter=suggestions.afterSteps.find(step=>step.ms!==null&&suggestions.afterDurationMs!==null&&step.ms<=suggestions.afterDurationMs);
  const value=chosen?{beforeId:chosen.beforeId,afterId:chosen.afterId}:firstBefore&&firstAfter?{beforeId:firstBefore.id,afterId:firstAfter.id}:null;
  if(!value)return;
  const previous=reviewed.matches.find(match=>match.beforeId===value.beforeId&&match.afterId===value.afterId&&match.status!=='rejected');
  setDragDraft({value,previous:previous?{beforeId:previous.beforeId,afterId:previous.afterId,source:previous.source}:null,restore:{beforeMs:anchorBeforeMs,afterMs:anchorAfterMs,title:byBefore.get(anchoredMatch?.beforeId||'')?.title||'Previous alignment'}});
  setOpen(false);setError('');setMode('steps');
  const a=byBefore.get(value.beforeId),b=byAfter.get(value.afterId);
  if(a?.ms!=null&&b?.ms!=null)pairCallback.current(a.ms,b.ms,`${a.title} · Preview`);
  requestAnimationFrame(()=>{dragPanel.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});dragPanel.current?.focus({preventScroll:true});});
 }
 function previewDrag(value:DragStepPair){
  setDragDraft(current=>current?{...current,value}:null);setError('');
  const a=byBefore.get(value.beforeId),b=byAfter.get(value.afterId);
  if(a?.ms!=null&&b?.ms!=null)pairCallback.current(a.ms,b.ms,`${a.title} · Preview`);
 }
 function cancelDrag(){
  if(!dragDraft||inflight.current)return;
  const restore=dragDraft.restore;setDragDraft(null);setError('');
  if(restore.beforeMs===0&&restore.afterMs===0)onReset();else pairCallback.current(restore.beforeMs,restore.afterMs,restore.title);
 }
 async function saveDrag(){
  if(!dragDraft)return;
  const value=dragDraft.value;
  if(await save(dragDecisions)){
   setDragDraft(null);
   const a=byBefore.get(value.beforeId),b=byAfter.get(value.afterId);
   if(a?.ms!=null&&b?.ms!=null)pairCallback.current(a.ms,b.ms,a.title);
  }
 }
 async function save(decisions:Decision[]){
  if(!saved||loading||inflight.current)return false;
  const conflicts=applyJourneyReview(suggestions,decisions).conflicts;
  if(conflicts.length){setError(conflicts.map(item=>item.reason).join(' '));return false;}
  inflight.current=true;setSaving(true);setError('');
  try{
   const next=sessionOnly?{revision:saved.revision+1,decisions:structuredClone(decisions),updatedAt:new Date().toISOString(),historyCount:saved.historyCount+1}:await api(path,'PUT',{roundId,beforeRunId:before!.id,afterRunId:after!.id,baseRevision:saved.revision,decisions});
   if(!mounted.current)return false;
   const active=applyJourneyReview(suggestions,next.decisions).activeMatches;
   setSaved(next);
   // A rejected pair must stop anchoring the videos as soon as it leaves the arc.
   if(anchoredMatch&&!active.some(match=>match.id===anchoredMatch.id)){
    const first=active[0],a=first&&byBefore.get(first.beforeId),b=first&&byAfter.get(first.afterId);
    if(a?.ms!=null&&b?.ms!=null)pairCallback.current(a.ms,b.ms,a.title);else onReset();
   }
   return true;
  }
  catch(err){if(mounted.current)setError((err as Error).message);return false;}
  finally{inflight.current=false;if(mounted.current)setSaving(false);}
 }
 async function decide(match:Match,status:'accepted'|'rejected'){
  const decisions=(saved?.decisions||[]).filter(item=>item.beforeId!==match.beforeId||item.afterId!==match.afterId);
  await save([...decisions,{beforeId:match.beforeId,afterId:match.afterId,status,source:match.source}]);
 }
 async function restore(match:Match){await save((saved?.decisions||[]).filter(item=>item.beforeId!==match.beforeId||item.afterId!==match.afterId));}
 async function adjust(match:Match){
  if(!editAfter)return;
  const decisions=replaceJourneyPair(saved?.decisions||[],{beforeId:match.beforeId,afterId:editAfter},match);
  if(await save(decisions)){setEditing(null);const a=byBefore.get(match.beforeId),b=byAfter.get(editAfter);if(a?.ms!=null&&b?.ms!=null)pairCallback.current(a.ms,b.ms,a.title);}
 }
 async function addManual(){
  if(!manualBefore||!manualAfter)return;
  const decisions=(saved?.decisions||[]).filter(item=>item.beforeId!==manualBefore||item.afterId!==manualAfter);
  if(await save([...decisions,{beforeId:manualBefore,afterId:manualAfter,status:'accepted',source:'manual'}])){setManualBefore('');setManualAfter('');}
 }
 const disabled=loading||saving||!saved;
 const options=(steps:Step[])=>steps.map(step=><option key={step.id} value={step.id} disabled={step.ms===null}>{clock(step.ms)} · {step.title} · {step.screen||'Unknown screen'}</option>);
 const describe=(step:Step|undefined,side:string)=>step&&<div className="match-step"><span className="match-step-side">{side} <time>{clock(step.ms)}</time></span><strong>{step.title}</strong><span className="match-step-screen" title={step.screen}>{step.screen||'Screen not recorded'}</span></div>;
 const dragEditor=dragDraft&&<div className="drag-match-editor" ref={dragPanel} tabIndex={-1} aria-label="Drag alignment editor">
   <DragStepAlignment beforeRun={before} afterRun={after} beforeSteps={suggestions.beforeSteps} afterSteps={suggestions.afterSteps} beforeDurationMs={suggestions.beforeDurationMs} afterDurationMs={suggestions.afterDurationMs} value={dragDraft.value} onChange={previewDrag} disabled={disabled}/>
   {(error||dragConflict)&&<div className="match-review-error" role="alert"><span>{error||dragConflict}</span>{error&&<button type="button" disabled={saving||loading} onClick={()=>setReload(value=>value+1)}>Reload review</button>}</div>}
   <div className="drag-match-editor-actions"><span>Preview only until saved.</span><button type="button" className="button" disabled={saving} onClick={cancelDrag}>Cancel</button><button type="button" className="button primary" disabled={disabled||!!dragConflict} onClick={()=>void saveDrag()}>{saving?'Saving…':'Save match'}</button></div>
  </div>;
 const reviewError=error&&!open&&!dragDraft&&<div className="match-review-error" role="alert"><span>{error}</span><button type="button" disabled={saving||loading} onClick={()=>setReload(value=>value+1)}>Reload review</button></div>;
 const reviewPanel=open&&<div ref={panel} className="match-review-panel" tabIndex={-1} aria-label="Step match review">
   <header><div><h3>Match the move.</h3><p>Screen + completed action + visit order. Feelings never decide a match.{sessionOnly?' Review applies to this session; reload resets it.':''}</p></div><button type="button" className="text-button" onClick={()=>setOpen(false)}>Done</button></header>
   <div className="match-review-summary"><span>{items.length} aligned · {pending} to review</span>{rejected>0&&<label><input type="checkbox" checked={showRejected} onChange={event=>setShowRejected(event.target.checked)}/>Show rejected ({rejected})</label>}<span role="status">{loading?'Loading…':saving?'Saving…':saved?.revision?`${sessionOnly?'This session':'Saved'} · v${saved.revision}`:ready?'No decisions yet':'Waiting for both journeys'}</span></div>
   {error&&<div className="match-review-error" role="alert"><span>{error}</span><button type="button" disabled={saving||loading} onClick={()=>setReload(value=>value+1)}>Reload review</button></div>}
   <div className="match-review-rows">{reviewed.matches.filter(match=>showRejected||match.status!=='rejected').map(match=>{
    const a=byBefore.get(match.beforeId),b=byAfter.get(match.afterId);
    const label=match.status==='accepted'?(match.source==='manual'?'Adjusted':'Accepted'):match.status==='review'?'Needs review':match.status==='rejected'?'Rejected':'Suggested';
    return <article className={`match-review-row match-${match.status}`} key={match.id} data-review-match={match.id}>
     <div className="match-review-pair">{describe(a,'Before')}<span className="match-pair-arrow" aria-hidden="true">→</span>{describe(b,'After')}</div>
     <div className="match-review-evidence"><span className={`match-review-state is-${match.status}`}>{label}</span><span>{match.reasons.join(' · ')}</span></div>
     <div className="match-review-actions"><button type="button" disabled={a?.ms==null||b?.ms==null} onClick={()=>{if(a?.ms!=null&&b?.ms!=null){pairCallback.current(a.ms,b.ms,a.title);onPreview();}}}><Icon name="play" size={12}/>Preview</button>{match.status==='rejected'?<button type="button" disabled={disabled} onClick={()=>void restore(match)}>Restore suggestion</button>:<>{match.status!=='accepted'&&<button type="button" className="match-accept" disabled={disabled||a?.ms==null||b?.ms==null} onClick={()=>void decide(match,'accepted')}><Icon name="check" size={12}/>Accept</button>}<button type="button" disabled={disabled} onClick={()=>{setEditing(match.id);setEditAfter(match.afterId);}}>Adjust</button><button type="button" disabled={disabled||a?.ms==null||b?.ms==null} onClick={()=>{if(a&&b)startDrag({id:match.id,title:a.title,before:a.point,after:b.point,reviewed:match.status==='accepted',reason:match.reasons.join(' · ')});}}>Drag</button><button type="button" disabled={disabled} onClick={()=>void decide(match,'rejected')}>Reject</button></>}</div>
     {editing===match.id&&<div className="match-adjust"><label>Match this before step with<select aria-label="Adjusted after step" value={editAfter} onChange={event=>setEditAfter(event.target.value)}>{options(suggestions.afterSteps)}</select></label><div><button type="button" disabled={!editAfter||a?.ms==null||byAfter.get(editAfter)?.ms==null} onClick={()=>{const b=byAfter.get(editAfter);if(a?.ms!=null&&b?.ms!=null){pairCallback.current(a.ms,b.ms,a.title);onPreview();}}}>Preview pair</button><button type="button" disabled={disabled||!editAfter} onClick={()=>void adjust(match)}>Save match</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div></div>}
    </article>;
   })}</div>
   {!reviewed.matches.length&&<p className="match-no-candidates">No safe suggestions. Pair an observed step below.</p>}
   <details className="match-manual"><summary>Add a match <span>{reviewed.unmatchedBefore.length} before · {reviewed.unmatchedAfter.length} after unmatched</span></summary><div className="match-manual-form"><label>Before<select aria-label="Manual before step" value={manualBefore} onChange={event=>setManualBefore(event.target.value)}><option value="">Choose a step…</option>{options(suggestions.beforeSteps)}</select></label><label>After<select aria-label="Manual after step" value={manualAfter} onChange={event=>setManualAfter(event.target.value)}><option value="">Choose a step…</option>{options(suggestions.afterSteps)}</select></label><button type="button" disabled={disabled||!manualBefore||!manualAfter} onClick={()=>void addManual()}>Add match</button></div><small>One match per step, in journey order. {reviewOnly?'Unmatched steps remain in the emotional arc.':'Unmatched steps stay in Recording time.'}</small></details>
  </div>;
 const reviewStatus=loading?'Loading review…':saving?'Saving…':saved?.revision?`${sessionOnly?'Session review':'Review saved'} · v${saved.revision}`:'';
 const externalControls=<div className="match-external-controls"><button type="button" className="text-button" disabled={saving} aria-expanded={open} onClick={review} title={`${items.length} aligned · ${pending} to review · ${reviewed.unmatchedBefore.length+reviewed.unmatchedAfter.length} unmatched`}><Icon name="calibration" size={13}/>Review matches{pending>0?` (${pending})`:''}</button><button type="button" className="text-button" disabled={disabled||!!dragDraft||!suggestions.beforeSteps.length||!suggestions.afterSteps.length} onClick={()=>startDrag()}><Icon name="edit" size={13}/>Drag to align</button>{reviewStatus&&<span role="status">{reviewStatus}</span>}</div>;
 return <div className="journey-match-workspace">
  {!reviewOnly&&<div className="match-view-bar"><div className="segmented" aria-label="Comparison axis"><button type="button" disabled={saving} aria-pressed={activeMode==='steps'} className={activeMode==='steps'?'selected':''} onClick={()=>setMode('steps')}>Matched steps</button><button type="button" disabled={saving} aria-pressed={activeMode==='time'} className={activeMode==='time'?'selected':''} onClick={()=>{if(inflight.current)return;if(dragDraft)cancelDrag();setMode('time');}}>Recording time</button></div>{!externalReview&&(!compact||loading||saving||!!saved?.revision)&&<span>{loading?'Loading review…':saving?'Saving…':saved?.revision?`${sessionOnly?'Session review':'Review saved'} · v${saved.revision}`:'Suggested from recorded actions'}</span>}{!externalReview&&compact&&activeMode==='time'&&<button type="button" className="text-button" onClick={review} title="All recorded signals; recording clocks may show different actions.">Review matches{pending>0?` (${pending})`:''}<Icon name="calibration" size={12}/></button>}</div>}
  {reviewOnly&&!externalReview&&externalControls}
  {!externalReview&&dragEditor}
  {!reviewOnly&&<div className="match-chart-surface" inert={saving} aria-busy={saving}>{activeMode==='steps'?<MatchedJourneyComparison externalReview={externalReview} labels={comparisonLabels} heading={comparisonHeading} items={items} selectedId={selectedId} onSelect={select} onReview={review} onAdjust={startDrag} adjustmentDisabled={disabled||!!dragDraft||!suggestions.beforeSteps.length||!suggestions.afterSteps.length} beforeMs={beforeMs} afterMs={afterMs} unmatchedBefore={reviewed.unmatchedBefore.length} unmatchedAfter={reviewed.unmatchedAfter.length} pendingCount={pending}/>:recordingChart}</div>}

  {!externalReview&&reviewError}
  {!externalReview&&reviewPanel}
  {externalReview&&reviewPortalTarget&&createPortal(<>{externalControls}{dragEditor}{reviewError}{reviewPanel}</>,reviewPortalTarget)}
 </div>;
}
