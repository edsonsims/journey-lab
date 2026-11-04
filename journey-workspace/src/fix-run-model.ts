import {Row,list} from './lib';

/** Files Muse Code writes beside the change so reviewers can read its plan. */
export const REVIEW_NOTES=new Set(['FIX_PLAN.json','IMPROVEMENT.md']);

export type DiffLine={kind:'add'|'del'|'ctx'|'hunk'|'meta';text:string;oldNo?:number;newNo?:number;mark?:[number,number]};
export type DiffStatus='added'|'modified'|'deleted'|'renamed';
export type DiffFile={path:string;status:DiffStatus;additions:number;deletions:number;lines:DiffLine[];note:boolean;binary:boolean;partial:boolean};
export type ParsedPatch={files:DiffFile[];truncated:boolean;additions:number;deletions:number};

/**
 * Patches are produced with `git diff --no-index baseline candidate`, so headers carry
 * the absolute round directories. Reviewers only need the path inside the product.
 */
export function reviewPath(raw:string,known:string[]=[]):string{
 let path=String(raw||'').trim().replace(/\t.*$/,'').replace(/^"(.*)"$/,'$1');
 if(!path||path==='/dev/null')return '';
 path=path.replace(/^[ab]\//,'');
 const match=[...known].sort((a,b)=>b.length-a.length).find(k=>path===k||path.endsWith('/'+k));
 if(match)return match;
 const inside=path.match(/^.*\/(?:candidate|baseline)\/(.+)$/);
 if(inside)return inside[1];
 return path.startsWith('/')?path.split('/').pop()||path:path;
}

export function parsePatch(diff:string,known:string[]=[]):ParsedPatch{
 const text=String(diff||'');
 const files:DiffFile[]=[];
 const truncated=!!text.trim()&&!text.trimStart().startsWith('diff --git ');
 let current:(DiffFile&{header:boolean})|null=null,oldNo=0,newNo=0;
 const start=(partial=false)=>{current={path:'',status:'modified',additions:0,deletions:0,lines:[],note:false,binary:false,partial,header:!partial};files.push(current);return current;};
 for(const line of text.split('\n')){
  if(line.startsWith('diff --git ')){const file=start();const m=line.match(/ (b\/.+)$/);if(m)file.path=reviewPath(m[1],known);continue;}
  const file=current||start(true);
  if(file.header){
   if(line.startsWith('new file mode')){file.status='added';continue;}
   if(line.startsWith('deleted file mode')){file.status='deleted';continue;}
   if(line.startsWith('rename from ')||line.startsWith('rename to ')){file.status='renamed';if(line.startsWith('rename to '))file.path=reviewPath(line.slice(10),known);continue;}
   if(line.startsWith('Binary files')){file.binary=true;continue;}
   if(line.startsWith('--- ')){const p=reviewPath(line.slice(4),known);if(p&&!file.path)file.path=p;continue;}
   if(line.startsWith('+++ ')){const p=reviewPath(line.slice(4),known);if(p)file.path=p;continue;}
  }
  const hunk=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/);
  if(hunk){file.header=false;oldNo=Number(hunk[1]);newNo=Number(hunk[2]);file.lines.push({kind:'hunk',text:hunk[3]||'',newNo});continue;}
  if(file.header)continue;
  if(line.startsWith('\\')){file.lines.push({kind:'meta',text:line.replace(/^\\\s*/,'')});continue;}
  if(line.startsWith('+')){file.additions++;file.lines.push({kind:'add',text:line.slice(1),newNo:file.partial?undefined:newNo++});continue;}
  if(line.startsWith('-')){file.deletions++;file.lines.push({kind:'del',text:line.slice(1),oldNo:file.partial?undefined:oldNo++});continue;}
  if(line.startsWith(' ')){file.lines.push({kind:'ctx',text:line.slice(1),oldNo:file.partial?undefined:oldNo++,newNo:file.partial?undefined:newNo++});continue;}
 }
 for(const file of files){file.note=REVIEW_NOTES.has(file.path);delete (file as any).header;markChanges(file.lines);}
 const kept=files.filter(f=>f.path||f.lines.length);
 return {files:kept,truncated,additions:kept.reduce((n,f)=>n+f.additions,0),deletions:kept.reduce((n,f)=>n+f.deletions,0)};
}

/** Highlights the changed span when a removed line is replaced one-for-one by an added line. */
function markChanges(lines:DiffLine[]){
 for(let i=0;i<lines.length;){
  if(lines[i].kind!=='del'){i++;continue;}
  let d=i;while(d<lines.length&&lines[d].kind==='del')d++;
  let a=d;while(a<lines.length&&lines[a].kind==='add')a++;
  if(a-d===d-i)for(let k=0;k<d-i;k++){
   const x=lines[i+k],y=lines[d+k];let pre=0;const max=Math.min(x.text.length,y.text.length);
   while(pre<max&&x.text[pre]===y.text[pre])pre++;
   let suf=0;while(suf<max-pre&&x.text[x.text.length-1-suf]===y.text[y.text.length-1-suf])suf++;
   if(pre+suf>0&&(pre+suf)/Math.max(x.text.length,y.text.length)>.3){x.mark=[pre,x.text.length-suf];y.mark=[pre,y.text.length-suf];}
  }
  i=Math.max(a,i+1);
 }
}

/** Splits Muse Code's IMPROVEMENT.md into a short lead and the remaining sections. */
export function splitSummary(markdown:string){
 const text=String(markdown||'').trim();
 const titleMatch=text.match(/^#\s+(.+)$/m);
 const body=titleMatch?text.replace(titleMatch[0],'').trim():text;
 const parts=body.split(/^(?=##\s+)/m).map(s=>s.trim()).filter(Boolean);
 const heading=(s:string)=>s.match(/^##\s+(.+)$/m)?.[1]?.trim()||'';
 const strip=(s:string)=>s.replace(/^##\s+.+$/m,'').trim();
 if(parts.length<=1)return {title:titleMatch?.[1]?.trim()||'',lead:strip(parts[0]||''),leadHeading:heading(parts[0]||''),rest:'',restHeadings:[] as string[]};
 return {title:titleMatch?.[1]?.trim()||'',lead:strip(parts[0]),leadHeading:heading(parts[0]),rest:parts.slice(1).join('\n\n'),restHeadings:parts.slice(1).map(heading).filter(Boolean)};
}

export type StepState='done'|'failed'|'running'|'skipped'|'pending';
export type RunStep={id:string;kind:string;title:string;state:StepState;at?:string|null;durationMs?:number|null;detail?:string;items?:{label:string;value:string;state?:StepState}[]};

const ms=(a?:string|null,b?:string|null)=>{if(!a||!b)return null;const d=new Date(b).valueOf()-new Date(a).valueOf();return Number.isFinite(d)&&d>=0?d:null;};
const BUSY=['queued','preparing','running','verifying','retesting','generating'];
const outcomeOf=(run:any)=>run?.finding?.outcome||run?.outcome||'';
const words=(v:any)=>String(v||'').replaceAll('_',' ').replace(/^\w/,c=>c.toUpperCase());

export function verificationOf(round:Row|null|undefined):Row{const v=round?.verification;return typeof v==='string'?{status:v}:v&&typeof v==='object'?v:{};}

/** Reconstructs a round as the sequence of work Journey Lab actually ran. */
export function buildRunSteps(fix:Row,round:Row,patch:ParsedPatch):RunStep[]{
 const steps:RunStep[]=[];
 const status=String(round?.status||'');
 const verification=verificationOf(round);
 const busy=BUSY.includes(status);
 const failedRound=['failed','interrupted','cancelled'].includes(status);
 const revision=Number(round?.number||1)>1||!!String(round?.requestMessage||'').trim();
 const products=patch.files.filter(f=>!f.note);
 const changed=list(round?.changedFiles).map((f:any)=>typeof f==='string'?f:f?.path||f?.name).filter(Boolean);
 const productCount=patch.truncated?changed.filter(f=>!REVIEW_NOTES.has(f)).length:products.length||changed.filter(f=>!REVIEW_NOTES.has(f)).length;

 steps.push(revision?{id:'trigger',kind:'trigger',title:'Direction received',state:'done',at:round?.createdAt,detail:String(round?.requestMessage||'Review feedback').trim()+(round?.designProposal?' · Visual proposal attached':'')}
  :{id:'trigger',kind:'trigger',title:'Finding received',state:'done',at:fix?.createdAt||round?.createdAt,detail:'Started from the recorded journey and its finding.'});

 const proc=round?.process;
 const museFailed=!!proc&&(proc.timedOut||(typeof proc.code==='number'&&proc.code!==0));
 const museDone=!museFailed&&(!!round?.diff||!!round?.candidateHash||(!!proc&&proc.code===0));
 const museRunning=status==='running'&&!museDone;
 const memory=round?.evaluatorMemory,budget=round?.contextBudget;
 const contextReady=!!(memory||budget||round?.startedAt)||museDone||museFailed;
 const contextBits=[memory&&`${list(memory.screens).length} recorded screens`,memory&&`${list(memory.entries).length} knowledge references`,budget&&`${Math.round(Number(budget.characters||0)/1000)}k of ${Math.round(Number(budget.maxCharacters||0)/1000)}k characters`,list(budget?.omissions).length?`${list(budget.omissions).length} omitted`:''].filter(Boolean) as string[];
 steps.push({id:'context',kind:'context',title:'Context gathered',state:contextReady?'done':failedRound?'skipped':busy?'running':'pending',at:memory?.selectedAt||round?.startedAt,detail:contextBits.join(' · ')||(contextReady?'Finding, screenshots and source prepared.':'Waiting to start.')});

 steps.push({id:'muse',kind:'muse',title:'Muse Code wrote the change',state:museFailed?'failed':museDone?'done':museRunning?'running':failedRound?'skipped':'pending',at:round?.startedAt,durationMs:museDone||museFailed?ms(round?.startedAt,verification.at):null,
  detail:museFailed?(proc.timedOut?'Stopped at the time limit.':`Exited with code ${proc.code}.`):museDone?`${productCount} product ${productCount===1?'file':'files'}${patch.truncated?'':` · +${products.reduce((n,f)=>n+f.additions,0)} −${products.reduce((n,f)=>n+f.deletions,0)}`}${proc?` · exit ${proc.code}`:''}`:museRunning?'Editing an isolated copy of the source…':'Waiting for context.'});

 const builds=[verification.baselineBuild,verification.build].filter(Boolean) as Row[];
 if(builds.length){
  const failed=builds.some(b=>b.status==='failed'),passed=builds.every(b=>b.status==='passed'),configured=builds.some(b=>b.status&&b.status!=='not_configured');
  steps.push({id:'build',kind:'build',title:'Build',state:failed?'failed':passed?'done':configured?(status==='verifying'?'running':'done'):'skipped',at:verification.at,detail:failed?(builds.find(b=>b.status==='failed')?.message||'The build failed.'):configured?'Baseline and candidate built.':'Skipped · no build command configured.'});
 }

 const checks=list(verification.checks);
 const vstatus=String(verification.status||'');
 const checkState:StepState=vstatus==='failed'||checks.some(c=>c.status==='failed')?'failed':vstatus==='passed'?'done':vstatus==='not_configured'?'skipped':status==='verifying'?'running':['pending',''].includes(vstatus)?(failedRound?'skipped':'pending'):'done';
 const passedCount=checks.filter(c=>c.status==='passed').length;
 steps.push({id:'checks',kind:'checks',title:checks.length===1&&checks[0].name==='test'?'Test command':'Code checks',state:checkState,at:verification.at,
  detail:checks.length?`${passedCount} of ${checks.length} passed`:verification.message||(checkState==='skipped'?'Skipped · no test command configured.':checkState==='running'?'Running configured checks…':'Waiting for the candidate.'),
  items:checks.map(c=>({label:String(c.name||c.label||'Check'),value:[words(c.status),typeof c.exitCode==='number'?`exit ${c.exitCode}`:'',c.timedOut?'timed out':'',c.message||''].filter(Boolean).join(' · '),state:c.status==='passed'?'done':c.status==='failed'?'failed':'skipped' as StepState}))});

 const comparisons=list(round?.comparisons).length?list(round.comparisons):round?.comparison?[round.comparison]:[];
 comparisons.forEach((c,i)=>{
  const st=String(c.status||'');
  const state:StepState=st==='completed'?'done':['running','queued','running_before','running_after'].includes(st)?'running':['failed'].includes(st)?'failed':'skipped';
  const pairs=list(c.pairs);
  const reached=pairs.filter(p=>outcomeOf(p.after)==='goal_reached').length;
  steps.push({id:`retest-${c.id||i}`,kind:'retest',title:comparisons.length>1?`Retest ${i+1} with AI personas`:'Retest with AI personas',state,at:c.createdAt,durationMs:ms(c.createdAt,c.completedAt),
   detail:state==='running'?`Recording fresh sessions for ${pairs.length||'each'} ${pairs.length===1?'persona':'personas'}…`:state==='done'?`${reached} of ${pairs.length} reached the goal`:words(st)||'Not run',
   items:pairs.map(p=>{const before=outcomeOf(p.before),after=outcomeOf(p.after);return {label:String(p.personaName||p.persona?.name||p.personaId||'Persona'),value:after?`${words(before)||'—'} → ${words(after)}`:state==='running'?'Recording…':'No recording',state:after==='goal_reached'?'done':after?'failed':'pending' as StepState};})});
 });
 if(!comparisons.length&&checkState!=='failed')steps.push({id:'retest',kind:'retest',title:'Retest with AI personas',state:status==='retesting'?'running':failedRound?'skipped':'pending',detail:status==='retesting'?'Recording fresh sessions…':'Not retested yet.'});

 const approved=round?.approval||(fix?.approval?.roundId===round?.id);
 const final:RunStep=approved?{id:'final',kind:'final',title:'Approved',state:'done',at:(round?.approval||fix?.approval)?.at,detail:'Saved locally. No PR has been created.'}
  :failedRound?{id:'final',kind:'final',title:status==='cancelled'?'Cancelled':status==='interrupted'?'Interrupted':'Run failed',state:'failed',at:round?.finishedAt,detail:String(round?.error||fix?.error||'Work stopped before review.').slice(0,240)}
  :status==='awaiting_review'?{id:'final',kind:'final',title:'Ready for your review',state:'done',at:round?.finishedAt,detail:checkState==='failed'?'Checks failed. Review before deciding.':'Compare before and after, then approve or request changes.'}
  :{id:'final',kind:'final',title:'Ready for your review',state:'pending'};
 steps.push(final);
 return steps;
}

export function runState(steps:RunStep[],status:string):StepState{
 if(steps.some(s=>s.state==='running')||BUSY.includes(status))return 'running';
 if(steps.some(s=>s.state==='failed'))return 'failed';
 return steps.at(-1)?.state==='done'?'done':'pending';
}

export function shortDuration(value?:number|null){
 if(value==null||!Number.isFinite(value))return '';
 const s=Math.round(value/1000);
 if(s<60)return `${Math.max(s,0)}s`;
 const m=Math.floor(s/60);
 if(m<60)return `${m}m ${String(s%60).padStart(2,'0')}s`;
 return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;
}
export function clockTime(value?:string|null){if(!value)return '';const d=new Date(value);return Number.isNaN(d.valueOf())?'':d.toLocaleTimeString('en',{hour:'numeric',minute:'2-digit',second:'2-digit'});}
