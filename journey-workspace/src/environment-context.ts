import type {Row} from './lib.ts';

type EnvironmentIdentity={id:string;name:string;version:number|null;versionId:string|null};
const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim();
const version=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const own=(record:Row,key:string)=>Object.prototype.hasOwnProperty.call(record,key);
export function configuredEnvironments(value:unknown):Row[]{return Array.isArray(value)?value.filter(row=>row&&row.lifecycle!=='temporary'&&row.environmentKind!=='temporary'):[];}

/** Display identity is separate from the URL/build captured by an execution. */
export function configuredEnvironment(record:Row|null|undefined,environments:Row[]=[]):EnvironmentIdentity|null{
 if(!record)return null;
 if(own(record,'configuredEnvironment')){
  const configured=record.configuredEnvironment;
  if(!configured||!text(configured.id))return null;
  const saved=environments.find(item=>item.id===configured.id);
  return {id:configured.id,name:saved?.name||configured.name||configured.id,version:version(configured.version),versionId:configured.versionId||null};
 }
 const snapshot=record.environmentSnapshot;
 if(snapshot&&own(snapshot,'configuredEnvironment'))return configuredEnvironment(snapshot,environments);
 const id=text(record.environmentId)?record.environmentId:text(snapshot?.id)?snapshot.id:null;
 const saved=environments.find(item=>item.id===id);
 const parentId=record.configuredEnvironmentId||snapshot?.configuredEnvironmentId||saved?.configuredEnvironmentId;
 if(text(parentId)&&parentId!==id){
  const parent=configuredEnvironments(environments).find(item=>item.id===parentId);
  return parent?{id:parent.id,name:parent.name||parent.id,version:version(parent.version),versionId:parent.versionId||null}:null;
 }
 if(record.environmentKind==='temporary'||snapshot?.lifecycle==='temporary'||saved?.lifecycle==='temporary')return null;
 if(!id)return null;
 return {id,name:saved?.name||record.environmentName||snapshot?.name||id,version:version(record.environmentVersion??snapshot?.version??saved?.version),versionId:record.environmentVersionId||snapshot?.versionId||saved?.versionId||null};
}
export function environmentLabel(record:Row|null|undefined,environments:Row[]=[],fallback='Not recorded'){return configuredEnvironment(record,environments)?.name||fallback;}
/** A UI-only projection; the source record and its captured snapshot stay intact. */
export function presentEnvironment(record:Row,environments:Row[]=[]):Row{
 const identity=configuredEnvironment(record,environments);
 return {...record,environmentId:identity?.id||null,environmentName:identity?.name||null,environmentVersion:identity?.version??null,environmentVersionId:identity?.versionId||null};
}

export function isTemporaryExecution(record:Row|null|undefined){return !!record&&(record.environmentKind==='temporary'||!!record.executionInstance);}

/** Report metadata changes presentation only; the frozen snapshot and its metrics remain intact. */
export function presentReportEnvironments<T>(snapshot:T,contexts:Record<string,Row>={}):T{
 const visit=(value:any):any=>{
  if(Array.isArray(value))return value.map(visit);
  if(!value||typeof value!=='object')return value;
  const projected=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,visit(item)]));
  const metadata=text(value.environmentId)?contexts[value.environmentId]:null;
  if(!metadata||own(value,'configuredEnvironment'))return projected;
  let configured=metadata.configuredEnvironment;
  if(configured?.id===value.environmentId&&metadata.environmentKind==='configured')configured={...configured,version:version(value.environmentVersion),versionId:value.environmentVersionId||null};
  return {...presentEnvironment({...projected,...metadata,configuredEnvironment:configured}),recordedEnvironmentId:value.recordedEnvironmentId??value.environmentId,recordedEnvironmentVersion:value.recordedEnvironmentVersion??value.environmentVersion??null};
 };
 return visit(snapshot);
}
