import { link, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP=/^emotion-(0|[1-9][0-9]{0,5})$/;
const REVISION=/^([1-9][0-9]*)\.json$/;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const usable=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const list=value=>Array.isArray(value)?value:[];

// Keep this clock consistent with emotion-arc.ts: a note may use only its own
// timestamp or its explicitly referenced event, never another persona note.
function recordedTime(run,entry){
  if(usable(entry.originalMs))return entry.originalMs;
  if(usable(entry.videoMs))return entry.videoMs;
  const index=entry.eventIndex??entry.actionEventIndex;
  const event=index==null?null:list(run.events).find(item=>item?.index===index);
  const time=typeof event?.originalMs==='number'?event.originalMs:event?.videoMs;
  return usable(time)?time:null;
}
function duration(run){
  return [run.originalDurationMs,run.videoDurationMs,
    typeof run.replayMetadata?.originalDuration==='number'?run.replayMetadata.originalDuration*1000:null].find(usable)??null;
}
function step(run,id,side){
  const match=typeof id==='string'&&id.match(STEP),index=match?Number(match[1]):-1;
  const entry=list(run.experience)[index];
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw fail(`Choose an observed ${side} step.`);
  return {index,ms:recordedTime(run,entry)};
}

function validateDecisions(input,before,after){
  if(!Array.isArray(input)||input.length>250)throw fail('Provide up to 250 alignment decisions.');
  const pairs=new Set(),beforeIds=new Set(),afterIds=new Set(),accepted=[];
  const decisions=input.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw fail('Each alignment decision must be an object.');
    if(!['accepted','rejected'].includes(item.status))throw fail('Set each match to accepted or rejected.');
    if(!['suggested','manual'].includes(item.source))throw fail('Set each match source to suggested or manual.');
    const a=step(before,item.beforeId,'before'),b=step(after,item.afterId,'after');
    const pair=`${item.beforeId}:${item.afterId}`;
    if(pairs.has(pair))throw fail('Each step pair can have only one decision.');
    pairs.add(pair);
    if(item.note!==undefined&&(typeof item.note!=='string'||item.note.length>1000))throw fail('Match notes must contain at most 1,000 characters.');
    if(item.status==='accepted'){
      if(a.ms===null||b.ms===null)throw fail('Accepted matches need recorded timestamps on both sides.');
      if((duration(before)!==null&&a.ms>duration(before))||(duration(after)!==null&&b.ms>duration(after)))throw fail('A matched step is outside its original recording.');
      if(beforeIds.has(item.beforeId)||afterIds.has(item.afterId))throw fail('Accepted matches must use each step only once.');
      beforeIds.add(item.beforeId);afterIds.add(item.afterId);accepted.push({before:a,after:b});
    }
    return {beforeId:item.beforeId,afterId:item.afterId,status:item.status,source:item.source,
      ...(item.note===undefined?{}:{note:item.note.trim()})};
  });
  accepted.sort((a,b)=>a.before.index-b.before.index);
  for(let i=1;i<accepted.length;i++){
    const previous=accepted[i-1],current=accepted[i];
    if(current.after.index<=previous.after.index||current.before.ms<=previous.before.ms||current.after.ms<=previous.after.ms)throw fail('Accepted matches must move forward in both journeys, without crossing or sharing timestamps.');
  }
  if(Buffer.byteLength(JSON.stringify(decisions))>30000)throw fail('Alignment decisions are too large.',413);
  return decisions;
}

/** Review snapshots live beside fixes, independently of immutable run evidence. */
export function createJourneyAlignmentStore({root,getFix,getRun}){
  root=resolve(root);
  async function context(fixId,input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw fail('Choose a fix round and a before/after run pair.');
    const scope={fixId,roundId:input.roundId,beforeRunId:input.beforeRunId,afterRunId:input.afterRunId};
    if(Object.values(scope).some(value=>typeof value!=='string'||!UUID.test(value)))throw fail('Choose a fix round and a before/after run pair.');
    const fix=await getFix(fixId),round=list(fix?.rounds).find(item=>item.id===scope.roundId);
    if(!round)throw fail('That round does not belong to this fix.',404);
    const comparisons=[...list(round.comparisons),round.comparison].filter(Boolean);
    const pair=comparisons.flatMap(comparison=>list(comparison.pairs)).find(item=>item.beforeRunId===scope.beforeRunId&&item.afterRunId===scope.afterRunId);
    if(!pair)throw fail('That run pair does not belong to this fix round.',404);
    const before=pair.before||await getRun?.(scope.beforeRunId),after=pair.after||await getRun?.(scope.afterRunId);
    if(!before||!after||before.id!==scope.beforeRunId||after.id!==scope.afterRunId)throw fail('Complete both recorded journeys before reviewing their alignment.',409);
    return {scope,before,after,directory:join(root,fixId,'alignments',scope.roundId,`${scope.beforeRunId}--${scope.afterRunId}`)};
  }
  async function latest({scope,directory}){
    let files;
    try{files=await readdir(directory);}catch(error){if(error.code!=='ENOENT')throw error;files=[];}
    const revisions=files.map(name=>name.match(REVISION)?.[1]).filter(Boolean).map(Number).filter(Number.isSafeInteger).sort((a,b)=>a-b);
    if(!revisions.length)return {scope,revision:0,decisions:[],updatedAt:null,historyCount:0};
    const revision=revisions.at(-1),record=JSON.parse(await readFile(join(directory,`${revision}.json`),'utf8'));
    if(record.revision!==revision||Object.entries(scope).some(([key,value])=>record.scope?.[key]!==value)||!Array.isArray(record.decisions))throw fail('The saved alignment review is unavailable. Its history has been preserved.',503);
    return {...record,historyCount:revisions.length};
  }
  return {
    get:async(fixId,input)=>latest(await context(fixId,input)),
    async put(fixId,input){
      const target=await context(fixId,input);
      if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)throw fail('Provide the alignment revision being reviewed.');
      const decisions=validateDecisions(input.decisions,target.before,target.after),previous=await latest(target);
      if(input.baseRevision!==previous.revision)throw fail('This alignment was updated elsewhere. Reload it before saving your review.',409);
      const record={scope:target.scope,revision:previous.revision+1,decisions,updatedAt:new Date().toISOString()};
      await mkdir(target.directory,{recursive:true,mode:0o700});
      const temporary=join(target.directory,`review-${randomUUID()}.tmp`);
      try{
        await writeFile(temporary,JSON.stringify(record,null,2),{mode:0o600,flag:'wx'});
        // Publish an already complete file without replacing any revision. An
        // exclusive hard link also guards competing server/store instances.
        await link(temporary,join(target.directory,`${record.revision}.json`));
      }catch(error){
        if(error.code==='EEXIST')throw fail('This alignment was updated elsewhere. Reload it before saving your review.',409);
        throw error;
      }finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
      return {...record,historyCount:previous.historyCount+1};
    },
  };
}
