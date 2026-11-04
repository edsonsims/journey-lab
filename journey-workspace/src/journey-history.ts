import type {Row} from './lib.ts';
export type JourneyHistory={projectId:string;runs:Row[];page:Row|null};
export const emptyJourneyHistory=(projectId=''):JourneyHistory=>({projectId,runs:[],page:null});
export function mergeJourneyMetadata(previous:Row[],fresh:Row[]):Row[]{
 const records=new Map(previous.map(run=>[run.id,run]));
 for(const run of fresh)records.set(run.id,run);
 return [...records.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(a.id).localeCompare(String(b.id)));
}
export function refreshJourneyHistory(previous:JourneyHistory,bootstrap:Row):JourneyHistory{
 const sameProject=previous.projectId===bootstrap.projectId;
 const runs=mergeJourneyMetadata(sameProject?previous.runs:[],bootstrap.runs||[]);
 // A refresh reads the newest page. Keep the cursor after the oldest page we
 // have loaded, including rows shifted off the newest page by incoming runs.
 const page=sameProject&&previous.page?{...previous.page,total:bootstrap.runsPage?.total??previous.page.total}:bootstrap.runsPage||null;
 return {projectId:bootstrap.projectId,runs,page};
}
export function appendJourneyHistory(previous:JourneyHistory,projectId:string,response:Row):JourneyHistory{
 if(previous.projectId!==projectId)return previous;
 return {...previous,runs:mergeJourneyMetadata(previous.runs,response.runs||[]),page:response.page||previous.page};
}
