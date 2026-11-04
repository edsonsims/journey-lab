import type {Row} from './lib.ts';
import type {ImpactStage,ImpactTone} from './change-impact.ts';

type SourceEvent={label:'Proposed'|'Merged';at:string|null};
export type ImpactOrigin={
 kind:'local_change'|'pull_request';state:'proposed'|'merged';label:string;stateLabel:string;tone:ImpactTone;
 href:string|null;repository:string|null;baseRef:string|null;headRef:string|null;baseSha:string|null;headSha:string|null;mergeSha:string|null;
 sourceEvent:SourceEvent;assessedAt:string|null;searchText:string;
};
const text=(value:unknown,max=240):string|null=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
function timestamp(value:unknown):string|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 const parsed=Date.parse(value),[year,month,day]=value.slice(0,10).split('-').map(Number);
 return Number.isFinite(parsed)&&month>=1&&month<=12&&day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate()?new Date(parsed).toISOString():null;
}
function repository(value:unknown,provider:unknown):string|null{
 const candidate=text(value),parts=candidate?.split('/');
 return parts&&parts.length>=2&&(provider!=='github'||parts.length===2)&&parts.every(part=>!!part&&!['.','..'].includes(part)&&/^[-\w.]+$/.test(part))?candidate:null;
}
function pullRequestUrl(origin:Row,repo:string|null,number:number|null):string|null{
 if(!repo||!number||!['github','gitlab'].includes(origin.provider)||!text(origin.url,1200))return null;
 try{
  const url=new URL(origin.url),path=origin.provider==='github'?`/${repo}/pull/${number}`:`/${repo}/-/merge_requests/${number}`;
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname.replace(/\/$/,'')===path?url.href:null;
 }catch{return null;}
}
const sha=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{7,64}$/i.test(value)?value:null;

/** Source event dates are not assessment dates; a merge never implies deployment. */
export function impactOrigin(record:Row|null|undefined):ImpactOrigin{
 const origin=record?.origin&&typeof record.origin==='object'&&!Array.isArray(record.origin)?record.origin:{};
 const isPr=origin.kind==='pull_request',merged=isPr&&origin.state==='merged';
 const kind=isPr?'pull_request':'local_change',state=merged?'merged':'proposed';
 const number=Number.isSafeInteger(origin.number)&&origin.number>0?origin.number:null;
 const repo=isPr?repository(origin.repository,origin.provider):null;
 const label=isPr?(number?`PR #${number}`:'Pull request'):'Local proposal';
 const stateLabel=isPr?(merged?'Merged PR':'Proposed PR'):'Local proposal';
 const sourceEvent:SourceEvent={label:merged?'Merged':'Proposed',at:timestamp(merged?origin.mergedAt:origin.createdAt)};
 const baseRef=text(origin.baseRef),headRef=text(origin.headRef);
 return {kind,state,label,stateLabel,tone:merged?'positive':isPr?'pending':'neutral',href:isPr?pullRequestUrl(origin,repo,number):null,repository:repo,baseRef,headRef,baseSha:sha(origin.baseSha),headSha:sha(origin.headSha),mergeSha:merged?sha(origin.mergeSha):null,sourceEvent,assessedAt:timestamp(record?.createdAt),searchText:[label,stateLabel,repo,baseRef,headRef,sourceEvent.at].filter(Boolean).join(' ')};
}

export function formatImpactDate(value:unknown):string{
 const at=timestamp(value);
 return at?new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(at)):'Not recorded';
}

export function comparisonLabels(record:Row|null|undefined,stage:ImpactStage):{before:string;after:string}{
 const proposal=text(record?.proposal?.label)|| (impactOrigin(record).state==='merged'?'Merged change':'Proposed change');
 return stage==='repair'?{before:proposal,after:'Fixed candidate'}:{before:text(record?.baseline?.label)||'Before change',after:proposal};
}
