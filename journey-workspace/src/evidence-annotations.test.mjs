import test from 'node:test';
import assert from 'node:assert/strict';
import {annotationAt,annotationClock,annotationForFrame,annotationForMoment,buildEvidenceAnnotations,containedMediaRect} from './evidence-annotations.ts';

const frame={index:3,type:'screenshot',videoMs:1000,screenshot:'/runs/test/screen-003.png'};
const action={index:4,type:'action',videoMs:3200,action:{type:'click_control',label:'Change room'},click:{x:900,y:600,target:{label:'Change room',tag:'button'}}};
const note={eventIndex:3,actionEventIndex:4,videoMs:2500,valence:'negative',reaction:'The $280 total is over my $250 budget, so I will choose another room.',observation:'Review shows $280 including equipment and the fee.'};
const run=(extra={})=>({id:'test',personaName:'Sam',viewport:{width:1200,height:800},events:[frame,action,{index:5,type:'screenshot',videoMs:3300,screenshot:'/runs/test/screen-005.png'}],experience:[note,{eventIndex:5,videoMs:7000,valence:'positive',reaction:'This fits my budget.'}],...extra});

test('recorded mood and explanation stay tied to their own source',()=>{
 const [cue]=buildEvidenceAnnotations(run());
 assert.equal(cue.tone.key,'negative');assert.equal(cue.ms,2500);assert.equal(cue.screenshot,frame.screenshot);
 assert.match(cue.caption,/\$280.*\$250/);assert.equal(cue.persona,'Sam');
 assert.equal(cue.highlight.label,'Change room');assert.equal(cue.highlight.x,.75);assert.equal(cue.highlight.y,.75);
});

test('seeking does not anticipate reactions and expires them across silence',()=>{
 const cues=buildEvidenceAnnotations(run());
 assert.equal(annotationAt(cues,2499),null);assert.equal(annotationAt(cues,2500).id,'emotion-0');
 assert.equal(annotationAt(cues,2499.9999999).id,'emotion-0','floating point round trips preserve exact links');
 assert.equal(annotationAt(cues,6999).id,'emotion-0');assert.equal(annotationAt(cues,7000).id,'emotion-1');
 assert.equal(annotationAt(cues,16000),null);assert.equal(annotationAt(cues,NaN),null);
 assert.equal(annotationAt(cues,2500).id,'emotion-0','backwards seek restores the right reaction');
});

test('control highlights disappear after the linked action',()=>{
 const cues=buildEvidenceAnnotations(run());
 assert.ok(annotationAt(cues,2500).highlight);assert.equal(annotationAt(cues,3200).highlight,null);
 assert.equal(annotationAt(cues,4000).tone.key,'negative','timestamped subtitle can still be read after a click');
});

test('screenshots use exact frame identity, never a neighboring reaction or matching time alone',()=>{
 const cues=buildEvidenceAnnotations(run());
 assert.equal(annotationForFrame(cues,frame).id,'emotion-0');
 assert.equal(annotationForFrame(cues,{index:6,videoMs:2500}),null);
 assert.equal(annotationForFrame(cues,{index:3,screenshot:'/runs/other/screen-003.png'}),null);
 assert.equal(annotationForFrame(cues,{screenshot:frame.screenshot}).id,'emotion-0');
 assert.equal(annotationForMoment(cues,{eventIndex:3,originalMs:2500}).id,'emotion-0');
 assert.equal(annotationForMoment(cues,{signalIndex:1,originalMs:2500}),null);
});

test('unknown feelings and missing explanations are not filled from findings',()=>{
 const cues=buildEvidenceAnnotations(run({experience:[{eventIndex:3,videoMs:2500,friction:3}],findings:[{eventIndex:3,valence:'very_negative',impact:'critical',title:'Frustrated'}]}));
 assert.equal(cues[0].tone.key,'unrated');assert.equal(cues[0].caption,'');assert.equal(cues[0].detail,'');
 assert.equal(cues[0].highlight,null);
});

test('untimed reactions may annotate their exact screenshot but not playback',()=>{
 const cues=buildEvidenceAnnotations(run({events:[{...frame,videoMs:null}],experience:[{eventIndex:3,valence:'neutral',reaction:'Looking at the room.'}]}));
 assert.equal(cues[0].ms,null);assert.equal(annotationAt(cues,1000),null);
 assert.equal(annotationForFrame(cues,frame).caption,'Looking at the room.');
});

test('condensed playback uses the original clock, including gaps and zero',()=>{
 const source=run({replayMetadata:{segments:[{originalStart:2,originalEnd:4,replayStart:0},{originalStart:7,originalEnd:9,replayStart:2}]}});
 assert.equal(annotationClock(source,'condensed',0),2000);assert.equal(annotationClock(source,'condensed',500),2500);
 assert.equal(annotationAt(buildEvidenceAnnotations(source),annotationClock(source,'condensed',2500)).id,'emotion-1');
 assert.equal(annotationClock(source,'condensed',9000),null);assert.equal(annotationClock(source,'original',0),0);
});

test('rejected, unlinked, out of bounds, and unknown viewport clicks do not get highlights',()=>{
 const variants=[{events:[frame,{...action,type:'action_rejected'}]},{experience:[{...note,actionEventIndex:null}]},{viewport:null},{viewport:{width:0,height:800}},{events:[frame,{...action,click:{...action.click,x:1201}}]}];
 for(const extra of variants)assert.equal(buildEvidenceAnnotations(run(extra))[0].highlight,null);
});

test('new captures outline measured control bounds and old captures use a location marker',()=>{
 const bounds={x:800,y:575,width:200,height:50};
 const [cue]=buildEvidenceAnnotations(run({events:[frame,{...action,click:{...action.click,target:{...action.click.target,bounds}}}]}));
 assert.equal(cue.highlight.x,2/3);assert.equal(cue.highlight.y,575/800);assert.equal(cue.highlight.width,1/6);assert.equal(cue.highlight.height,1/16);
 assert.equal(buildEvidenceAnnotations(run())[0].highlight.width,undefined);
});

test('letterboxing maps portrait and desktop highlights onto the actual pixels',()=>{
 assert.deepEqual(containedMediaRect(1000,500,400,800),{left:375,top:0,width:250,height:500});
 const rect=containedMediaRect(400,400,1200,800);assert.equal(rect.left,0);assert.equal(rect.width,400);
 assert.ok(Math.abs(rect.top-200/3)<.001);assert.ok(Math.abs(rect.height-800/3)<.001);
 assert.equal(containedMediaRect(0,400,1200,800),null);
});

test('structured feedback supplies the recorded reason without inventing an emotion',()=>{
 const [cue]=buildEvidenceAnnotations(run({experience:[{...note,feedback:{kind:'friction',summary:'The final price exceeds the budget.',why:'The room is $220, equipment $35 and service fee $25.'}}]}));
 assert.equal(cue.caption,'The final price exceeds the budget.');assert.equal(cue.detailLabel,'Why');
 assert.equal(cue.detail,'The room is $220, equipment $35 and service fee $25.');assert.equal(cue.tone.key,'negative');
});
