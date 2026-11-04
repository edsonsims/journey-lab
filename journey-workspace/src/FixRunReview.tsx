import {useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import {Row,list,fullDate} from './lib';
import {Icon} from './icons';
import {ReviewMarkdown} from './ReviewMarkdown';
import {REVIEW_NOTES,buildRunSteps,clockTime,parsePatch,runState,shortDuration,splitSummary,verificationOf} from './fix-run-model';
import type {DiffFile,RunStep,StepState} from './fix-run-model';
import './fix-run-review.css';

const STATE_TEXT:Record<StepState,string>={done:'Passed',failed:'Failed',running:'Running',skipped:'Skipped',pending:'Waiting'};
const FILE_STATUS:Record<string,string>={added:'Added',modified:'Modified',deleted:'Deleted',renamed:'Renamed'};
const PREVIEW_LINES=400;

function StateIcon({state,size=12}:{state:StepState;size?:number}){
 if(state==='running')return <span className="run-spinner" aria-hidden="true"/>;
 if(state==='done')return <Icon name="check" size={size}/>;
 if(state==='failed')return <Icon name="close" size={size}/>;
 if(state==='skipped')return <span className="run-dash" aria-hidden="true"/>;
 return <span className="run-hollow" aria-hidden="true"/>;
}

/** The "Code & checks" tab: one fix round shown as a run, its summary and its file changes. */
export function FixRunReview({fix,round,rounds,onSelectRound,knowledge}:{fix:Row;round:Row|null;rounds:Row[];onSelectRound:(id:string)=>void;knowledge?:ReactNode}){
 const known=useMemo(()=>list(round?.changedFiles).map((f:any)=>typeof f==='string'?f:f?.path||f?.name).filter(Boolean),[round?.changedFiles]);
 const patch=useMemo(()=>parsePatch(round?.diff||'',known),[round?.diff,known]);
 const steps=useMemo(()=>round?buildRunSteps(fix,round,patch):[],[fix,round,patch]);
 const state=runState(steps,String(round?.status||''));
 if(!round)return <div className="fix-run-review"><p className="run-empty">This fix has no round yet.</p></div>;
 const started=round.createdAt,ended=round.finishedAt;
 const products=patch.files.filter(f=>!f.note),notes=patch.files.filter(f=>f.note);
 const added=products.reduce((n,f)=>n+f.additions,0),removed=products.reduce((n,f)=>n+f.deletions,0);
 const shownPaths=new Set(patch.files.map(f=>f.path));
 const unseen=patch.truncated?known.filter(f=>!shownPaths.has(f)):[];
 const productTotal=patch.truncated?known.filter(f=>!REVIEW_NOTES.has(f)).length:products.length;
 const noteTotal=patch.truncated?known.filter(f=>REVIEW_NOTES.has(f)).length:notes.length;
 return <div className="fix-run-review">
  <section className={`run-card run-${state}`} aria-label={`Round ${round.number||1} run`}>
   <header className="run-header">
    <span className={`run-status-icon state-${state}`}><StateIcon state={state} size={15}/></span>
    <div className="run-title">
     <h2>Round {round.number||1} <span>· {state==='done'?'Ready for review':STATE_TEXT[state]}</span></h2>
     <p>Started {fullDate(started)}{ended?` · last update ${clockTime(ended)}`:''} · Muse Code <code>{round.model||'muse-spark-1.3'}</code></p>
    </div>
    {rounds.length>1&&<nav className="run-rounds" aria-label="Fix rounds">{rounds.map((r,i)=>{const v=verificationOf(r).status;const s:StepState=['failed','interrupted','cancelled'].includes(r.status)||v==='failed'?'failed':['queued','running','verifying','retesting'].includes(r.status)?'running':'done';return <button key={r.id} type="button" aria-current={r.id===round.id?'true':undefined} className={r.id===round.id?'active':''} onClick={()=>onSelectRound(r.id)} title={fullDate(r.createdAt)}><span className={`state-${s}`}><StateIcon state={s} size={9}/></span>Round {r.number||i+1}</button>;})}</nav>}
   </header>
   <ol className="run-steps">{steps.map(step=><StepRow key={step.id} step={step} last={step.kind==='retest'&&!steps.slice(steps.indexOf(step)+1).some(s=>s.kind==='retest')} knowledge={step.kind==='context'?knowledge:undefined} contract={step.kind==='muse'?round.contract:undefined}/>)}</ol>
   <RawRecord round={round}/>
  </section>

  <SummaryCard summary={round.summary} round={round}/>

  <section className="run-files" aria-label="Files changed">
   <header className="run-section-heading">
    <div><span className="eyebrow">FILES CHANGED</span><p>{productTotal} product {productTotal===1?'file':'files'}{noteTotal?` · ${noteTotal} Muse Code ${noteTotal===1?'note':'notes'}`:''}{patch.truncated?'':<> · <b className="plus">+{added}</b> <b className="minus">−{removed}</b> in product code</>}</p></div>
    {round.diff&&<button type="button" className="run-ghost-button" onClick={()=>downloadPatch(round)}><Icon name="code" size={13}/>Download .patch</button>}
   </header>
   {patch.truncated&&<p className="run-notice"><Icon name="info" size={13}/>This patch was longer than the stored preview, so only its last part is shown. The full patch is kept with the round.</p>}
   {!patch.files.length&&<p className="run-empty">{round.diff?'No reviewable file changes.':'The patch will appear when Muse Code finishes.'}</p>}
   {products.map((file,i)=><FileDiff key={`${file.path}-${i}`} file={file} open={products.length<=3&&file.lines.length<=PREVIEW_LINES*2}/>)}
   {unseen.length>0&&<div className="run-unseen">{unseen.map(path=><div key={path} className="run-file"><div className="run-file-head"><span className={`run-file-status status-modified`}>Changed</span><span className="run-file-path">{path}</span><span className="run-file-note">In the full patch</span></div></div>)}</div>}
   {notes.length>0&&<div className="run-notes"><p><Icon name="edit" size={13}/>Plan and notes Muse Code wrote with this change</p>{notes.map((file,i)=><FileDiff key={`${file.path}-${i}`} file={file} open={false}/>)}</div>}
  </section>

  <dl className="run-identity"><div><dt>Candidate</dt><dd title={round.candidateHash||''}>{round.candidateHash?String(round.candidateHash).slice(0,12):'Not recorded'}</dd></div><div><dt>Round ID</dt><dd>{round.id||'—'}</dd></div></dl>
 </div>;
}

function StepRow({step,knowledge,contract,last}:{step:RunStep;knowledge?:ReactNode;contract?:Row;last?:boolean}){
 const expandable=!!(step.items?.length||knowledge||contract);
 const [open,setOpen]=useState(!!last&&step.state==='done'||step.state==='failed');
 const time=clockTime(step.at),dur=shortDuration(step.durationMs);
 return <li className={`run-step state-${step.state}`}>
  <span className="run-step-icon"><StateIcon state={step.state}/></span>
  <div className="run-step-body">
   <div className="run-step-line">
    {expandable?<button type="button" className="run-step-toggle" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><strong>{step.title}</strong><Icon name="down" size={12}/></button>:<strong>{step.title}</strong>}
    <span className="run-step-detail" title={step.detail}>{step.detail}</span>
    <span className="run-step-meta">{dur&&<span className="run-duration">{dur}</span>}{time&&<time dateTime={step.at||undefined}>{time}</time>}{!time&&!dur&&<span className="run-state-word">{STATE_TEXT[step.state]}</span>}</span>
   </div>
   {open&&expandable&&<div className="run-step-more">
    {step.items?.map((item,i)=><div key={i} className={`run-item state-${item.state||'done'}`}><StateIcon state={item.state||'done'} size={10}/><span>{item.label}</span><code>{item.value}</code></div>)}
    {contract&&<Contract contract={contract}/>}
    {knowledge}
   </div>}
  </div>
 </li>;
}

function Contract({contract}:{contract:Row}){
 const criteria=list(contract.criteria);
 return <div className="run-contract">
  {contract.problem&&<p><b>Problem</b>{contract.problem}</p>}
  {contract.expected&&<p><b>Expected</b>{contract.expected}</p>}
  {criteria.length>0&&<div><b>Acceptance criteria</b><ol>{criteria.map((c,i)=><li key={c.id||i}>{c.description}</li>)}</ol></div>}
  {list(contract.limitations).length>0&&<div><b>Limitations noted by Muse Code</b><ul>{list(contract.limitations).map((l,i)=><li key={i}>{String(l)}</li>)}</ul></div>}
 </div>;
}

function RawRecord({round}:{round:Row}){
 return <details className="run-raw"><summary>Raw run record</summary><pre>{JSON.stringify({verification:round.verification??null,process:round.process??null,contextBudget:round.contextBudget??null},null,2)}</pre></details>;
}

function SummaryCard({summary,round}:{summary?:string;round:Row}){
 const [full,setFull]=useState(false);
 const parts=useMemo(()=>splitSummary(summary||''),[summary]);
 if(!summary)return <section className="run-summary"><header><span className="eyebrow">WHAT CHANGED</span></header><p className="run-empty">A summary will appear when the candidate is ready.</p></section>;
 return <section className="run-summary" aria-label="Change summary">
  <header><span className="eyebrow">WHAT CHANGED</span><span>Muse Code · Round {round.number||1}</span></header>
  {parts.title&&<h3>{parts.title}</h3>}
  <ReviewMarkdown>{parts.lead}</ReviewMarkdown>
  {parts.rest&&(full?<div className="run-summary-rest"><ReviewMarkdown>{parts.rest}</ReviewMarkdown></div>:null)}
  {parts.rest&&<button type="button" className="run-link-button" aria-expanded={full} onClick={()=>setFull(v=>!v)}>{full?'Show less':`Show full summary · ${parts.restHeadings.join(', ')||'details'}`}<Icon name="down" size={12}/></button>}
 </section>;
}

function FileDiff({file,open:initial}:{file:DiffFile;open:boolean}){
 const [open,setOpen]=useState(initial),[all,setAll]=useState(false);
 const slash=file.path.lastIndexOf('/');
 const dir=slash>=0?file.path.slice(0,slash+1):'',name=slash>=0?file.path.slice(slash+1):file.path||'End of a longer file change';
 const body=file.lines.filter(l=>!(file.status==='added'&&l.kind==='hunk'));
 const shown=all?body:body.slice(0,PREVIEW_LINES);
 const total=file.additions+file.deletions,blocks=5;
 const green=total?Math.round(blocks*file.additions/total):0;
 return <article className={`run-file ${open?'open':''}`}>
  <button type="button" className="run-file-head" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <Icon name="down" size={12}/>
   <span className={`run-file-status status-${file.status}`}>{file.partial?'Partial':FILE_STATUS[file.status]}</span>
   <span className="run-file-path" title={file.path}><span>{dir}</span>{name}</span>
   <span className="run-file-counts"><b className="plus">+{file.additions}</b><b className="minus">−{file.deletions}</b><span className="run-file-bar" aria-hidden="true">{Array.from({length:blocks},(_,i)=><i key={i} className={i<green?'add':i<(total?blocks:0)?'del':''}/>)}</span></span>
  </button>
  {open&&<div className="run-diff-scroll">{file.binary?<p className="run-empty">Binary file changed.</p>:<table className="run-diff"><tbody>{shown.map((line,i)=>line.kind==='hunk'?<tr key={i} className="hunk"><td colSpan={3}>{line.newNo?`Line ${line.newNo}`:''}{line.text?<span> · {line.text}</span>:null}</td></tr>:line.kind==='meta'?<tr key={i} className="meta"><td/><td/><td>{line.text}</td></tr>:<tr key={i} className={line.kind}><td className="ln">{line.oldNo??''}</td><td className="ln">{line.newNo??''}</td><td className="code"><span className="sign">{line.kind==='add'?'+':line.kind==='del'?'−':' '}</span>{line.mark?<>{line.text.slice(0,line.mark[0])}<mark>{line.text.slice(line.mark[0],line.mark[1])}</mark>{line.text.slice(line.mark[1])}</>:line.text||' '}</td></tr>)}</tbody></table>}
   {body.length>PREVIEW_LINES&&!all&&<button type="button" className="run-link-button run-more" onClick={()=>setAll(true)}>Show all {body.length} lines</button>}
  </div>}
 </article>;
}

function downloadPatch(round:Row){
 const blob=new Blob([cleanPatch(String(round.diff||''))],{type:'text/x-diff'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`fix-round-${round.number||1}.patch`;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Rewrites the round's absolute baseline/candidate directories to ordinary a/ b/ paths. */
export function cleanPatch(diff:string){return diff.replace(/(^|\s)([ab])\/\S*?\/(?:baseline|candidate)\//gm,'$1$2/');}
