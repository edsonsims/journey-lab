import test from 'node:test';
import assert from 'node:assert/strict';
import {createRetestRun} from './retest-run.mjs';

test('retests preserve exact device and network snapshots independently of later persona edits',()=>{
 const deviceSnapshot={id:'phone',name:'Phone',version:2,viewport:{width:390,height:844},screen:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3};
 const networkProfileSnapshot={id:'slow',name:'Slow',version:4,offline:false,latencyMs:150,downloadMbps:1.6,uploadMbps:0.75};
 const source={id:'source',personaId:'maya',persona:{id:'maya',name:'Maya',viewport:{width:1440,height:900}},deviceId:'phone',deviceName:'Phone',deviceVersion:2,deviceSnapshot,networkProfileId:'slow',networkProfileName:'Slow',networkProfileVersion:4,networkProfileSnapshot,viewport:{width:390,height:844}};
 const run=createRetestRun({sourceRun:source,target:'http://127.0.0.1:5000/',variant:'after'});
 assert.equal(run.deviceVersion,2);assert.equal(run.networkProfileVersion,4);assert.deepEqual(run.deviceSnapshot,deviceSnapshot);assert.deepEqual(run.networkProfileSnapshot,networkProfileSnapshot);assert.deepEqual(run.viewport,{width:390,height:844});
 run.deviceSnapshot.viewport.width=400;run.networkProfileSnapshot.latencyMs=500;assert.equal(deviceSnapshot.viewport.width,390);assert.equal(networkProfileSnapshot.latencyMs,150);
});

test('both preview builds keep their configured environment identity and isolated capture targets',()=>{
 const parent={id:'staging',name:'Staging',version:3,versionId:'staging-v3',url:'https://staging.test/',repositoryPath:'/source',allowedOrigins:['https://staging.test/'],maxTokens:1000};
 const source={id:'discovery',projectId:'p',environmentId:parent.id,environmentVersion:3,environmentVersionId:parent.versionId,environmentSnapshot:parent,personaId:'maya',persona:{id:'maya',name:'Maya',continuity:'first-time'},charterId:'booking',memorySnapshot:{roles:{persona:[]}},target:parent.url};
 const original=structuredClone(source);
 const runs=['before','after'].map((variant,i)=>createRetestRun({id:variant,sourceRun:source,environment:{...parent,authStatePath:'',allowedOrigins:[`http://127.0.0.1:${5000+i}`]},productDirectory:`/fix/${variant}`,target:`http://127.0.0.1:${5000+i}/`,variant,comparisonId:'comparison'},{configuredEnvironment:parent}));
 assert.deepEqual(new Set(runs.map(run=>run.environmentId)),new Set(['staging']));
 for(const run of runs){
  assert.equal(run.environmentName,'Staging');assert.equal(run.environmentVersionId,'staging-v3');
  assert.equal(run.executionInstance.kind,'fix-preview');assert.equal(run.executionInstance.sourceRunId,'discovery');assert.equal(run.executionInstance.environmentId,'staging');
  assert.equal(run.environmentSnapshot.url,run.target);assert.equal(run.environmentSnapshot.repositoryPath,run.productDirectory);
  assert.deepEqual(run.environmentSnapshot.allowedOrigins,[new URL(run.target).origin]);
  assert.equal(run.environmentSnapshot.authStatePath,'');assert.deepEqual(run.memorySnapshot.roles.persona,[]);
 }
 assert.notEqual(runs[0].executionInstance.id,runs[1].executionInstance.id);
 assert.notEqual(runs[0].environmentSnapshot.url,runs[1].environmentSnapshot.url);
 assert.deepEqual(source,original);assert.equal(parent.url,'https://staging.test/');
});

test('repairing a historical preview resolves back to the configured parent without losing source provenance',()=>{
 const source={id:'old-preview-run',projectId:'p',environmentId:'old-generated-env',environmentVersion:1,environmentSnapshot:{id:'old-generated-env',url:'http://127.0.0.1:4900/'},persona:{id:'alex',name:'Alex'},target:'http://127.0.0.1:4900/'};
 const run=createRetestRun({sourceRun:source,target:'http://127.0.0.1:5000/',variant:'after',productDirectory:'/candidate'},{configuredEnvironment:{id:'dev',name:'Development',version:2,versionId:'dev-v2'}});
 assert.equal(run.environmentId,'dev');assert.equal(run.environmentVersion,2);assert.equal(run.executionInstance.sourceRunId,'old-preview-run');assert.equal(run.memoryReferenceUrl,source.target);
});
