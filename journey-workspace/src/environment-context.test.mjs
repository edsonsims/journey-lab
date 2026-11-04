import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredEnvironment,configuredEnvironments,environmentLabel,presentEnvironment,isTemporaryExecution,presentReportEnvironments} from './environment-context.ts';
import {collectionFilters} from './collection-filters.ts';
import {runSelectionOptions} from './run-selection.ts';
import {buildExperienceFeedback} from './experience-feedback.ts';
import {buildExperienceCatalog} from './experience-perspectives.ts';

const environments=[{id:'dev',name:'Dev',version:3,lifecycle:'configured'},{id:'staging',name:'Staging',version:2,lifecycle:'configured'},{id:'fix-a',name:'Before',lifecycle:'temporary',configuredEnvironmentId:'dev'},{id:'fix-b',name:'After',lifecycle:'temporary',configuredEnvironmentId:'dev',archived:true}];
const temporary=(id='run-a',extra={})=>({id,environmentId:'fix-a',environmentName:'Before',environmentVersion:1,environmentKind:'temporary',configuredEnvironment:{id:'dev',name:'Dev',version:3,versionId:'dev-v3'},target:'http://127.0.0.1:51771/',environmentSnapshot:{id:'fix-a',url:'http://127.0.0.1:51771/'},...extra});

test('temporary execution display resolves to its configured parent without changing captured records',()=>{
 const run=temporary(),original=structuredClone(run),shown=presentEnvironment(run,environments);
 assert.equal(shown.environmentId,'dev');assert.equal(shown.environmentName,'Dev');assert.equal(shown.environmentVersion,3);
 assert.equal(shown.target,run.target);assert.equal(shown.environmentSnapshot,run.environmentSnapshot);assert.deepEqual(run,original);
 assert.deepEqual(configuredEnvironments(environments).map(e=>e.id),['dev','staging']);
});

test('unknown temporary parents stay unknown and cannot be guessed from names or a single configured environment',()=>{
 const unknown=temporary('u',{configuredEnvironment:null});
 assert.equal(configuredEnvironment(unknown,environments),null);assert.equal(environmentLabel(unknown,environments),'Not recorded');
 assert.equal(configuredEnvironment({environmentKind:'temporary',environmentId:'x',environmentName:'Dev'},[environments[0]]),null);
 assert.equal(configuredEnvironment({environmentId:'different',environmentName:'Dev'},[environments[0]]).id,'different');
});

test('renamed environments use the current label while preserving recorded configuration versions',()=>{
 const run=temporary('renamed',{configuredEnvironment:{id:'dev',name:'Current booking',version:1,versionId:'dev-v1'}});
 const original=structuredClone(run),catalog=[{id:'dev',name:'Development',version:4,versionId:'dev-v4'}];
 assert.equal(environmentLabel(run,catalog),'Development');
 assert.deepEqual(configuredEnvironment(run,catalog),{id:'dev',name:'Development',version:1,versionId:'dev-v1'});
 assert.equal(environmentLabel({environmentSnapshot:run},catalog),'Development');
 assert.equal(environmentLabel(run,[]),'Current booking');
 assert.deepEqual(run,original);
});

test('journey, finding and fix environment facets join the configured parent and preserve genuine environments',()=>{
 const before=temporary(),after=temporary('run-b',{environmentId:'fix-b'}),stage={id:'run-c',environmentId:'staging',environmentName:'Staging',environmentVersion:2};
 const data={environments,runs:[before,after,stage],findings:[{id:'f',runId:after.id}],fixes:[{id:'fix',runId:before.id,sourceRunIds:[after.id,stage.id]}]};
 const runsFacet=collectionFilters('runs',data).facets.find(f=>f.key==='environment');
 assert.deepEqual(data.runs.map(r=>runsFacet.getValues(r)),['dev','dev','staging']);
 assert.equal(runsFacet.labelValue('dev'),'Dev');
 assert.equal(collectionFilters('findings',data).facets.find(f=>f.key==='environment').getValues(data.findings[0]),'dev');
 assert.deepEqual(collectionFilters('fixes',data).facets.find(f=>f.key==='environment').getValues(data.fixes[0]),['dev','staging']);
 const duplicate=collectionFilters('runs',{runs:[{environmentId:'a'},{environmentId:'b'}],environments:[{id:'a',name:'Staging'},{id:'b',name:'Staging'}]}).facets.find(f=>f.key==='environment');
 assert.notEqual(duplicate.labelValue('a'),duplicate.labelValue('b'));
});

test('temporary instances never become launch choices even when active or referenced as the default',()=>{
 const options=runSelectionOptions({charters:[{id:'c',defaultEnvironmentId:'fix-a'}],environments,personas:[]},'project','c');
 assert.deepEqual(options.environments.map(e=>e.id),['dev','staging']);
});

test('experience uses the parent environment while keeping each build, recording and source context distinct',()=>{
 const runs=[temporary('before',{personaId:'maya',build:{id:'build-before'}}),temporary('after',{environmentId:'fix-b',personaId:'maya',build:{id:'build-after'}})];
 const screens=runs.map(run=>{const context={runId:run.id,personaId:'maya',personaName:'Maya',environmentId:run.environmentId,environmentName:'Temporary instance',environmentVersion:1,url:run.target};const moment={id:run.id+':moment',runId:run.id,signalIndex:0,eventIndex:1,originalMs:1200,context,observation:'The saved choice is visible.',reaction:'I can keep my choice.',valence:'positive',screenUrl:run.target,video:`/runs/${run.id}/video.webm`,screenshot:`/runs/${run.id}/1.png`};return {id:run.id+':screen',name:'Booking',routePattern:'/',url:run.target,moments:[moment],visits:[{context}],sourceRefs:[moment],evaluations:[]};});
 const original=structuredClone({runs,screens});
 const result=buildExperienceFeedback({projectId:'gather',screens,sourceRuns:runs,environments});
 assert.equal(result.feedback.length,2);assert.deepEqual(result.feedback.map(row=>row.environmentId),['dev','dev']);
 assert.deepEqual(result.feedback.map(row=>row.environmentName),['Dev','Dev']);assert.equal(result.feedback.find(row=>row.runId==='before').moment.context.environmentId,'fix-a');
 const catalog=buildExperienceCatalog({counts:{runIds:['before','after']}},runs,environments);
 assert.equal(catalog.variants.length,2);assert.deepEqual(catalog.variants.map(v=>v.environmentIds),[['dev'],['dev']]);
 assert.deepEqual(new Set(catalog.variants.flatMap(v=>v.buildIds)),new Set(['build-before','build-after']));
 assert.deepEqual({runs,screens},original);
});

test('only configured journey targets expose ordinary retry, while temporary runtimes require recreation',()=>{
 assert.equal(isTemporaryExecution({environmentId:'dev',status:'failed'}),false);
 assert.equal(isTemporaryExecution(temporary()),true);
 assert.equal(isTemporaryExecution({environmentId:'dev',environmentKind:'configured',executionInstance:{kind:'fix-retest',status:'stopped'}}),true);
});

test('Memory uses canonical display metadata without changing its recorded applicability',()=>{
 const entry={configuredEnvironment:{id:'dev',name:'Dev',version:3},applicability:{environmentId:'fix-a',environmentVersion:1}};
 assert.equal(environmentLabel({...entry,...entry.applicability},environments),'Dev');
 assert.equal(entry.applicability.environmentId,'fix-a');
});


test('frozen report environment presentation preserves original snapshot, metrics and pinned configured versions',()=>{
 const context={runId:'r',environmentId:'fix-a',environmentVersion:1};
 const snapshot={snapshotHash:'unchanged-hash',summary:{eligibleRuns:2,signals:4},sourceRuns:[{id:'r',...context,target:'http://127.0.0.1:51771/'},{id:'ordinary',environmentId:'dev',environmentVersion:2,environmentVersionId:'dev-v2'}],screens:[{counts:{eligibleRuns:2},moments:[{context,originalMs:1234,screenshot:'/runs/r/1.png'}],contexts:[{context}]}]};
 const original=structuredClone(snapshot),metadata={'fix-a':{configuredEnvironment:{id:'dev',name:'Dev',version:3,versionId:'dev-v3'},environmentKind:'temporary'},dev:{configuredEnvironment:{id:'dev',name:'Dev',version:99,versionId:'current'},environmentKind:'configured'}};
 const result=presentReportEnvironments(snapshot,metadata);
 assert.equal(result.sourceRuns[0].environmentId,'dev');assert.equal(result.sourceRuns[0].recordedEnvironmentId,'fix-a');
 assert.equal(result.screens[0].moments[0].context.environmentId,'dev');assert.equal(result.screens[0].contexts[0].context.environmentId,'dev');
 assert.equal(result.sourceRuns[1].environmentVersion,2);assert.equal(result.sourceRuns[1].environmentVersionId,'dev-v2');
 assert.deepEqual(result.summary,snapshot.summary);assert.deepEqual(result.screens[0].counts,snapshot.screens[0].counts);
 assert.equal(result.screens[0].moments[0].originalMs,1234);assert.equal(result.screens[0].moments[0].screenshot,'/runs/r/1.png');
 assert.deepEqual(snapshot,original);assert.equal(result.snapshotHash,original.snapshotHash);
});
