import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createWorkspaceStore} from './workspace-store.mjs';

// Synthetic local benchmark only. Retain the generated SQLite fixture and report;
// never point this utility at a live workspace or infer user-facing video speed.
const destination=resolve(process.argv[2]||join(fileURLToPath(new URL('../outputs/release-qa/',import.meta.url)),`paging-${Date.now()}`));
await mkdir(destination,{recursive:true});
const store=createWorkspaceStore({root:join(destination,'fixture')}),count=1000,limit=100,projectId='little-steps';
const padding='Synthetic technical fixture. '.repeat(40);
store.db.exec('BEGIN IMMEDIATE');
try{
  const insert=store.db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)');
  for(let n=0;n<count;n++){
    const id=`benchmark-${String(n).padStart(6,'0')}`,createdAt=new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
    const run={id,projectId,status:'finished',name:`Fixture journey ${n}`,createdAt,completedAt:new Date(Date.parse(createdAt)+10000).toISOString(),startedAt:createdAt,personaId:n%2?'mother':'teacher',environmentId:'little-steps-local',personaName:n%2?'Parent':'Teacher',environmentName:'Benchmark fixture',events:Array.from({length:50},(_,index)=>({index,type:index%3?'network':'screenshot',...(index%3?{responseBody:padding}:{screenshot:`/runs/${id}/${index}.png`}),url:'http://fixture.invalid/activity'})),personaSnapshot:{context:padding},memorySnapshot:{roles:{persona:Array.from({length:10},(_,index)=>({id:`memory-${index}`,content:padding}))}},modelRequests:Array.from({length:20},(_,index)=>({id:`request-${index}`,usage:{total_tokens:1000}})),usage:[{input_tokens:18000,output_tokens:2000,total_tokens:20000}],findings:[]};
    insert.run(id,projectId,run.status,createdAt,createdAt,JSON.stringify(run),null,null);
  }
  store.db.exec('COMMIT');
}catch(error){store.db.exec('ROLLBACK');throw error;}
const recordHash=()=>{const hash=createHash('sha256'),statement=store.db.prepare('SELECT id,data FROM runs ORDER BY id');for(const row of statement.iterate())hash.update(row.id).update(row.data);return hash.digest('hex');};
const beforeHash=recordHash();
function originalList(){return store.db.prepare('SELECT id FROM runs WHERE project_id=? ORDER BY created_at DESC,id').all(projectId).map(row=>{
  const result=store.getRun(row.id);for(const key of ['events','usage','experience','finalMessage','finding','findings','persona','environmentSnapshot','charterSnapshot'])delete result[key];return result;
}).slice(0,limit);}
const measurements={original:[],metadata:[]};let originalRows,currentRows;
for(let sample=0;sample<3;sample++){
  global.gc?.();let started=performance.now();originalRows=originalList();measurements.original.push(performance.now()-started);
  global.gc?.();started=performance.now();currentRows=store.listRunsPage({projectId,limit}).runs;measurements.metadata.push(performance.now()-started);
}
const afterHash=recordHash(),median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
if(beforeHash!==afterHash||JSON.stringify(originalRows.map(row=>row.id))!==JSON.stringify(currentRows.map(row=>row.id)))throw new Error('Benchmark changed records or page identity.');
const report={createdAt:new Date().toISOString(),kind:'synthetic-local-metadata-benchmark',machine:{platform:os.platform(),release:os.release(),osVersion:os.version(),arch:os.arch(),cpu:os.cpus()[0]?.model,cpuCount:os.cpus().length,memoryBytes:os.totalmem(),node:process.version},fixture:{records:count,eventsPerRecord:50,pageSize:limit,path:join(destination,'fixture'),recordHash:beforeHash,retention:'keep-all'},milliseconds:{samples:measurements,median:{original:median(measurements.original),metadata:median(measurements.metadata)}},responseBytes:{original:Buffer.byteLength(JSON.stringify(originalRows)),metadata:Buffer.byteLength(JSON.stringify(currentRows))},checks:{samePageIds:true,sourceRecordsUnchanged:true,snapshotsExcluded:currentRows.every(row=>!Object.hasOwn(row,'memorySnapshot')&&!Object.hasOwn(row,'personaSnapshot')),modelRequestsExcluded:currentRows.every(row=>!Object.hasOwn(row,'modelRequests'))},limitations:['Warm local SQLite metadata benchmark, three samples; no paid model or external network calls.','Reconstructs the previous list implementation with the same getRun detail method and deletion list.','Does not measure browser rendering, video loading or every table collection.']};
await writeFile(join(destination,'report.json'),JSON.stringify(report,null,2));store.close();
console.log(JSON.stringify({report:join(destination,'report.json'),...report.milliseconds,responseBytes:report.responseBytes,checks:report.checks}));
