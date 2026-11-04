import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRunSelection,reconcileRunSelection,runSelectionOptions} from './run-selection.ts';

const item=(id,extra={})=>({id,projectId:'product',...extra});
const catalog=()=>({
 charters:[item('first',{defaultEnvironmentId:'staging',compatibleEnvironmentIds:['local','staging'],personaIds:['teacher','parent']})],
 environments:[item('local'),item('staging'),item('production')],personas:[item('parent'),item('teacher'),item('reviewer')]
});

test('initial selection uses active compatible default and valid charter suggestions',()=>{
 const data=catalog();
 assert.deepEqual(defaultRunSelection(data,'product'),{charterId:'first',environmentId:'staging',personaIds:['teacher','parent']});
 assert.deepEqual(runSelectionOptions(data,'product','first').environments.map(item=>item.id),['local','staging']);
});

test('archived, foreign and excluded defaults cannot widen the selected environment scope',()=>{
 for(const invalid of [{archived:true},{projectId:'another-product'}]){
  const data=catalog();Object.assign(data.environments[1],invalid);
  assert.equal(defaultRunSelection(data,'product').environmentId,'local');
 }
 const data=catalog();data.charters[0].defaultEnvironmentId='production';
 assert.equal(defaultRunSelection(data,'product').environmentId,'local');
 data.charters[0].compatibleEnvironmentIds=['missing','staging'];data.environments[1].archived=true;
 assert.equal(defaultRunSelection(data,'product').environmentId,'');
 assert.deepEqual(runSelectionOptions(data,'product','first').environments,[]);
});

test('suggestions skip unavailable profiles and fall back to one active persona',()=>{
 const data=catalog();data.charters[0].personaIds=['missing','teacher','foreign'];
 data.personas[1].archived=true;data.personas.push(item('foreign',{projectId:'other'}));
 assert.deepEqual(defaultRunSelection(data,'product').personaIds,['parent']);
 data.personas[0].archived=true;
 assert.deepEqual(defaultRunSelection(data,'product').personaIds,['reviewer']);
});

test('explicit charter changes apply that charter defaults while limiting suggested launch size',()=>{
 const data=catalog();data.charters.push(item('second',{defaultEnvironmentId:'production',compatibleEnvironmentIds:['production'],personaIds:['reviewer']}));
 assert.deepEqual(defaultRunSelection(data,'product','second'),{charterId:'second',environmentId:'production',personaIds:['reviewer']});
 data.personas=Array.from({length:20},(_,i)=>item(`persona-${i}`));data.charters[1].personaIds=data.personas.map(item=>item.id);
 assert.equal(defaultRunSelection(data,'product','second').personaIds.length,12);
});

test('polling preserves manual environment, persona choices and deliberate empty selection',()=>{
 const data=catalog(),selection={charterId:'first',environmentId:'local',personaIds:['reviewer']};
 data.charters[0].version=2;data.charters[0].personaIds=['parent'];
 assert.equal(reconcileRunSelection(data,'product',selection),selection);
 const empty={...selection,personaIds:[]};
 assert.equal(reconcileRunSelection(data,'product',empty),empty);
});

test('refresh removes archived selections and cannot substitute an incompatible environment',()=>{
 const data=catalog(),selection={charterId:'first',environmentId:'staging',personaIds:['teacher','parent']};
 data.environments[1].archived=true;data.personas[1].archived=true;
 assert.deepEqual(reconcileRunSelection(data,'product',selection),{charterId:'first',environmentId:'local',personaIds:['parent']});
 data.environments[0].archived=true;
 assert.equal(reconcileRunSelection(data,'product',selection).environmentId,'');
 data.personas[0].archived=true;
 assert.deepEqual(reconcileRunSelection(data,'product',selection).personaIds,['reviewer']);
});

test('archiving the selected charter moves to another active charter with its own defaults',()=>{
 const data=catalog();data.charters[0].archived=true;data.charters.push(item('next',{compatibleEnvironmentIds:['production'],personaIds:['reviewer']}));
 assert.deepEqual(reconcileRunSelection(data,'product',{charterId:'first',environmentId:'local',personaIds:['parent']}),{charterId:'next',environmentId:'production',personaIds:['reviewer']});
 data.charters[1].archived=true;
 assert.deepEqual(reconcileRunSelection(data,'product',{charterId:'next',environmentId:'production',personaIds:['reviewer']}),{charterId:'',environmentId:'',personaIds:[]});
});
