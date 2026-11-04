import test from 'node:test';
import assert from 'node:assert/strict';
import {UNKNOWN_FILTER_VALUE,DATE_WINDOW_OPTIONS,readTableFilterState,writeTableFilterState,buildTableFilterModel,dateWindowValues} from './table-filters.ts';

const state=(selections={},query='',sort='newest')=>({selections,query,sort});
const facets=[
 {key:'impact',label:'Impact',getValues:row=>row.impact,options:[{value:'critical',label:'Critical'},{value:'high',label:'High'},{value:'low',label:'Low'}]},
 {key:'status',label:'Status',getValues:row=>row.status},
];
const rows=[
 {id:'a',name:'Mãe · First impression',impact:'critical',status:'open'},
 {id:'b',name:'Teacher · Before',impact:'high',status:'open'},
 {id:'c',name:'Teacher · After',impact:'high',status:'resolved'},
 {id:'d',name:'Parent · After',impact:'low',status:'open'},
];
const model=(selections={},query='')=>buildTableFilterModel({rows,facets,state:state(selections,query),searchText:row=>row.name});

test('facet choices use OR within a category and AND across categories without mutating records',()=>{
 const before=structuredClone(rows);
 assert.deepEqual(model({impact:['critical','high'],status:['open']}).rows.map(row=>row.id),['a','b']);
 assert.deepEqual(model({impact:['critical'],status:['resolved']}).rows,[]);
 assert.deepEqual(rows,before);
});

test('contextual counts honor search and other facets but ignore their own selected choices',()=>{
 const result=model({impact:['critical'],status:['open']});
 const impact=Object.fromEntries(result.facets[0].options.map(option=>[option.value,option.count]));
 const statuses=Object.fromEntries(result.facets[1].options.map(option=>[option.value,option.count]));
 assert.deepEqual(impact,{critical:1,high:1,low:1});
 assert.deepEqual(statuses,{open:1,resolved:0});
 const searched=model({status:['open']},'TEACHER');
 assert.equal(searched.facets[0].options.find(option=>option.value==='high').count,1);
 assert.equal(searched.facets[1].options.find(option=>option.value==='resolved').count,1);
 assert.equal(searched.total,4);
});

test('multi-value rows count once per option and unknown remains distinct from an explicit none value',()=>{
 const definitions=[{key:'links',label:'Links',getValues:row=>row.links}];
 const input=[{links:['one','one','two']},{links:['two']},{links:[]},{links:'none'}];
 const result=buildTableFilterModel({rows:input,facets:definitions,state:state({links:[UNKNOWN_FILTER_VALUE]}),searchText:()=>''});
 assert.equal(result.rows.length,1);
 assert.deepEqual(Object.fromEntries(result.facets[0].options.map(option=>[option.value,option.count])),{[UNKNOWN_FILTER_VALUE]:1,none:1,one:1,two:2});
 assert.equal(result.facets[0].options.find(option=>option.value===UNKNOWN_FILTER_VALUE).label,'Not recorded');
});

test('selected values missing from current data remain removable with zero counts',()=>{
 const result=model({impact:['retired-value']});
 assert.deepEqual(result.rows,[]);
 assert.deepEqual(result.facets[0].options.find(option=>option.value==='retired-value'),{value:'retired-value',label:'retired-value',count:0,selected:true});
 assert.equal(result.activeCount,1);assert.equal(result.activeFacetCount,1);
 assert.equal(model({},' ').queryActive,false);
});

test('dynamic options sort by displayed names while declared order and stale selected values remain intact',()=>{
 const names={'id-1':'Zoe','id-9':'anna','id-2':'Journey 10','id-8':'Journey 2','stale-id':'Béatrice'};
 const definition={key:'persona',label:'Persona',getValues:row=>row.persona,labelValue:value=>names[value]||value,
  options:[{value:'pinned-z',label:'Z first'},{value:'pinned-a',label:'A second'}]};
 const input=['id-1','id-9','id-2','id-8','id-9'].map(persona=>({persona}));
 const result=buildTableFilterModel({rows:input,facets:[definition],state:state({persona:['stale-id']}),searchText:()=>''});
 assert.deepEqual(result.facets[0].options.map(option=>option.label),['Z first','A second','anna','Béatrice','Journey 2','Journey 10','Zoe']);
 assert.equal(result.facets[0].options.find(option=>option.value==='id-9').count,2);
 assert.deepEqual(result.facets[0].options.find(option=>option.value==='stale-id'),{value:'stale-id',label:'Béatrice',count:0,selected:true});
});

test('text search is case and accent insensitive and matches all whitespace-separated terms',()=>{
 assert.deepEqual(model({},'  MAE first ').rows.map(row=>row.id),['a']);
 assert.deepEqual(model({},'before teacher').rows.map(row=>row.id),['b']);
 assert.deepEqual(model({},'teacher parent').rows,[]);
 assert.equal(model({},'teacher').activeCount,1);
});

test('URL reads preserve old links, deduplicate repeated values and constrain single-choice facets',()=>{
 const definitions=[{...facets[0],aliases:['status']},{key:'when',label:'When',single:true,getValues:()=>[]}];
 const settings={defaultSort:'attention'};
 assert.deepEqual(readTableFilterState('?status=critical&status=high&q=Teacher&when=7d&when=30d',definitions,settings),state({impact:['critical','high'],when:['7d']},'Teacher','attention'));
 assert.deepEqual(readTableFilterState('?impact=low&impact=low&status=critical&sort=oldest',definitions,settings),state({impact:['low']},'','oldest'));
 assert.deepEqual(readTableFilterState('?impact=&status=critical',definitions,settings).selections,{});
});

test('URL writes preserve unrelated route state, canonicalize aliases, and retain typed spaces',()=>{
 const definitions=[{...facets[0],aliases:['status']},{key:'attention',label:'Attention',single:true,getValues:()=>[]}];
 const before=new URLSearchParams('tab=findings&at=5000&status=critical&q=old&sort=oldest');
 const next=writeTableFilterState(before,state({impact:['high','critical','high'],attention:['review','blocked']},'teacher ','attention'),definitions,{defaultSort:'attention'});
 assert.equal(before.get('status'),'critical');
 assert.equal(next.get('tab'),'findings');assert.equal(next.get('at'),'5000');
 assert.equal(next.has('status'),false);assert.equal(next.has('sort'),false);
 assert.deepEqual(next.getAll('impact'),['high','critical']);assert.deepEqual(next.getAll('attention'),['review']);
 assert.equal(next.get('q'),'teacher ');
 const cleared=writeTableFilterState(next,state({},'','newest'),definitions,{defaultSort:'attention'});
 assert.deepEqual([...cleared], [['tab','findings'],['at','5000'],['sort','newest']]);
});

test('numeric sorting is stable and keeps absent, invalid and blank values last in both directions',()=>{
 const input=[{id:'missing'},{id:'zero',value:0},{id:'two-a',value:2},{id:'nan',value:NaN},{id:'blank',value:''},{id:'two-b',value:2},{id:'infinity',value:Infinity}];
 for(const [direction,expected] of [['asc',['zero','two-a','two-b']],['desc',['two-a','two-b','zero']]]){
  const result=buildTableFilterModel({rows:input,facets:[],state:state({},'','value'),searchText:()=>'',sorts:[{key:'value',label:'Value',direction,getValue:row=>row.value}]});
  assert.deepEqual(result.rows.map(row=>row.id),[...expected,'missing','nan','blank','infinity']);
 }
 assert.equal(input[0].id,'missing');
});

test('text sorting is natural, case insensitive, and uses the first configured sort for an obsolete URL key',()=>{
 const input=[{id:'ten',name:'Journey 10'},{id:'two-a',name:'journey 2'},{id:'two-b',name:'Journey 2'}];
 const result=buildTableFilterModel({rows:input,facets:[],state:state({},'','removed-sort'),searchText:()=>'',sorts:[{key:'name',label:'Name',direction:'asc',getValue:row=>row.name}]});
 assert.deepEqual(result.rows.map(row=>row.id),['two-a','two-b','ten']);assert.equal(result.sortKey,'name');
});

test('date windows use exact rolling boundaries and keep future and missing timestamps explicit',()=>{
 const day=86_400_000,now=Date.parse('2026-10-31T12:00:00Z');
 assert.deepEqual(dateWindowValues(now,now),['24h','7d','30d']);
 assert.deepEqual(dateWindowValues(now-day,now),['24h','7d','30d']);
 assert.deepEqual(dateWindowValues(now-day-1,now),['7d','30d']);
 assert.deepEqual(dateWindowValues(now-7*day,now),['7d','30d']);
 assert.deepEqual(dateWindowValues(now-7*day-1,now),['30d']);
 assert.deepEqual(dateWindowValues(now-30*day,now),['30d']);
 assert.deepEqual(dateWindowValues(now-30*day-1,now),['older']);
 assert.deepEqual(dateWindowValues(now+1,now),['future']);
 for(const value of [null,undefined,'','not-a-date',NaN,Infinity])assert.deepEqual(dateWindowValues(value,now),[UNKNOWN_FILTER_VALUE]);
 assert.deepEqual(dateWindowValues('2026-10-30T12:00:00Z',now),['24h','7d','30d']);
 assert.deepEqual(DATE_WINDOW_OPTIONS.map(option=>option.value),['24h','7d','30d','older','future',UNKNOWN_FILTER_VALUE]);
});

test('empty collections retain configured options and selected stale values without inventing matches',()=>{
 const result=buildTableFilterModel({rows:[],facets,state:state({status:['missing']},'search'),searchText:()=>''});
 assert.deepEqual(result.rows,[]);assert.equal(result.total,0);assert.equal(result.activeCount,2);
 assert(result.facets.every(facet=>facet.options.every(option=>option.count===0)));
 assert.equal(result.facets[1].options[0].selected,true);
});
