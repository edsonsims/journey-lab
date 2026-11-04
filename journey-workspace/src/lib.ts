export type Row = Record<string, any>;
export const API='/api/workspace';
export async function api(path:string,method='GET',body?:unknown){
 const response=await fetch(path.startsWith('/api/')?path:API+path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const result=await response.json().catch(()=>({error:`Service returned ${response.status}`}));
 if(!response.ok)throw new Error(result.error||result.message||`Request failed (${response.status})`);return result;
}
export function list(x:any):Row[]{return Array.isArray(x)?x:[];}
export function label(value:any){return String(value||'Unknown').replaceAll('_',' ').replace(/\bcharters?\b/gi,word=>word.toLowerCase()==='charters'?'missions':'mission').replace(/\b\w/g,(x:string)=>x.toUpperCase());}
export function num(n:any){return typeof n==='number'&&Number.isFinite(n)?Intl.NumberFormat('en',{notation:n>=100000?'compact':'standard',maximumFractionDigits:1}).format(n):'—';}
export function clock(ms:any){if(typeof ms!=='number'||!Number.isFinite(ms))return '—';const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function date(value:any){if(!value)return '—';const d=new Date(value);return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('en',{month:'short',day:'numeric'});}
export function fullDate(value:any){if(!value)return 'Unavailable';return new Date(value).toLocaleString('en',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
export function person(run:Row){return run.personaName||run.persona?.name||run.persona?.label||run.personaId||'Persona';}
export function initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
export function title(run:Row){return run.name||`${person(run)} · ${run.variant==='candidate'?'After':run.variant==='baseline'?'Before':'Exploration'}`;}
export const ongoing=(status:string)=>['queued','running','finalizing','generating','retesting','verifying','cancelling','running_before','running_after'].includes(status);
export function outcome(run:Row){return run.outcome||run.finding?.outcome||'';}
export function duration(run:Row){if(run.durationMs!=null)return run.durationMs;if(run.startedAt&&run.completedAt)return new Date(run.completedAt).valueOf()-new Date(run.startedAt).valueOf();return null;}
export function totals(run:Row){const known=run.totalTokens??(typeof run.tokens==='number'?run.tokens:run.tokens?.total);if(known!=null)return known;const usage=list(run.usage);return usage.length&&usage.every(x=>typeof x.total_tokens==='number')?usage.reduce((a,b)=>a+b.total_tokens,0):null;}
export function originalToReplay(run:Row,ms:number):number|null{for(const s of list(run.replayMetadata?.segments)){if(ms>=s.originalStart*1000&&ms<=s.originalEnd*1000)return (s.replayStart+(ms/1000-s.originalStart))*1000;}return null;}
export function replayToOriginal(run:Row,ms:number):number|null{for(const s of list(run.replayMetadata?.segments)){const end=s.replayStart+s.originalEnd-s.originalStart;if(ms>=s.replayStart*1000&&ms<=end*1000)return (s.originalStart+(ms/1000-s.replayStart))*1000;}return null;}
export function hasReplay(run:Row){return !!run.replay&&list(run.replayMetadata?.segments).length>0;}
export function sourceTime(run:Row,entry:Row):number|null{if(typeof entry.originalMs==='number')return entry.originalMs;if(typeof entry.videoMs==='number')return entry.videoMs;if(entry.eventIndex==null)return null;const note=list(run.experience).find(n=>n.eventIndex===entry.eventIndex||n.actionEventIndex===entry.eventIndex);return typeof note?.videoMs==='number'?note.videoMs:null;}
export function sourceVideo(run:Row,mode:string){return mode==='condensed'&&hasReplay(run)?run.replay:run.video;}
export function safeMedia(value:any){return typeof value==='string'&&/^\/(runs|api\/workspace\/artifacts)\/[a-zA-Z0-9/_.,-]+$/.test(value)?value:undefined;}
