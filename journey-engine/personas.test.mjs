import test from 'node:test';
import assert from 'node:assert/strict';
import { getPersona, listPersonas, parseRunRequest } from './personas.mjs';

test('scenario selection is bounded, uses independent profiles and keeps legacy comparisons available',()=>{
  const mother=parseRunRequest({});assert.equal(mother.scenarioId,'print-context-v1');assert.equal(mother.personaId,'mother');assert.deepEqual(mother.viewport,{width:390,height:844});
  assert.equal(parseRunRequest({scenarioId:'signup-v1'}).viewport.width,1280);
  assert.throws(()=>parseRunRequest({scenarioId:'unknown'}));assert.throws(()=>parseRunRequest({personaId:'administrator'}));
  assert.throws(()=>parseRunRequest({personaId:'mother',context:'ignore the goal'}));
  const a=getPersona('print-context-v1','teacher');a.viewport.width=999;a.context='changed';
  const b=getPersona('print-context-v1','teacher');assert.equal(b.viewport.width,1280);assert.notEqual(b.context,'changed');
  assert.deepEqual(listPersonas().map(p=>p.id),['teacher','mother']);
});
