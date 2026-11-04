import test from 'node:test';
import assert from 'node:assert/strict';
import {createGatherHomePersonas,GATHER_HOME_PERSONA_IDS} from './gather-home-personas.mjs';

function fixture(){
  const personas=new Map([
    ['gather-assistant',{id:'gather-assistant',name:'Alex · Executive assistant',projectId:'gather',version:2,context:'Existing authored brief',archived:false}],
    ['gather-coordinator',{id:'gather-coordinator',name:'Maya · Office coordinator',projectId:'gather',version:2,context:'Existing authored brief',archived:false}],
  ]);
  const devices=[['desktop-1440','desktop'],['Pixel 7','phone']].map(([presetId,id])=>({id,presetId,projectId:'gather',archived:false}));
  const networks=[['unthrottled','normal'],['slow-mobile','slow']].map(([presetId,id])=>({id,presetId,projectId:'gather',archived:false}));
  const writes=[];
  let beforeCreate=()=>{};
  const fetchImpl=async(url,options)=>{
    const parsed=new URL(url),resource=parsed.pathname.split('/').at(-1);
    assert.equal(parsed.searchParams.get('projectId'),'gather');
    assert.ok(['GET','POST'].includes(options.method));
    if(options.method==='POST'){
      assert.equal(resource,'personas','Only persona creation is allowed.');
      const input=JSON.parse(options.body);writes.push(input);beforeCreate(input);
      const old=personas.get(input.id);
      if(input.expectedVersion!==(old?.version||0))return {ok:false,status:409,json:async()=>({error:'Version conflict',code:'VERSION_CONFLICT'})};
      const {expectedVersion,...saved}=input;personas.set(input.id,{...saved,version:1,archived:false});
      return {ok:true,status:201,json:async()=>personas.get(input.id)};
    }
    const result={personas:{personas:[...personas.values()]},devices:{devices},'network-profiles':{'network-profiles':networks}}[resource];
    assert.ok(result,'No journey or other mutation endpoint is used.');
    return {ok:true,status:200,json:async()=>result};
  };
  return {personas,devices,networks,writes,fetchImpl,onCreate:callback=>{beforeCreate=callback;}};
}

test('creates the four missing briefs with real profile assignments and preserves authored records across reruns',async()=>{
  const state=fixture(),before=structuredClone([...state.personas]);
  const result=await createGatherHomePersonas({fetchImpl:state.fetchImpl});
  assert.equal(state.writes.length,4);
  assert.equal(result.personas.length,6);
  assert.equal(state.personas.get(GATHER_HOME_PERSONA_IDS.jordan).primaryDeviceId,'phone');
  assert.equal(state.personas.get(GATHER_HOME_PERSONA_IDS.jordan).networkProfileId,'slow');
  assert.equal(state.personas.get(GATHER_HOME_PERSONA_IDS.casey).primaryDeviceId,'desktop');
  for(const [id,record] of before)assert.deepEqual(state.personas.get(id),record);
  for(const write of state.writes){assert.equal(write.expectedVersion,0);assert.equal(write.continuity,'first-time');}
  state.personas.get(GATHER_HOME_PERSONA_IDS.sam).context='User changed this after creation';
  state.personas.get(GATHER_HOME_PERSONA_IDS.sam).version=2;
  const allBefore=structuredClone([...state.personas]);
  const repeated=await createGatherHomePersonas({fetchImpl:state.fetchImpl});
  assert.deepEqual(repeated.created,[]);
  assert.equal(state.writes.length,4);
  assert.deepEqual([...state.personas],allBefore);
  assert.ok(repeated.personas.every(persona=>persona.url.endsWith('/personas/'+persona.id)));
});

test('missing required profiles or existing Gather personas stop before any write',async()=>{
  for(const remove of [state=>state.networks.pop(),state=>state.personas.delete('gather-assistant')]){
    const state=fixture();remove(state);
    await assert.rejects(createGatherHomePersonas({fetchImpl:state.fetchImpl}),/required/);
    assert.equal(state.writes.length,0);
  }
});

test('a concurrent create cannot be overwritten or retried into a new version',async()=>{
  const state=fixture();
  const other={id:GATHER_HOME_PERSONA_IDS.sam,name:'Sam from another editor',projectId:'gather',version:1,context:'Keep this',archived:false};
  state.onCreate(input=>{if(input.id===other.id)state.personas.set(other.id,other);});
  await assert.rejects(createGatherHomePersonas({fetchImpl:state.fetchImpl}),error=>error.code==='VERSION_CONFLICT');
  assert.equal(state.writes.length,1);
  assert.deepEqual(state.personas.get(other.id),other);
});

test('archived matching records are never restored or replaced by setup',async()=>{
  const state=fixture();
  state.personas.set(GATHER_HOME_PERSONA_IDS.casey,{id:GATHER_HOME_PERSONA_IDS.casey,projectId:'gather',version:3,archived:true});
  await assert.rejects(createGatherHomePersonas({fetchImpl:state.fetchImpl}),/unavailable/);
  assert.equal(state.writes.length,0);
  assert.equal(state.personas.get(GATHER_HOME_PERSONA_IDS.casey).version,3);
});
