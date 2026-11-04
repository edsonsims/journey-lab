import type {Row} from './lib.ts';
import type {CollectionFilterConfig} from './collection-filters.ts';
import {DATE_WINDOW_OPTIONS,dateWindowValues} from './table-filters.ts';
export type LibraryKind='personas'|'charters';
export type AuthorField={key:string;label:string;hint?:string;placeholder?:string;rows?:number};
export type FieldGroup={title:string;description:string;fields:AuthorField[];id?:string;icon?:string};
const f=(key:string,label:string,placeholder='',rows=3,hint=''):AuthorField=>({key,label,placeholder,rows,hint});
export const personaIdentityFields:AuthorField[]=[
 f('name','Name','e.g. Maya · event coordinator',1,'A recognizable name for this persona in the Library and journey results.'),
 f('description','Description','e.g. Organizes small team events and needs to stay within a fixed budget.',2,'A short summary for your team. This note helps identify the profile; it is not part of the persona’s journey instructions.')
];
export const charterIdentityFields:AuthorField[]=[
 f('name','Name','e.g. First activity, zero prep',1,'A recognizable name for this mission in the Library and journey results.'),
 f('description','Description','e.g. Explore how a busy parent finds an activity they can start right away.',2,'A short summary that helps your team choose the right mission.')
];
export const groups:Record<LibraryKind,FieldGroup[]>={
 personas:[
  {id:'perspective',icon:'eye',title:'Point of view',description:'Define why they are here and what they want to achieve.',fields:[
   f('role','Role / perspective','e.g. Event coordinator booking for a small team',1,'Their relationship to the product: customer, coordinator, administrator, or another specific perspective.'),
   f('decision','Decision they are making','e.g. Is this room a good fit for our team and budget?',3,'The choice they are weighing. This explains what they need to feel confident about.'),
   f('mission','Personal goal','e.g. Find and book a room for a 12-person team workshop.',3,'The outcome they want from this visit. Describe the destination and let the persona discover the steps.')
  ]},
  {id:'background',icon:'personas',title:'Their world',description:'Give their choices a believable starting point.',fields:[
   f('context','Context','e.g. Planning next week’s workshop between meetings, without time to call venues.',3,'The situation that brings them here. Include circumstances that influence how they explore and decide.'),
   f('initialKnowledge','Initial knowledge','e.g. Knows the team size and date, but has never used this booking service.',3,'What they know before this visit. Keep hidden product steps, known defects, and proposed fixes out of this brief.'),
   f('skills','Skills','e.g. Comfortable booking online; unfamiliar with event equipment terminology.',3,'Relevant abilities and confidence with similar tasks. Include where they may need clearer guidance.')
  ]},
  {id:'needs',icon:'calibration',title:'Needs & trade-offs',description:'Explain what shapes a good choice for this person.',fields:[
   f('resources','Available resources','e.g. 20 minutes, a $250 budget, and a colleague who can confirm the date.',3,'What they have available: time, budget, equipment, or help. Choose their browser devices in Visit setup.'),
   f('constraints','Constraints','e.g. Cannot spend more than $250 in total or make a phone call during work.',3,'Limits they cannot or will not cross. Be specific about firm boundaries and unavailable resources.'),
   f('expectations','Expectations','e.g. Expects the quoted price to include required fees and equipment.',3,'What they believe the product will offer before exploring. These are this persona’s assumptions.'),
   f('priorities','Priorities','e.g. Staying within budget comes first, then location, then booking speed.',3,'What matters most when choices compete. Put these in order to make trade-offs clear.')
  ]},
  {id:'outcomes',icon:'check',title:'The finish line',description:'Describe when the visit has done enough, or reached a limit.',fields:[
   f('successCriteria','Personal success criteria','e.g. A booking confirmation for 12 people with the total cost at or below $250.',3,'The visible result that would show their personal goal was achieved. Make it possible to check in the journey.'),
   f('stopCriteria','Personal stop criteria','e.g. No suitable room fits the budget, or booking requires a phone call.',3,'The situation that would make them stop or report an obstacle. Explain the limit without predicting a defect.')
  ]}
 ],
 charters:[
  {id:'mission',icon:'charters',title:'The objective',description:'Give the journey a purpose and a starting point.',fields:[
   f('mission','Objective','e.g. Find an age-appropriate activity using materials already at home.',3,'The main task to explore. Required to launch; you can save an unfinished mission. Let the persona discover the steps.'),
   f('goals','Goals','e.g. Understand the materials, setup time, and instructions before choosing.',2,'The questions this journey should help answer. Keep them focused on what the person needs to accomplish.'),
   f('startingState','Starting state','e.g. Start on the home page, signed out, with no saved activities.',2,'The account, test data, and entry conditions the journey should begin with. Describing them here does not create or configure them.')
  ]},
  {id:'boundaries',icon:'coverage',title:'The boundaries',description:'Define where to explore and which actions fit the brief.',fields:[
   f('scope','Scope','e.g. Activity discovery and instructions. Exclude billing and account settings.',2,'What belongs in this exploration, and what to leave out.'),
   f('allowedActions','Allowed actions','e.g. Browse, filter, and open activities. Do not submit a purchase.',2,'Actions the persona is instructed to take. Environment permissions and execution limits still apply.'),
   f('screens','Screens in scope','Home\nActivity results\nActivity details',2,'Screen names or URL patterns, one per line. These guide the exploration; they are not a network allowlist.'),
   f('flows','Flows in scope','Discover an activity\nReview materials and instructions',2,'User tasks or flows to explore, one per line. Describe the task without prescribing every click.'),
   f('expectedBehaviorSources','Expected behavior & sources','e.g. Activity details should show all required materials. Source: product brief, “Activity details” section.',2,'Expected product behavior and the requirement, document, or URL that supports it. Give enough context to assess what happens.')
  ]},
  {id:'outcomes',icon:'check',title:'The finish line',description:'Make success and stopping points easy to recognize.',fields:[
   f('successCriteria','Success criteria','e.g. An appropriate activity is selected, with clear materials and steps.',2,'The visible result that would establish success for this mission.'),
   f('stopCriteria','Stop criteria','e.g. No suitable activity is available, or continuing requires payment.',2,'When the persona should stop and report what happened, even if the goal is unfinished.')
  ]}
 ]
};
export const fieldsFor=(kind:LibraryKind):AuthorField[]=>[f('name','Name','',1),f('description','Description'),...groups[kind].flatMap(group=>group.fields)];
const arrays=new Set(['screens','flows','personaIds','compatibleEnvironmentIds','memoryIds','deviceIds']);
const nullableNumbers=new Set(['maxSteps','maxTokens','maxDurationMs']);
const nullableFlags=new Set(['allowMutations','captureBodies']);
export function editableRecord(kind:LibraryKind,source:Row={}):Row{
 const result:Row={};
 for(const field of fieldsFor(kind))result[field.key]=arrays.has(field.key)?(Array.isArray(source[field.key])?source[field.key].join('\n'):String(source[field.key]||'')):String((field.key==='initialKnowledge'&&!Object.hasOwn(source,'initialKnowledge')?source.knowledge:source[field.key])??'');
 if(kind==='personas')Object.assign(result,{continuity:source.continuity||'first-time',deviceIds:[...(source.deviceIds||[])],primaryDeviceId:source.primaryDeviceId||'',networkProfileId:source.networkProfileId||''});
 else {
  result.defaultEnvironmentId=source.defaultEnvironmentId||'';result.personaIds=[...(source.personaIds||[])];result.compatibleEnvironmentIds=[...(source.compatibleEnvironmentIds||[])];
  for(const key of nullableNumbers)result[key]=source[key]??'';
  for(const key of nullableFlags)result[key]=source[key]==null?'inherit':String(source[key]);
  result.memoryIds=[...(source.memoryIds||[])];result.memoryPolicy=source.memoryPolicy||'none';result.scenarioId=source.scenarioId||'';
 }
 return result;
}
export function authorPayload(kind:LibraryKind,form:Row):Row{
 const data=editableRecord(kind,{});
 for(const key of Object.keys(data)){
  const value=form[key];
  if(arrays.has(key))data[key]=Array.isArray(value)?[...value]:String(value||'').split('\n').map(v=>v.trim()).filter(Boolean);
  else if(nullableNumbers.has(key))data[key]=value===''||value==null?null:Number(value);
  else if(nullableFlags.has(key))data[key]=value==='inherit'||value==null?null:value===true||value==='true';
  else data[key]=typeof value==='string'?value.trim():value;
 }
 return data;
}
export function displayValue(value:any):string{
 if(value==null||value==='')return 'Not set';
 if(Array.isArray(value))return value.length?value.join('\n'):'Not set';
 if(typeof value==='object')return JSON.stringify(value,null,2);
 return String(value);
}
export function fieldChanges(kind:LibraryKind,before:Row,after:Row){
 const a=authorPayload(kind,editableRecord(kind,before)),b=authorPayload(kind,editableRecord(kind,after));
 const names:Record<string,string>={...Object.fromEntries(fieldsFor(kind).map(f=>[f.key,f.label])),deviceIds:'Devices',primaryDeviceId:'Primary device',networkProfileId:'Network profile',continuity:'Visit mode',defaultEnvironmentId:'Default environment',compatibleEnvironmentIds:'Compatible environments',personaIds:'Suggested personas',maxSteps:'Step limit',maxTokens:'Token limit',maxDurationMs:'Duration limit (ms)',allowMutations:'Test-data changes',captureBodies:'Payload capture',memoryIds:'Selected memory',memoryPolicy:'Memory policy',scenarioId:'Scenario'};
 return Object.keys(b).filter(key=>JSON.stringify(a[key])!==JSON.stringify(b[key])).map(key=>({key,label:names[key]||key,before:a[key],after:b[key]}));
}
export function proposedChanges(kind:LibraryKind,form:Row,draft:Row){
 const allowed=new Set(fieldsFor(kind).map(f=>f.key));
 const safe=Object.fromEntries(Object.entries(draft).filter(([key,value])=>allowed.has(key)&&(typeof value==='string'||(['screens','flows'].includes(key)&&Array.isArray(value)&&value.every(v=>typeof v==='string')))));
 const current=authorPayload(kind,form);
 return fieldChanges(kind,current,{...current,...safe}).filter(change=>Object.hasOwn(safe,change.key));
}
export function runUses(run:Row,kind:LibraryKind,id:string){return kind==='personas'?run.personaId===id||run.persona?.id===id||run.personaSnapshot?.id===id:run.charterId===id||run.charterSnapshot?.id===id;}
export function runVersion(run:Row,kind:LibraryKind){return kind==='personas'?run.personaSnapshot?.version??run.personaVersion??run.persona?.version:run.charterSnapshot?.version??run.charterVersion;}
export function libraryFilters(kind:LibraryKind,runs:Row[]):CollectionFilterConfig{
 return {facets:[
  {key:'state',label:'State',primary:true,getValues:row=>row.archived?'archived':'active',options:[{value:'active',label:'Active'},{value:'archived',label:'Archived'}]},
  ...(kind==='personas'?[{key:'role',label:'Perspective',primary:true,getValues:(row:Row)=>row.role}]:[]),
  {key:'usage',label:'Journey usage',primary:kind==='charters',getValues:row=>runs.some(run=>runUses(run,kind,row.id))?'used':'unused',options:[{value:'used',label:'Used in journeys'},{value:'unused',label:'Not used yet'}]},
  {key:'updated',label:'Updated',single:true,getValues:row=>dateWindowValues(row.updatedAt),options:DATE_WINDOW_OPTIONS}
 ],sorts:[{key:'updated',label:'Recently updated',direction:'desc',getValue:row=>Date.parse(row.updatedAt)||null},{key:'name',label:'Name A–Z',direction:'asc',getValue:row=>row.name},{key:'version',label:'Most versions',direction:'desc',getValue:row=>row.version}],defaultSort:'updated',searchText:row=>Object.values(row).filter(v=>typeof v==='string').join(' '),presets:[{key:'active',label:'Active',selections:{state:['active']}},{key:'unused',label:'Ready for a first journey',selections:{state:['active'],usage:['unused']}},{key:'archived',label:'Archived',selections:{state:['archived']}}]};
}
export function readLocalDraft(storage:Pick<Storage,'getItem'>,key:string,kind:LibraryKind){
 try{const value=JSON.parse(storage.getItem(key)||'null');if(!value||!Number.isInteger(value.baseVersion)||value.baseVersion<0||!value.form||typeof value.form!=='object'||Array.isArray(value.form)||!value.baseForm||typeof value.baseForm!=='object'||Array.isArray(value.baseForm))return null;return {...value,form:editableRecord(kind,value.form),baseForm:editableRecord(kind,value.baseForm)};}catch{return null;}
}
