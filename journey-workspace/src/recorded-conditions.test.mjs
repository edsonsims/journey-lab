import test from 'node:test';
import assert from 'node:assert/strict';
import {recordedConditionsKey} from './recorded-conditions.ts';
import {collectionFilters} from './collection-filters.ts';

const run={deviceId:'phone',deviceSnapshot:{name:'Phone at recording',browser:'chromium',viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true},networkProfileSnapshot:{name:'Slow at recording',offline:false,latencyMs:300,downloadMbps:1,uploadMbps:0.5}};
test('identical dimensions do not make touch, density or network conditions equivalent',()=>{
 for(const patch of [{deviceSnapshot:{...run.deviceSnapshot,hasTouch:false}},{deviceSnapshot:{...run.deviceSnapshot,deviceScaleFactor:1}},{networkProfileSnapshot:{...run.networkProfileSnapshot,latencyMs:600}}])assert.notEqual(recordedConditionsKey(run),recordedConditionsKey({...run,...patch}));
 assert.equal(recordedConditionsKey(run),recordedConditionsKey({...run,deviceSnapshot:{...run.deviceSnapshot,name:'Renamed',version:2}}));
 assert.notEqual(recordedConditionsKey(run),recordedConditionsKey({...run,networkProfileSnapshot:undefined}));
});
test('journey device and network filters search recorded labels despite catalog renames',()=>{
 const filters=collectionFilters('runs',{runs:[{...run,id:'r'}],devices:[{id:'phone',name:'Changed after the run'}]});
 assert.equal(filters.facets.find(f=>f.key==='device').getValues(run),'Phone at recording');
 assert.equal(filters.facets.find(f=>f.key==='network').getValues(run),'Slow at recording');
 assert.match(filters.searchText(run),/Phone at recording.*Slow at recording/);
 assert.doesNotMatch(filters.searchText(run),/Changed after/);
});
