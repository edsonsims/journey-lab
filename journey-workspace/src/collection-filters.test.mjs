import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFilters} from './collection-filters.ts';
import {findingPersonaName} from './finding-display.ts';
import {buildTableFilterModel,readTableFilterState,UNKNOWN_FILTER_VALUE as unknown} from './table-filters.ts';

const facet=(config,key)=>config.facets.find(item=>item.key===key);
function filtered(kind,data,selections={},sort){
 const config=collectionFilters(kind,data);
 return buildTableFilterModel({rows:data[kind]||[],facets:config.facets,sorts:config.sorts,searchText:config.searchText,state:{query:'',selections,sort:sort||config.defaultSort}}).rows;
}

test('journey attention and severity use records, not negative emotion or runner restrictions',()=>{
 const data={runs:[
  {id:'failed-agent',status:'blocked',valence:'very_negative',impactCounts:{}},
  {id:'observed-obstacle',status:'finished',outcome:'obstacle_observed',impactCounts:{high:1}},
  {id:'source',status:'finished',outcome:'goal_reached',impactCounts:{critical:1}},
  {id:'unknown',impactCounts:{high:-1}},
 ],findings:[{id:'critical',runId:'source',impact:'critical'}]};
 assert.deepEqual(filtered('runs',data,{attention:['blocked']}).map(row=>row.id),['observed-obstacle']);
 assert.deepEqual(filtered('runs',data,{impact:['high','critical']}).map(row=>row.id),['source','observed-obstacle']);
 assert.deepEqual(filtered('runs',data,{impact:[unknown]}).map(row=>row.id),['unknown']);
 assert.deepEqual(filtered('runs',data,{impact:['none']}).map(row=>row.id),['failed-agent']);
});

test('journey identity facets use immutable IDs, and missing numeric sorts remain last',()=>{
 const data={personas:[{id:'p',name:'The parent'}],environments:[{id:'e',name:'Staging'}],runs:[
  {id:'missing',personaId:'p',environmentId:'e'},
  {id:'zero',personaId:'p',durationMs:0,totalTokens:0},
  {id:'long',personaId:'p',durationMs:5000,totalTokens:1000},
 ]};
 const config=collectionFilters('runs',data);
 assert.equal(facet(config,'persona').labelValue('p'),'The parent');
 assert.equal(facet(config,'environment').labelValue('e'),'Staging');
 assert.deepEqual(filtered('runs',data,{persona:['p']},'duration').map(row=>row.id),['long','zero','missing']);
 assert.deepEqual(filtered('runs',data,{},'tokens').map(row=>row.id),['long','zero','missing']);
});

test('finding joins use their own journey and explicit fix links, with legacy impact URL compatibility',()=>{
 const data={runs:[{id:'a',personaId:'parent',environmentId:'home'},{id:'b',personaId:'teacher',environmentId:'school'}],findings:[
  {id:'linked',runId:'a',type:'defect',impact:'high'},
  {id:'same-run-only',runId:'a',type:'experience',impact:'low'},
  {id:'stale-fix',runId:'b',fixId:'missing',impact:'critical'},
 ],fixes:[{id:'fix',findingId:'linked',runId:'a',status:'awaiting_review'}]};
 const config=collectionFilters('findings',data);
 assert.deepEqual(readTableFilterState('?status=high',config.facets,{defaultSort:config.defaultSort}).selections.impact,['high']);
 assert.deepEqual(filtered('findings',data,{persona:['parent'],type:['broken'],fix:['awaiting_review']}).map(row=>row.id),['linked']);
 assert.deepEqual(filtered('findings',data,{fix:['none']}).map(row=>row.id),['same-run-only']);
 assert.deepEqual(filtered('findings',data,{fix:[unknown]}).map(row=>row.id),['stale-fix']);
 assert.deepEqual(filtered('findings',data,{environment:['school']}).map(row=>row.id),['stale-fix']);
});

test('findings retain named persona, journey and device filters outside the loaded history page',()=>{
 const finding={id:'older-finding',runId:'older-run',runName:'Outdated journey name',personaId:'retired-persona',personaName:'retired-persona',sourceRun:{
  id:'older-run',name:'Original checkout',personaId:'retired-persona',personaName:'Maya',deviceSnapshot:{name:'Recorded phone',viewport:{width:390,height:844}},
 }};
 const data={runs:[],personas:[],findings:[finding]},config=collectionFilters('findings',data);
 assert.equal(facet(config,'persona').labelValue('retired-persona'),'Maya');
 assert.equal(facet(config,'journey').labelValue('older-run'),'Original checkout');
 assert.deepEqual(filtered('findings',data,{persona:['retired-persona'],device:['Recorded phone']}).map(row=>row.id),['older-finding']);
 assert.match(config.searchText(finding),/Maya/);
 assert.match(config.searchText(finding),/Recorded phone/);
 assert.match(config.searchText(finding),/Original checkout/);
});

test('finding persona labels prefer recorded names and never present identity keys as names',()=>{
 const finding={personaId:'persona-uuid',personaName:'persona-uuid'},catalog=[{id:'persona-uuid',name:'Alex'}];
 assert.equal(findingPersonaName(finding,{personaId:'persona-uuid',personaName:'persona-uuid'},catalog),'Alex');
 assert.equal(findingPersonaName(finding,{personaSnapshot:{name:'Recorded Alex'}},catalog),'Recorded Alex');
 assert.equal(findingPersonaName(finding,{},[]),'Unknown persona');
});

test('fix source facets join explicit baseline sources and finding IDs without borrowing candidate personas',()=>{
 const data={runs:[{id:'source',personaId:'parent',environmentId:'before'},{id:'support',personaId:'teacher',environmentId:'classroom'},{id:'candidate',personaId:'new-parent',environmentId:'after'}],findings:[{id:'f',runId:'support'}],fixes:[{
  id:'fix',status:'awaiting_review',runId:'source',sourceRunIds:['source'],findingIds:['f'],
  rounds:[{comparison:{pairs:[{beforeRunId:'source',afterRunId:'candidate'}]}}],
 }]};
 assert.deepEqual(filtered('fixes',data,{journey:['source']}).map(row=>row.id),['fix']);
 assert.deepEqual(filtered('fixes',data,{persona:['teacher']}).map(row=>row.id),['fix']);
 assert.deepEqual(filtered('fixes',data,{environment:['classroom']}).map(row=>row.id),['fix']);
 assert.deepEqual(filtered('fixes',data,{journey:['candidate']}),[]);
 assert.deepEqual(filtered('fixes',data,{persona:['new-parent']}),[]);
 assert.deepEqual(filtered('fixes',data,{environment:['after']}),[]);
});

test('unknown fix comments and rounds stay separate from measured zero, and preparing is in progress',()=>{
 const data={fixes:[
  {id:'unknown'},
  {id:'empty',comments:[],rounds:[]},
  {id:'open',comments:[{resolved:false},{resolved:true}],rounds:[{},{}]},
  {id:'preparing',status:'preparing',roundCount:1,openComments:0},
 ]};
 assert.deepEqual(filtered('fixes',data,{comments:[unknown],rounds:[unknown]}).map(row=>row.id),['unknown']);
 assert.deepEqual(filtered('fixes',data,{comments:['none'],rounds:['zero']}).map(row=>row.id),['empty']);
 assert.deepEqual(filtered('fixes',data,{comments:['open'],rounds:['multiple']}).map(row=>row.id),['open']);
 const config=collectionFilters('fixes',data),preset=config.presets.find(item=>item.key==='active');
 assert.deepEqual(filtered('fixes',data,preset.selections).map(row=>row.id),['preparing']);
});

test('issue impact excludes stale ownership, dismissed findings and merged history',()=>{
 const data={issues:[
  {id:'current',findingIds:['high','dismissed','moved','unlinked']},
  {id:'target',findingIds:['moved']},
  {id:'merged',findingIds:['old'],mergedInto:'target'},
  {id:'missing',findingIds:['unavailable']},
 ],findings:[
  {id:'high',issueId:'current',type:'broken',impact:'high'},
  {id:'dismissed',issueId:'current',type:'broken',impact:'critical',triage:'dismissed'},
  {id:'moved',issueId:'target',type:'broken',impact:'critical'},
  {id:'unlinked',issueId:null,type:'broken',impact:'critical'},
  {id:'old',issueId:'merged',type:'broken',impact:'critical'},
 ]};
 assert.deepEqual(filtered('issues',data,{impact:['critical']}).map(row=>row.id),['target']);
 assert.deepEqual(filtered('issues',data,{impact:['high']}).map(row=>row.id),['current']);
 assert.deepEqual(filtered('issues',data,{impact:[unknown]}).map(row=>row.id),['missing']);
 assert.deepEqual(filtered('issues',data,{history:['merged'],impact:['none']}).map(row=>row.id),['merged']);
});

test('issue recurrence requires recorded sightings and presets exclude merged historical records',()=>{
 const data={issues:[
  {id:'unknown',status:'open'},
  {id:'none',status:'open',seen:0},
  {id:'once',status:'open',seen:1},
  {id:'repeated',status:'reopened',seen:2},
  {id:'merged',status:'open',seen:3,mergedInto:'repeated'},
 ]};
 assert.deepEqual(filtered('issues',data,{recurrence:[unknown]}).map(row=>row.id),['unknown']);
 assert.deepEqual(filtered('issues',data,{recurrence:['none']}).map(row=>row.id),['none']);
 const config=collectionFilters('issues',data),preset=config.presets.find(item=>item.key==='recurring');
 assert.deepEqual(filtered('issues',data,preset.selections).map(row=>row.id),['repeated']);
});

test('collection date facets use their own observed or updated date, not related journey timestamps',()=>{
 const now=Date.parse('2026-10-31T12:00:00Z'),recent='2026-10-31T10:00:00Z',old='2026-01-01T00:00:00Z';
 const data={runs:[{id:'r',createdAt:recent}],findings:[{id:'f',runId:'r',createdAt:old}]};
 const findings=collectionFilters('findings',data,now),fixes=collectionFilters('fixes',{},now),issues=collectionFilters('issues',{},now);
 assert.deepEqual(facet(findings,'created').getValues(data.findings[0]),['older']);
 assert.deepEqual(facet(fixes,'updated').getValues({createdAt:old,updatedAt:recent}),['24h','7d','30d']);
 assert.deepEqual(facet(issues,'lastSeen').getValues({createdAt:recent}),[unknown]);
 assert.deepEqual(facet(findings,'created').getValues({}),[unknown]);
});

test('duplicate journey and environment names remain distinguishable in facet choices',()=>{
 const data={environments:[{id:'preview-a',name:'Preview'},{id:'preview-b',name:'Preview'}],runs:[{id:'run-a',name:'First impression'},{id:'run-b',name:'First impression'}]};
 const config=collectionFilters('findings',data),environments=facet(config,'environment'),journeys=facet(config,'journey');
 assert.notEqual(environments.labelValue('preview-a'),environments.labelValue('preview-b'));
 assert.notEqual(journeys.labelValue('run-a'),journeys.labelValue('run-b'));
 assert.match(journeys.labelValue('run-a'),/First impression/);
 assert.equal(facet(collectionFilters('runs',{}),'outcome').labelValue(unknown),'Unknown');
});

test('environment filters do not treat stale readiness as current and keep archived configurations searchable',()=>{
 const data={environments:[
  {id:'ready',name:'Preview',url:'https://preview.example.test',repositoryPath:'/apps/gather',lastCheck:{status:'ready'},updatedAt:'2026-11-01T12:00:00Z'},
  {id:'stale',name:'Staging',lastCheck:{status:'ready',stale:true},repositoryPath:'  ',updatedAt:'2026-11-01T13:00:00Z'},
  {id:'archived',name:'Old preview',archived:true,url:'https://old.example.test',lastCheck:{ok:true}},
  {id:'new',name:'Local',url:'http://localhost:4390'},
 ]};
 assert.deepEqual(filtered('environments',data,{readiness:['ready']}).map(row=>row.id),['ready']);
 assert.deepEqual(filtered('environments',data,{state:['active'],readiness:['stale','not_checked']}).map(row=>row.id),['new','stale']);
 assert.deepEqual(filtered('environments',data,{state:['archived']}).map(row=>row.id),['archived']);
 assert.deepEqual(filtered('environments',data,{source:['configured']}).map(row=>row.id),['ready']);
 const config=collectionFilters('environments',data);
 assert.ok(config.searchText(data.environments[0]).includes('/apps/gather'));
 assert.deepEqual(filtered('environments',data,{state:['active']},'updated').map(row=>row.id),['stale','ready','new']);
});
