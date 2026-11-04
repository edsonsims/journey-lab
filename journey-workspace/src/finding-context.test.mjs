import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFindingPath,technicalEvidence,safeDisplay,displayUrl,safeRecord} from './finding-context.ts';

const home='http://127.0.0.1:4319/little-steps/';
const setup=home+'setup.html';
const activity=home+'activity.html';
const shot=(index,videoMs,url,extra={})=>({index,type:'screenshot',videoMs,url,screenshot:`/runs/example/frame-${index}.png`,...extra});
const action=(index,videoMs,url,data,extra={})=>({index,type:'action',videoMs,url,action:data,...extra});

function navigationRun() {
  return {target:home,capturePolicy:{bodies:false},events:[
    shot(0,0,home),
    {index:1,type:'network',videoMs:100,url:setup,method:'GET',status:200,resourceType:'document'},
    action(2,150,setup,{type:'click',label:'Get started'},{click:{target:{label:'Get started',tag:'a'}}}),
    shot(3,200,setup),
    action(4,300,setup,{type:'click',label:'Age range'},{click:{target:{label:'Age range',tag:'select'}}}),
    shot(5,320,setup,{accessibility:{focusedSelect:{label:'Age range'}}}),
    action(6,400,setup,{type:'select_option',label:'6–8 years'},{accessibility:{selectorLabel:'Age range',optionLabel:'6–8 years'}}),
    shot(7,420,setup),
    action(8,500,setup,{type:'click',label:'Interest'},{click:{target:{label:'Interest',tag:'select'}}}),
    shot(9,520,setup),
    action(10,600,setup,{type:'select_option',label:'Space'},{accessibility:{selectorLabel:'Interest',optionLabel:'Space'}}),
    shot(11,620,setup),
    // Captured during navigation, before the settled action event is persisted.
    {index:12,type:'network',videoMs:700,url:activity,method:'GET',status:200,resourceType:'document'},
    action(13,750,activity,{type:'click',label:'Find my activity'},{click:{target:{label:'Find my activity',tag:'button'}}}),
    shot(14,800,activity),
    action(15,900,activity,{type:'click',label:'Print worksheet'},{click:{target:{label:'Print worksheet',tag:'button'}}}),
    shot(16,950,activity),
  ],experience:[
    {eventIndex:11,actionEventIndex:13,observation:'Space is selected. I can request an activity.',reaction:'Ready to try this.'},
    {eventIndex:14,actionEventIndex:15,observation:'It requires a printer.',reaction:'I do not have a printer.'},
  ]};
}

test('path shows navigation, selection context and exact pre-action perspective without future actions',()=>{
  const run=navigationRun(),finding={eventIndex:14,originalMs:800,evidence_indices:[14,16]};
  const path=buildFindingPath(run,finding);
  assert.equal(path.steps[0].kind,'landing');
  assert.equal(path.steps[0].ms,0);
  assert.equal(path.startUrl,home);
  const entered=path.steps.find(step=>step.eventIndex===2);
  assert.equal(entered.fromUrl,home);
  assert.equal(entered.toUrl,setup);
  const selected=path.steps.find(step=>step.eventIndex===10);
  assert.equal(selected.field,'Interest');
  assert.equal(selected.value,'Space');
  const navigation=path.steps.at(-1);
  assert.equal(navigation.eventIndex,13);
  assert.equal(navigation.fromUrl,setup);
  assert.equal(navigation.toUrl,activity);
  assert.equal(navigation.screenshot,'/runs/example/frame-14.png');
  assert.equal(navigation.observation,'Space is selected. I can request an activity.');
  assert.equal(navigation.reaction,'Ready to try this.');
  assert.equal(path.steps.some(step=>step.eventIndex===15),false);
  assert.equal(path.limited,false);
  assert.equal(buildFindingPath(run,finding,{throughEvidence:true}).steps.at(-1).eventIndex,15);
});

test('technical moment includes the preceding navigation request and explicitly linked later screenshots',()=>{
  const result=technicalEvidence(navigationRun(),{eventIndex:14,originalMs:800,evidence_indices:[14,16]},'moment');
  assert.deepEqual(result.network.map(event=>event.index),[12]);
  assert.deepEqual(result.window,{startMs:620,endMs:900});
  assert.equal(result.screenshots.find(event=>event.index===16).linked,true);
  assert.equal(result.screenshots.find(event=>event.index===11).linked,false);
  assert.equal(result.bodyCapture,'off');
  assert.equal(result.payloads.length,0);
  assert.match(result.association,/not proof of cause/);
});

test('typing preserves ordinary test input and qualifies a label inferred from field focus',()=>{
  const run={events:[shot(0,0,setup),
    action(1,50,setup,{type:'click',label:'Task name'},{click:{target:{tag:'input',label:'Task name'}}}),
    action(2,100,setup,{type:'type_text',text:'Trip kit'}),
    action(3,150,setup,{type:'keypress',keys:['Tab']}),
    action(4,200,setup,{type:'type_text',text:'Space explorer'}),
    action(5,250,setup,{type:'type_text',text:'private-password'},{actionContext:{focusedField:{label:'Password',inputType:'password'}}}),
    shot(6,300,setup),
  ]};
  const path=buildFindingPath(run,{eventIndex:6});
  const typed=path.steps.find(step=>step.eventIndex===2);
  assert.equal(typed.field,'Task name');assert.equal(typed.value,'Trip kit');
  assert.match(typed.fieldSource,/Inferred/);assert.match(typed.detail,/not a verified final/);
  const afterTab=path.steps.find(step=>step.eventIndex===4);
  assert.equal(afterTab.field,null);assert.equal(afterTab.value,'Space explorer');
  const password=path.steps.find(step=>step.eventIndex===5);
  assert.equal(password.field,'Password');assert.equal(password.value,'[REDACTED]');
  assert.equal(safeDisplay(path).includes('private-password'),false);
});

test('unknown field labels remain unknown in legacy input events',()=>{
  const run={events:[shot(0,undefined,setup),action(1,undefined,setup,{type:'type_text',text:'Space'}),shot(2,undefined,setup)]};
  const typed=buildFindingPath(run,{eventIndex:2}).steps.at(-1);
  assert.equal(typed.field,null);assert.equal(typed.ms,null);
  assert.equal(typed.title,'Typed into the focused field');
  assert.match(typed.detail,/Field label was not captured/);
});

test('rejected actions are attempts and cannot manufacture navigation or move focus',()=>{
  const run={events:[shot(0,0,setup),
    action(1,50,setup,{type:'click',label:'Child name'},{click:{target:{tag:'input',label:'Child name'}}}),
    {index:2,type:'action_rejected',videoMs:100,url:activity,action:{type:'keypress',keys:['Tab']},message:'Blocked by the runner.'},
    action(3,150,setup,{type:'type_text',text:'Alex'}),shot(4,200,setup),
  ]};
  const path=buildFindingPath(run,{eventIndex:4}),rejected=path.steps.find(step=>step.eventIndex===2);
  assert.equal(rejected.attempted,true);assert.equal(rejected.kind,'rejected');
  assert.equal(rejected.toUrl,setup);assert.match(rejected.title,/Attempted/);
  assert.equal(path.steps.find(step=>step.eventIndex===3).field,'Child name');
});

test('missing anchors never turn into a whole-run path and timestamp anchors omit untimed or later actions',()=>{
  const run={events:[shot(0,0,home),action(1,50,setup,{type:'click',label:'Start'}),
    action(2,undefined,setup,{type:'type_text',text:'Unknown time'}),shot(3,100,setup),
    action(4,200,activity,{type:'click',label:'Future'}),shot(5,250,activity)]};
  const unknown=buildFindingPath(run,{});
  assert.deepEqual(unknown.steps,[]);assert.equal(unknown.limited,true);assert.match(unknown.limitation,/no recorded event/);
  assert.deepEqual(technicalEvidence(run,{},'moment').screenshots,[]);
  const timed=buildFindingPath(run,{originalMs:100});
  assert.equal(timed.limited,true);assert.deepEqual(timed.steps.map(step=>step.eventIndex),[0,1]);
  assert.match(timed.limitation,/timestamp/);
  assert.equal(buildFindingPath(run,{originalMs:0}).steps.length,1);
});

test('post-action screenshots never cross the next action or the finding cutoff',()=>{
  const run={events:[shot(0,0,home),action(1,100,setup,{type:'click',label:'Start'}),action(2,200,activity,{type:'click',label:'Next'}),shot(3,300,activity)]};
  const path=buildFindingPath(run,{eventIndex:2});
  assert.equal(path.steps.find(step=>step.eventIndex===1).screenshot,'/runs/example/frame-0.png');
  assert.equal(path.steps.find(step=>step.eventIndex===2).screenshot,'/runs/example/frame-0.png');
  assert.equal(path.steps.find(step=>step.eventIndex===2).fromUrl,setup);
  assert.equal(path.steps.find(step=>step.eventIndex===2).toUrl,activity);
});

test('a captured password input type takes precedence over an earlier ordinary field label',()=>{
  const run={events:[shot(0,0,setup),
    action(1,50,setup,{type:'click',label:'Task name'},{click:{target:{tag:'input',label:'Task name'}}}),
    action(2,100,setup,{type:'type_text',text:'secret-password'},{actionContext:{focusedField:{inputType:'password'}}}),shot(3,150,setup),
  ]};
  const typed=buildFindingPath(run,{eventIndex:3}).steps.at(-1);
  assert.equal(typed.field,null);assert.equal(typed.value,'[REDACTED]');
});

test('a configured-private field flag redacts input in paths and technical records',()=>{
  const input={index:1,type:'action',videoMs:100,url:setup,action:{type:'type_text',text:'Hidden member detail'},inputContext:{label:'Member notes',tag:'textarea',inputType:'textarea',sensitive:true}};
  const run={events:[shot(0,0,setup),input,shot(2,150,setup)]};
  const typed=buildFindingPath(run,{eventIndex:2}).steps.at(-1);
  assert.equal(typed.field,'Member notes');assert.equal(typed.fieldSource,'Recorded field context');assert.equal(typed.value,'[REDACTED]');
  const rejected={...input,type:'action_rejected'};
  assert.equal(technicalEvidence({events:[rejected]},{},'run').logs[0].action.text,'[REDACTED]');
});

test('payload detection preserves null, false and zero, with browser and runner log channels distinct',()=>{
  const run={capturePolicy:{bodies:true},events:[shot(0,0,home),
    {index:1,type:'network',videoMs:50,url:setup,requestBody:false,responseBody:0},
    {index:2,type:'network',videoMs:70,url:setup,responseBody:null},
    {index:3,type:'console_error',videoMs:80,text:'Rendering failed'},
    {index:4,type:'error',videoMs:90,message:'Runner stopped'},shot(5,100,setup),
  ]};
  const result=technicalEvidence(run,{eventIndex:5},'run');
  assert.equal(result.bodyCapture,'on');assert.equal(result.payloads.length,2);
  assert.equal(result.payloads[0].requestCaptured,true);assert.equal(result.payloads[0].requestBody,false);
  assert.equal(result.payloads[0].responseBody,0);assert.equal(result.payloads[1].responseBody,null);
  assert.equal(result.payloads[1].requestCaptured,false);
  assert.deepEqual(result.logs.map(row=>row.channel),['browser','runner']);
  assert.equal(technicalEvidence({capturePolicy:{bodies:false},events:[]},{},'run').bodyCapture,'off');
  assert.equal(technicalEvidence({events:[]},{},'run').bodyCapture,'unknown');
  assert.equal(technicalEvidence({events:[{type:'network',responseBody:null}]},{},'run').bodyCapture,'on');
});

test('technical copies and URL displays redact secrets without suppressing ordinary test data',()=>{
  const raw='https://user:password@example.test/path?token=supersecret&interest=space#private';
  const url=displayUrl(raw);
  assert.equal(url.includes('user:'),false);assert.equal(url.includes('supersecret'),false);assert.equal(url.includes('#'),false);
  const data=safeRecord({url:raw,requestBody:{authorization:'secret',nested:{password:'hide',count:0,enabled:false,choice:'Space'}},text:'Bearer abc.def.ghi'});
  assert.equal(data.requestBody.authorization,'[REDACTED]');assert.equal(data.requestBody.nested.password,'[REDACTED]');
  assert.equal(data.requestBody.nested.choice,'Space');assert.equal(data.requestBody.nested.enabled,false);
  assert.equal(safeDisplay(data).includes('abc.def.ghi'),false);
  const result=technicalEvidence({events:[{index:0,type:'action_rejected',action:{type:'type_text',text:'private-password'},actionContext:{focusedField:{label:'Password',inputType:'password'}}}]},{},'run');
  assert.equal(result.logs[0].action.text,'[REDACTED]');
});
