import test from 'node:test';
import assert from 'node:assert/strict';
import {impactCollectionRows,impactCollectionAssessment,impactCollectionSource,impactCollectionPersonas,impactCollectionSearchText,impactCollectionSummary} from './impact-collection.ts';
import {getImpactExample} from './impact-examples.ts';

test('the collection presents saved changes and illustrated examples through their existing detail ids',()=>{
 const saved={id:'saved-change',title:'Saved change',report:{status:'completed'},personas:[{personaId:'maya',personaName:'Maya'}]};
 const rows=impactCollectionRows([saved]);
 assert.deepEqual(rows.map(row=>row.id),['saved-change','example-relay-import','example-handoff-links']);
 assert.equal(rows[0],saved);
 assert.equal(impactCollectionAssessment(saved),'completed');
 for(const example of rows.slice(1)){
  assert.equal(impactCollectionAssessment(example),'illustrated');
  assert.equal(impactCollectionSource(example),'Illustrated example');
 }
 assert.equal(impactCollectionRows(rows).length,3);
});

test('illustrated outcomes are excluded from collection evidence totals and recorded presets',()=>{
 const example=getImpactExample('example-handoff-links');
 assert.ok(example.report.summary.outcomeRegressions>0);
 const summary=impactCollectionSummary([example]);
 assert.equal(summary.saved,0);
 assert.equal(summary.examples,1);
 assert.equal(summary.metrics.find(metric=>metric.key==='regressions').value,'0');
 assert.equal(summary.metrics.find(metric=>metric.key==='repair-retests').value,'0');
 assert.notEqual(impactCollectionAssessment(example),'completed');
 assert.notEqual(impactCollectionAssessment(example),'inconclusive');
});

test('compact perspectives include pending personas, deduplicate pairs, and support name and product search',()=>{
 const record={personas:[{personaId:'maya'},{personaId:'pending',personaSnapshot:{name:'Alex'}}],report:{pairs:[{personaId:'maya',personaName:'Maya'},{personaId:'extra',before:{personaSnapshot:{name:'Sam'}}}]}};
 assert.deepEqual(impactCollectionPersonas(record),[{id:'maya',name:'Maya'},{id:'pending',name:'Alex'},{id:'extra',name:'Sam'}]);
 const example=getImpactExample('example-relay-import');
 assert.match(impactCollectionSearchText(example),/Customer CRM/);
 assert.match(impactCollectionSearchText(example),/Nia/);
 assert.match(impactCollectionSearchText(record),/Alex Sam/);
});

test('saved persona references resolve their human names from the recorded pair',()=>{
 const record={personas:[{personaId:'gather-coordinator',baselineRunId:'before',proposalRunId:'after'}],report:{pairs:[{personaId:'gather-coordinator',personaName:'Maya · Coordinator'}]}};
 assert.deepEqual(impactCollectionPersonas(record),[{id:'gather-coordinator',name:'Maya · Coordinator'}]);
 assert.match(impactCollectionSearchText(record),/Maya · Coordinator/);
});
