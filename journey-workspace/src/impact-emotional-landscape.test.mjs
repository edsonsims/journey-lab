import test from 'node:test';
import assert from 'node:assert/strict';
import {buildImpactLandscape,landscapeLayers,landscapeColor,buildImpactLandscapeComparison,landscapeComparisonLayers} from './impact-emotional-landscape.ts';
import {getImpactExample} from './impact-examples.ts';

const run=experience=>({status:'finished',experience});
test('each persona uses its own observation progress, without matching actions or video time',()=>{
 const items=buildImpactLandscape([{personaId:'short',before:run([{originalMs:0,valence:'neutral'},{originalMs:90000,valence:'negative'}])},{personaId:'long',before:run([{originalMs:0,valence:'positive'},{originalMs:1,valence:'neutral'},{originalMs:2,valence:'positive'}])}],'before');
 assert.deepEqual(items[0].points.map(point=>point.progress),[0,1]);
 assert.deepEqual(items[1].points.map(point=>point.progress),[0,.5,1]);
 assert.equal(items[0].points[1].ms,90000);
});
test('unknown ratings and untimed reactions break traces without removing source observations',()=>{
 const item=buildImpactLandscape([{personaId:'a',after:run([{originalMs:0,valence:'positive'},{originalMs:1,valence:null},{originalMs:2,valence:'negative'},{valence:'positive'},{originalMs:4,valence:'neutral'}])}],'after')[0];
 assert.deepEqual(item.segments.map(segment=>segment.map(point=>point.index)),[[0],[2],[4]]);
 assert.equal(item.points.length,5);assert.equal(item.unrated,1);assert.equal(item.untimed,1);
 assert.deepEqual(item.plotted.map(point=>point.progress),[0,.5,1]);
});
test('missing, empty and partial journeys remain selectable without invented curves',()=>{
 const items=buildImpactLandscape([{personaId:'missing'},{personaId:'empty',after:run([])},{personaId:'partial',after:{...run([{originalMs:0,valence:'neutral'}]),scenario:{complete:false}}}],'after');
 assert.equal(items.length,3);assert.equal(items[0].status,'Journey unavailable');assert.equal(items[1].status,'No reactions');assert.equal(items[2].partial,true);
 assert.equal(items[0].plotted.length,0);assert.equal(items[2].points[0].progress,.5);
});
test('selection brings the persona forward and preserves color, source order and input',()=>{
 const input=getImpactExample('example-handoff-links').report.pairs,snapshot=structuredClone(input),items=buildImpactLandscape(input,'after');
 const layers=landscapeLayers(items,items[1].id);
 assert.equal(layers.at(-1).item.id,items[1].id);assert.equal(layers.at(-1).depth,0);
 assert.equal(new Set(layers.map(layer=>layer.item.id)).size,items.length);
 assert.equal(items[1].color,buildImpactLandscape([...input].reverse(),'before').find(item=>item.id===items[1].id).color);
 assert.equal(new Set(items.map(item=>item.color)).size,items.length);
 assert.deepEqual(input,snapshot);
});
test('invalidated and experimental evidence stays listed but never becomes a comparison curve',()=>{
 const source=run([{originalMs:0,valence:'positive'}]);
 const items=buildImpactLandscape([{personaId:'invalid',after:{...source,integrityStatus:'invalidated'}},{personaId:'experiment',experimentalStudyId:'study',after:source},{personaId:'controls',controls:{status:'mismatch'},after:source}],'after');
 assert.equal(items[0].status,'Invalidated evidence');assert.equal(items[0].plotted.length,0);
 assert.equal(items[1].status,'Experimental evidence');assert.equal(items[1].plotted.length,0);
 assert.equal(items[2].warning,'Controls differ');assert.equal(items[2].plotted.length,1);
});
test('the explicit invalidated repair-candidate control marker excludes both comparison traces',()=>{
 const source=run([{originalMs:0,valence:'positive'}]);
 const pair={personaId:'repair',before:source,after:source,controls:{status:'mismatch',issues:['repair_candidate_invalidated']}};
 for(const side of ['before','after']){
  const item=buildImpactLandscape([pair],side)[0];
  assert.equal(item.status,'Invalidated evidence');assert.equal(item.plotted.length,0);
 }
 const ordinary=buildImpactLandscape([{...pair,controls:{status:'mismatch',issues:['device_mismatch']}}],'after')[0];
 assert.equal(ordinary.warning,'Controls differ');assert.equal(ordinary.plotted.length,1);
});
test('a descriptive persona-name suffix takes priority over a generic snapshot role',()=>{
 const item=buildImpactLandscape([{personaId:'alex',personaName:'Alex · Executive assistant',after:{...run([]),personaSnapshot:{role:'client'}}}],'after')[0];
 assert.equal(item.name,'Alex');assert.equal(item.role,'Executive assistant');
});
test('paired arcs preserve independent observation progress, gaps and unequal lengths',()=>{
 const pair={personaId:'a',before:run([{originalMs:0,valence:'neutral'},{originalMs:50,valence:'negative'}]),
  after:run([{originalMs:0,valence:'neutral'},{originalMs:1,valence:null},{originalMs:2,valence:'positive'},{valence:'positive'},{originalMs:4,valence:'very_positive'}])};
 const snapshot=structuredClone(pair),[item]=buildImpactLandscapeComparison([pair]);
 assert.deepEqual(item.before.points.map(point=>point.progress),[0,1]);
 assert.deepEqual(item.after.points.map(point=>point.progress),[0,.25,.5,.75,1]);
 assert.deepEqual(item.after.segments.map(segment=>segment.map(point=>point.index)),[[0],[2],[4]]);
 assert.equal(item.before.points[1].ms,50);assert.equal(item.after.unrated,1);assert.equal(item.after.untimed,1);
 assert.deepEqual(pair,snapshot);
});
test('paired arcs retain an available version and its identity when the other version is missing',()=>{
 const [item]=buildImpactLandscapeComparison([{personaId:'alex',after:{...run([{originalMs:0,valence:'positive'}]),personaSnapshot:{name:'Alex · Executive assistant',role:'client'}}}]);
 assert.equal(item.name,'Alex');assert.equal(item.role,'Executive assistant');
 assert.equal(item.before.missing,true);assert.equal(item.before.plotted.length,0);
 assert.equal(item.after.missing,false);assert.equal(item.after.plotted.length,1);
 assert.equal(item.before.color,item.after.color);assert.equal(item.color,item.after.color);
});
test('paired arcs preserve side-specific exclusions and partial-journey statuses',()=>{
 const source=run([{originalMs:0,valence:'positive'}]);
 const [item]=buildImpactLandscapeComparison([{personaId:'a',before:{...source,integrityStatus:'invalidated'},after:{...source,status:'running'}}]);
 assert.equal(item.before.excluded,'Invalidated evidence');assert.equal(item.before.plotted.length,0);
 assert.equal(item.after.excluded,'');assert.equal(item.after.plotted.length,1);assert.equal(item.after.partial,true);
});
test('selection moves the whole before-and-after pair to one foreground plane',()=>{
 const pairs=getImpactExample('example-handoff-links').report.pairs;
 const items=buildImpactLandscapeComparison(pairs),selected=items[2],layers=landscapeComparisonLayers(items,selected.id);
 assert.equal(layers.length,items.length);assert.equal(layers.at(-1).depth,0);
 assert.strictEqual(layers.at(-1).item.before,selected.before);assert.strictEqual(layers.at(-1).item.after,selected.after);
 assert.deepEqual(layers.slice(0,-1).map(layer=>layer.item.id),items.filter(item=>item!==selected).map(item=>item.id));
 const reversed=buildImpactLandscapeComparison([...pairs].reverse());
 for(const item of items){assert.equal(item.color,reversed.find(other=>other.id===item.id).color);assert.equal(item.before.color,item.after.color);}
 assert.deepEqual(landscapeComparisonLayers([],selected.id),[]);
});
