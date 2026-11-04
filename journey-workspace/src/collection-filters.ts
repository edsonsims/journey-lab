import {recordedDevice,recordedNetwork} from './device-context.ts';
import {findingPersonaName} from './finding-display.ts';
import {configuredEnvironments,configuredEnvironment,presentEnvironment,environmentLabel} from './environment-context.ts';
import {duration,label,list,ongoing,outcome,person,title,totals} from './lib.ts';
import type {Row} from './lib.ts';
import {fixOpenComments,fixRoundCount,IMPACT_ORDER} from './collection-summary-metrics.ts';
import {buildRunAttention} from './run-attention.ts';
import {DATE_WINDOW_OPTIONS,UNKNOWN_FILTER_VALUE,dateWindowValues} from './table-filters.ts';
import type {FacetDefinition,FacetOption,SortDefinition} from './table-filters.ts';

export type FilterCollection='runs'|'findings'|'issues'|'fixes'|'environments';
export type CollectionFilterConfig={
 facets:FacetDefinition<Row>[];
 sorts:SortDefinition<Row>[];
 defaultSort:string;
 searchText:(row:Row)=>string;
 presets:{key:string;label:string;selections:Record<string,string[]>}[];
};

const text=(value:unknown):string|null=>typeof value==='string'&&value.trim()?value:null;
const ids=(value:unknown):string[]=>Array.isArray(value)?value.filter((entry):entry is string=>text(entry)!==null):[];
const unique=(values:string[])=>[...new Set(values)];
const finite=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const timestamp=(value:unknown):number|null=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const words=(...values:unknown[])=>values.filter(value=>typeof value==='string'||typeof value==='number').join(' ');
function distinctLabels(labels:Map<string,string>):Map<string,string>{
 const counts=new Map<string,number>();
 for(const name of labels.values())counts.set(name,(counts.get(name)||0)+1);
 const result=new Map([...labels].map(([id,name])=>[id,(counts.get(name)||0)>1?`${name} · ${id.slice(0,8)}`:name]));
 const shortenedCounts=new Map<string,number>();
 for(const name of result.values())shortenedCounts.set(name,(shortenedCounts.get(name)||0)+1);
 for(const [id,name] of result)if((shortenedCounts.get(name)||0)>1)result.set(id,`${labels.get(id)} · ${id}`);
 return result;
}
const statusOptions=(values:string[],names:Record<string,string>={}):FacetOption[]=>values.map(value=>({value,label:names[value]||label(value)}));
const impacts:FacetOption[]=IMPACT_ORDER.map(value=>({value,label:label(value),tone:value}));
const impactOptions=[...impacts,{value:'none',label:'No findings'}];
const fixStates=['prepared','queued','preparing','running','generating','verifying','retesting','awaiting_review','approved','changes_requested','rejected','failed','interrupted','invalidated','cancelled'];
const activeFixStates=['queued','preparing','running','generating','verifying','retesting'];
const issueOpenStates=['open','investigating','fix_in_progress','awaiting_verification','reopened'];
const severity=(values:string[])=>{
 const ranks=values.filter(value=>IMPACT_ORDER.includes(value as typeof IMPACT_ORDER[number])).map(value=>IMPACT_ORDER.length-IMPACT_ORDER.indexOf(value as typeof IMPACT_ORDER[number]));
 return ranks.length?Math.max(...ranks):values.includes('none')?0:null;
};

function runImpacts(run:Row):string[]{
 const counts=run.impactCounts;
 if(!counts||typeof counts!=='object'||Array.isArray(counts))return [UNKNOWN_FILTER_VALUE];
 const known=Object.entries(counts).every(([key,value])=>IMPACT_ORDER.includes(key as typeof IMPACT_ORDER[number])&&finite(value)!==null);
 const values=IMPACT_ORDER.filter(impact=>finite(counts[impact])!==null&&counts[impact]>0);
 return values.length?[...values,...(known?[]:[UNKNOWN_FILTER_VALUE])]:[known?'none':UNKNOWN_FILTER_VALUE];
}

/** Configuration uses recorded associations. Candidate videos never become source journeys. */
export function collectionFilters(kind:FilterCollection,data:Row,now=Date.now()):CollectionFilterConfig{
 const runs=list(data.runs).map(run=>presentEnvironment(run,list(data.environments))),findings=list(data.findings),fixes=list(data.fixes);
 const runById=new Map(runs.filter(row=>text(row.id)).map(row=>[row.id,row]));
 const findingById=new Map(findings.filter(row=>text(row.id)).map(row=>[row.id,row]));
 const identityLabels=(collection:Row[],key:'persona'|'environment'|'charter')=>{
  const labels=new Map<string,string>();
  for(const run of runs){const id=text(run[`${key}Id`]);if(id)labels.set(id,run[`${key}Name`]||id);}
  for(const row of collection){const id=text(row.id);if(id)labels.set(id,row.name||row.label||labels.get(id)||id);}
  return labels;
 };
 const personaLabels=identityLabels(list(data.personas),'persona');
 const environmentLabels=identityLabels(configuredEnvironments(data.environments),'environment');
 const charterLabels=identityLabels(list(data.charters),'charter');
 const runLabels=new Map(runs.filter(run=>text(run.id)).map(run=>[run.id,title(run)]));
 const identityFacet=(key:string,name:string,values:(row:Row)=>string|string[]|null|undefined,labels:Map<string,string>):FacetDefinition<Row>=>{const distinct=distinctLabels(labels);return {key,label:name,getValues:values,labelValue:value=>value===UNKNOWN_FILTER_VALUE?'Unknown':distinct.get(value)||value};};
 const dateFacet=(key:string,name:string,read:(row:Row)=>unknown):FacetDefinition<Row>=>({key,label:name,single:true,options:DATE_WINDOW_OPTIONS,getValues:row=>dateWindowValues(read(row),now)});
 const newest=(key:string,name:string,read:(row:Row)=>unknown,direction:'asc'|'desc'='desc'):SortDefinition<Row>=>({key,label:name,direction,getValue:row=>timestamp(read(row))});
 const alpha:SortDefinition<Row>={key:'name',label:'Name A–Z',direction:'asc',getValue:row=>text(row.name||row.title||row.observation)};
 const sourceRunIds=(fix:Row)=>unique([
  ...(text(fix.runId)?[fix.runId]:[]),...ids(fix.sourceRunIds),
  ...unique([...(text(fix.findingId)?[fix.findingId]:[]),...ids(fix.findingIds)]).map(id=>findingById.get(id)?.runId).filter((id):id is string=>text(id)!==null),
 ]);
 const sourceValues=(fix:Row,key:'personaId'|'environmentId')=>{
  const sources=sourceRunIds(fix);
  return sources.length?unique(sources.map(id=>text(runById.get(id)?.[key])||UNKNOWN_FILTER_VALUE)):[UNKNOWN_FILTER_VALUE];
 };
 const relatedFixes=(finding:Row)=>fixes.filter(fix=>fix.id===finding.fixId||fix.findingId===finding.id||ids(fix.findingIds).includes(finding.id));
 const findingRun=(finding:Row)=>finding.sourceRun?presentEnvironment(finding.sourceRun,list(data.environments)):runById.get(finding.runId);
 if(kind==='findings')for(const finding of findings){
  const run=findingRun(finding)||{},personaId=text(run.personaId)||text(finding.personaId),name=findingPersonaName(finding,run,list(data.personas));
  if(personaId&&(!personaLabels.has(personaId)||personaLabels.get(personaId)===personaId))personaLabels.set(personaId,name);
  if(text(finding.runId))runLabels.set(finding.runId,run.name||finding.runName||title({...run,personaName:name}));
 }
 const linkedFixStates=(finding:Row)=>{
  const linked=relatedFixes(finding);
  return linked.length?unique(linked.map(fix=>text(fix.status)||UNKNOWN_FILTER_VALUE)):[text(finding.fixId)?UNKNOWN_FILTER_VALUE:'none'];
 };
 const linkedFindings=(issue:Row)=>{
  if(issue.mergedInto)return [];
  const listed=new Set(ids(issue.findingIds)),nested=list(issue.findings),nestedIds=new Set(nested.map(row=>row.id));
  const candidates=new Map(nested.filter(row=>text(row.id)).map(row=>[row.id,row]));
  for(const finding of findings)if(finding.issueId===issue.id||listed.has(finding.id)||nestedIds.has(finding.id))candidates.set(finding.id,finding);
  return [...candidates.values()].filter(finding=>{
   if(['dismissed','duplicate'].includes(finding.triage)||finding.type&& !['broken','defect'].includes(finding.type))return false;
   if(finding.issueId!==undefined)return finding.issueId===issue.id;
   return listed.has(finding.id)||nestedIds.has(finding.id);
  });
 };
 const issueImpacts=(issue:Row)=>{
  const linked=linkedFindings(issue),values=unique(linked.map(finding=>text(finding.impact)||UNKNOWN_FILTER_VALUE));
  const missing=ids(issue.findingIds).some(id=>!findingById.has(id)&&!list(issue.findings).some(finding=>finding.id===id));
  if(missing&&!issue.mergedInto)values.push(UNKNOWN_FILTER_VALUE);
  return unique(values.length?values:Array.isArray(issue.findingIds)||Array.isArray(issue.findings)||issue.mergedInto?['none']:[UNKNOWN_FILTER_VALUE]);
 };

 if(kind==='environments')return {
  defaultSort:'name',
  facets:[
   {key:'state',label:'State',primary:true,options:[{value:'active',label:'Active',tone:'positive'},{value:'archived',label:'Archived',tone:'neutral'}],getValues:row=>row.archived?'archived':'active'},
   {key:'readiness',label:'Readiness',primary:true,options:statusOptions(['ready','reachable','blocked','unreachable','failed','stale','not_checked'],{stale:'Needs a new check',not_checked:'Not checked'}),getValues:row=>row.lastCheck?.stale?'stale':text(row.lastCheck?.status)||(row.lastCheck?.reachable===true||row.lastCheck?.ok===true?'reachable':row.lastCheck?.reachable===false||row.lastCheck?.ok===false?'unreachable':'not_checked'),labelValue:label},
   {key:'source',label:'Source',options:[{value:'configured',label:'Source configured'},{value:'missing',label:'No source configured'}],getValues:row=>text(row.repositoryPath)?'configured':'missing'},
   dateFacet('updated','Updated',row=>row.updatedAt||row.createdAt),
  ],
  sorts:[alpha,newest('updated','Recently updated',row=>row.updatedAt||row.createdAt)],
  searchText:row=>words(row.name,row.label,row.url,row.repositoryPath,row.id,row.description),
  presets:[{key:'active',label:'Active environments',selections:{state:['active']}},{key:'archived',label:'Archived environments',selections:{state:['archived']}},{key:'unchecked',label:'Needs a check',selections:{state:['active'],readiness:['stale','not_checked']}}],
 };
 if(kind==='runs'){
  const attention=buildRunAttention(data);
  return {
   defaultSort:'attention',
   facets:[
    {key:'status',label:'Status',primary:true,options:statusOptions(['active','queued','running','finalizing','finished','completed','failed','interrupted','cancelled','cancelling','incomplete','blocked'],{active:'In progress',blocked:'Runner blocked'}),getValues:row=>text(row.status)?unique([row.status,...(ongoing(row.status)?['active']:[])]):null},
    {key:'impact',label:'Impact',primary:true,options:impactOptions,getValues:runImpacts},
    identityFacet('persona','Persona',row=>text(row.personaId),personaLabels),
    identityFacet('environment','Environment',row=>configuredEnvironment(row,list(data.environments))?.id,environmentLabels),
    identityFacet('charter','Mission',row=>text(row.charterId),charterLabels),
    {key:'device',label:'Device',getValues:row=>recordedDevice(row).name},
    {key:'network',label:'Network',getValues:row=>recordedNetwork(row).name},
    {key:'outcome',label:'Outcome',getValues:row=>text(outcome(row)),labelValue:value=>value===UNKNOWN_FILTER_VALUE?'Unknown':value==='obstacle_observed'?'Obstacle observed':label(value)},
    {key:'attention',label:'Attention',single:true,options:[{value:'critical',label:'Critical findings',tone:'critical'},{value:'review',label:'Fixes to review',tone:'warning'},{value:'blocked',label:'Blocked journeys',tone:'warning'},{value:'none',label:'No priority flag'}],getValues:row=>{const reason=attention.byRun.get(row.id);if(!reason)return null;const values=[...(reason.criticalFindingIds.length?['critical']:[]),...(reason.reviewFixIds.length?['review']:[]),...(reason.blocked?['blocked']:[])];return values.length?values:['none'];}},
    dateFacet('created','Started',row=>row.createdAt),
   ],
   sorts:[{key:'attention',label:'Attention first',direction:'asc',getValue:row=>attention.byRun.get(row.id)?.rank??null},newest('newest','Newest first',row=>row.createdAt),newest('oldest','Oldest first',row=>row.createdAt,'asc'),{key:'impact',label:'Highest impact',direction:'desc',getValue:row=>severity(runImpacts(row))},{key:'duration',label:'Longest journey',direction:'desc',getValue:row=>finite(duration(row))},{key:'tokens',label:'Most tokens',direction:'desc',getValue:row=>finite(totals(row))}],
   searchText:row=>words(title(row),row.id,person(row),environmentLabel(row,list(data.environments),''),row.charterName,row.target,recordedDevice(row).name,recordedNetwork(row).name),
   presets:[{key:'blocked',label:'Blocked journeys',selections:{attention:['blocked']}},{key:'active',label:'In progress',selections:{status:['active']}},{key:'high-impact',label:'High impact',selections:{impact:['critical','high']}}],
  };
 }
 if(kind==='findings')return {
  defaultSort:'newest',
  facets:[
   {key:'impact',label:'Impact',aliases:['status'],primary:true,options:impacts,getValues:row=>text(row.impact)},
   {key:'type',label:'Type',primary:true,options:statusOptions(['broken','experience','product','business','unclassified']),getValues:row=>row.type==='defect'?'broken':text(row.type)},
   {key:'triage',label:'Review',options:statusOptions(['unreviewed','accepted','dismissed','duplicate']),getValues:row=>text(row.triage)},
   identityFacet('journey','Journey',row=>text(row.runId),runLabels),
   identityFacet('persona','Persona',row=>text(findingRun(row)?.personaId)||text(row.personaId),personaLabels),
   identityFacet('environment','Environment',row=>text(findingRun(row)?.environmentId),environmentLabels),
   {key:'device',label:'Device',getValues:row=>recordedDevice(findingRun(row)||{}).name},
   {key:'fix',label:'Fix state',options:[{value:'none',label:'No linked fix'},...statusOptions(fixStates)],getValues:linkedFixStates},
   dateFacet('created','Observed',row=>row.createdAt),
  ],
  sorts:[newest('newest','Newest first',row=>row.createdAt),{key:'impact',label:'Highest impact',direction:'desc',getValue:row=>severity(text(row.impact)?[row.impact]:[])},newest('oldest','Oldest first',row=>row.createdAt,'asc'),alpha],
  searchText:row=>words(row.title,row.observation,row.personaComment,row.id,row.runId,row.runName,row.type,findingPersonaName(row,findingRun(row),list(data.personas)),runLabels.get(row.runId),recordedDevice(findingRun(row)||{}).name,findingRun(row)?.environmentName),
  presets:[{key:'high-impact',label:'High impact',selections:{impact:['critical','high']}},{key:'unreviewed',label:'Unreviewed',selections:{triage:['unreviewed']}},{key:'broken',label:'Broken',selections:{type:['broken']}}],
 };
 if(kind==='fixes')return {
  defaultSort:'updated',
  facets:[
   {key:'status',label:'Status',primary:true,options:statusOptions(fixStates),getValues:row=>text(row.status)},
   {key:'comments',label:'Comments',primary:true,options:[{value:'open',label:'Open comments'},{value:'none',label:'No open comments'},{value:UNKNOWN_FILTER_VALUE,label:'Not recorded'}],getValues:row=>{const count=fixOpenComments(row);return count===null?UNKNOWN_FILTER_VALUE:count>0?'open':'none';}},
   {key:'rounds',label:'Rounds',options:[{value:'zero',label:'No rounds'},{value:'one',label:'First round'},{value:'multiple',label:'Multiple rounds'},{value:UNKNOWN_FILTER_VALUE,label:'Not recorded'}],getValues:row=>{const count=fixRoundCount(row);return count===null?UNKNOWN_FILTER_VALUE:count===0?'zero':count===1?'one':'multiple';}},
   identityFacet('journey','Source journey',row=>sourceRunIds(row),runLabels),
   identityFacet('persona','Persona',row=>sourceValues(row,'personaId'),personaLabels),
   identityFacet('environment','Environment',row=>sourceValues(row,'environmentId'),environmentLabels),
   dateFacet('updated','Updated',row=>row.updatedAt||row.createdAt),
  ],
  sorts:[newest('updated','Recently updated',row=>row.updatedAt||row.createdAt),newest('oldest','Oldest first',row=>row.createdAt,'asc'),{key:'comments',label:'Most open comments',direction:'desc',getValue:fixOpenComments},{key:'rounds',label:'Most rounds',direction:'desc',getValue:fixRoundCount},alpha],
  searchText:row=>words(row.title,row.id,row.summary,row.findingId,...sourceRunIds(row).flatMap(id=>{const run=runById.get(id);return [id,run?title(run):'',run?person(run):'',run?.environmentName];})),
  presets:[{key:'review',label:'Needs review',selections:{status:['awaiting_review']}},{key:'comments',label:'Open comments',selections:{comments:['open']}},{key:'active',label:'In progress',selections:{status:activeFixStates}}],
 };
 return {
  defaultSort:'last_seen',
  facets:[
   {key:'status',label:'Status',primary:true,options:statusOptions([...issueOpenStates,'resolved','dismissed']),getValues:row=>text(row.status)},
   {key:'impact',label:'Impact',primary:true,options:impactOptions,getValues:issueImpacts},
   {key:'recurrence',label:'Recurrence',options:[{value:'repeated',label:'Multiple journeys'},{value:'once',label:'One journey'},{value:'none',label:'No current sightings'},{value:UNKNOWN_FILTER_VALUE,label:'Not recorded'}],getValues:row=>{const count=finite(row.seen);return count===null?UNKNOWN_FILTER_VALUE:count>1?'repeated':count===1?'once':'none';}},
   {key:'history',label:'History',options:[{value:'active',label:'Current issues'},{value:'merged',label:'Merged history'}],getValues:row=>row.mergedInto?'merged':'active'},
   dateFacet('lastSeen','Last seen',row=>row.lastSeen),
  ],
  sorts:[newest('last_seen','Last seen recently',row=>row.lastSeen),newest('newest','Newest first',row=>row.createdAt),{key:'seen',label:'Most journeys affected',direction:'desc',getValue:row=>finite(row.seen)},alpha],
  searchText:row=>words(row.title,row.name,row.id,row.description,...linkedFindings(row).flatMap(finding=>[finding.title,finding.observation,finding.runId])),
  presets:[{key:'open',label:'Open issues',selections:{status:issueOpenStates,history:['active']}},{key:'recurring',label:'Recurring',selections:{recurrence:['repeated'],history:['active']}},{key:'resolved',label:'Resolved',selections:{status:['resolved'],history:['active']}}],
 };
}
