import {useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Modal,Field,Button} from './App';
import {api} from './lib';
import type {Row} from './lib';

type Props={record:Row;projectId:string;onClose:()=>void;onSaved:()=>void};
type SourceChoice='local'|'proposed'|'merged';
const value=(input:unknown)=>typeof input==='string'?input:'';
function localDate(input:unknown){
 const date=new Date(value(input));
 if(Number.isNaN(date.valueOf()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function prIdentity(input:string){
 let url:URL;try{url=new URL(input.trim());}catch{throw new Error('Enter the full HTTPS pull request URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTPS pull request URL without credentials, query parameters or a fragment.');
 const path=url.pathname.replace(/\/$/,''),github=path.match(/^\/([-\w.]+\/[-\w.]+)\/pull\/([1-9]\d*)$/),gitlab=path.match(/^\/((?:[-\w.]+\/)+[-\w.]+)\/-\/merge_requests\/([1-9]\d*)$/);
 const match=github||gitlab,number=match?Number(match[2]):NaN;
 if(!match||!Number.isSafeInteger(number)||match[1].split('/').some(part=>['.','..'].includes(part)))throw new Error('Use a GitHub pull request or GitLab merge request URL.');
 url.pathname=path;
 return {provider:github?'github':'gitlab',repository:match[1],number,url:url.href};
}

export function ImpactSourceEditor({record,projectId,onClose,onSaved}:Props){
 const original=record.origin||{},linked=original.kind==='pull_request',merged=linked&&original.state==='merged';
 const [source,setSource]=useState<SourceChoice>(linked?(merged?'merged':'proposed'):'local');
 const [url,setUrl]=useState(value(original.url)),[createdAt,setCreatedAt]=useState(localDate(original.createdAt)),[mergedAt,setMergedAt]=useState(localDate(original.mergedAt));
 const [baseRef,setBaseRef]=useState(value(original.baseRef)),[headRef,setHeadRef]=useState(value(original.headRef));
 const [summary,setSummary]=useState(value(record.changeSummary)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const busyRef=useRef(false);
 const eventKey=source==='merged'?'mergedAt':'createdAt',eventValue=source==='merged'?mergedAt:createdAt,captured=Boolean(original[eventKey])&&(linked||source==='local');
 const close=()=>{if(!busyRef.current)onClose();};
 function chooseSource(next:SourceChoice){
  if(!linked&&(source==='local')!==(next==='local'))setCreatedAt(next==='local'?localDate(original.createdAt):'');
  setSource(next);setError('');
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
  try{
   // Partial updates keep pinned commits, other source dates, and change details intact.
   const origin:Row={kind:source==='local'?'local_change':'pull_request',state:source==='merged'?'merged':'proposed'};
   if(source!=='local'&&!linked)Object.assign(origin,prIdentity(url),{createdAt:null});
   if(!captured&&eventValue){const date=new Date(eventValue);if(Number.isNaN(date.valueOf()))throw new Error('Enter a valid source date.');origin[eventKey]=date.toISOString();}
   if(baseRef!==value(original.baseRef))origin.baseRef=baseRef.trim()||null;
   if(headRef!==value(original.headRef))origin.headRef=headRef.trim()||null;
   await api(`/change-impacts/${encodeURIComponent(record.id)}?projectId=${encodeURIComponent(projectId)}`,'PATCH',{expectedVersion:record.version,origin,changeSummary:summary.trim()||null});
   onSaved();
  }catch(reason){setError(reason instanceof Error?reason.message:'The change details could not be saved.');}
  finally{busyRef.current=false;setBusy(false);}
 }
 return <Modal title="Change details" onClose={close}>
  <form className="impact-source-form" onSubmit={submit}>
   <div className="form-body">
    <Field label="Source"><select value={source} disabled={busy||merged} onChange={event=>chooseSource(event.target.value as SourceChoice)}><option value="local" disabled={linked}>Local proposal</option><option value="proposed">Proposed PR</option><option value="merged">Merged PR</option></select></Field>
    {source!=='local'&&<Field label="Pull request URL"><input type="url" value={url} readOnly={linked} disabled={busy} onChange={event=>setUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" required maxLength={1200}/></Field>}
    <Field label={source==='merged'?'Date merged':'Date proposed'} hint={captured?'Recorded source date':`Optional · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}><input type="datetime-local" value={eventValue} readOnly={captured} disabled={busy} onChange={event=>source==='merged'?setMergedAt(event.target.value):setCreatedAt(event.target.value)}/></Field>
    <div className="form-grid"><Field label="Base branch"><input value={baseRef} disabled={busy} onChange={event=>setBaseRef(event.target.value)} placeholder="main" maxLength={240}/></Field><Field label="Change branch"><input value={headRef} disabled={busy} onChange={event=>setHeadRef(event.target.value)} placeholder="feature/booking" maxLength={240}/></Field></div>
    <Field label="What changed"><textarea value={summary} disabled={busy} onChange={event=>setSummary(event.target.value)} placeholder="Describe the actual product or code change." rows={4} maxLength={3000}/></Field>
    {error&&<div className="form-error" role="alert">{error}</div>}
   </div>
   <div className="modal-footer"><Button onClick={close} disabled={busy}>Cancel</Button><Button type="submit" kind="primary" icon="check" disabled={busy}>{busy?'Saving…':'Save details'}</Button></div>
  </form>
 </Modal>;
}
