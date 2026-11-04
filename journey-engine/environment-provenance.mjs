import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const read=path=>{try{return JSON.parse(readFileSync(path,'utf8'));}catch{return null;}};
const dirs=path=>{try{return readdirSync(path,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name);}catch{return [];}};
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
/** Only generated identities and exact source-artifact relationships establish an instance. */
export function historicalEnvironmentInstances({root,environments,defaultProject='little-steps'}){
 const result=[],byId=new Map(environments.map(e=>[e.id,e]));
 for(const env of environments){
  if(env.id===`legacy-env-${hash(env.url)}`&&env.isolation==='legacy-unknown')result.push({id:env.id,parentEnvironmentId:env.projectId===defaultProject&&byId.has('little-steps-local')&&(env.scenarioId==='printer-access'||/\/improvements\//.test(env.url))?'little-steps-local':null,parentEnvironmentVersion:1,source:{kind:'legacy-import',target:env.url}});
 }
 for(const fixId of dirs(join(root,'fixes'))){
  const fix=read(join(root,'fixes',fixId,'fix.json'));if(!fix||fix.id!==fixId)continue;
  for(const round of fix.rounds||[])for(const side of ['baseline','candidate']){
   const path=round[`${side}Directory`];if(typeof path!=='string'||resolve(path)!==resolve(root,'fixes',fixId,'rounds',round.id,side))continue;
   for(const env of environments)if(env.archived&&env.projectId===fix.projectId&&env.repositoryPath&&resolve(env.repositoryPath)===resolve(path))result.push({id:env.id,parentEnvironmentId:fix.environment?.id||fix.sourceRun?.environmentId||null,parentEnvironmentVersion:fix.environment?.version||fix.sourceRun?.environmentVersion||null,source:{kind:'fix-preview',fixId,roundId:round.id,comparisonId:round.comparison?.id||null,variant:side==='baseline'?'before':'after'}});
  }
 }
 // The saved Gather fixture explicitly represents two local builds, not two deployment environments.
 for(const id of dirs(join(root,'change-impacts'))){
  let files;try{files=readdirSync(join(root,'change-impacts',id)).filter(f=>/^\d+\.json$/.test(f)).sort((a,b)=>parseInt(b)-parseInt(a));}catch{continue;}
  const record=read(join(root,'change-impacts',id,files[0]||'')),base=byId.get('gather-base'),proposal=byId.get('gather-proposal');
  if(record?.projectId!=='gather'||record.kind!=='local_proposal'||record.baseline?.environmentId!==base?.id||record.proposal?.environmentId!==proposal?.id||base?.projectId!=='gather'||proposal?.projectId!=='gather'||base.scenarioId!=='gather-booking'||proposal.scenarioId!=='gather-booking')continue;
  if(!base.repositoryPath||!proposal.repositoryPath||resolve(base.repositoryPath,'..')!==resolve(proposal.repositoryPath,'..')||!/[\/]gather[\/]base$/.test(base.repositoryPath)||!/[\/]gather[\/]proposal$/.test(proposal.repositoryPath))continue;
  result.push({id:proposal.id,parentEnvironmentId:base.id,parentEnvironmentVersion:record.baseline.environmentVersion,source:{kind:'change-preview',changeImpactId:id,sourceHash:record.proposal.sourceHash}});
 }
 return result;
}
