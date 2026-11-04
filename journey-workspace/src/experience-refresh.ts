import type {Row} from './lib.ts';

/** Bootstrap updates can announce a completed journey before its feedback job finishes. */
export function experienceJourneyFingerprint(runs:unknown,projectId:string):string{
 return JSON.stringify((Array.isArray(runs)?runs:[])
  .filter((run:Row)=>run&&typeof run.id==='string'&&(!run.projectId||run.projectId===projectId))
  .map((run:Row)=>[run.id,typeof run.status==='string'?run.status:'',typeof run.completedAt==='string'?run.completedAt:''])
  .sort((a,b)=>a[0].localeCompare(b[0])));
}
