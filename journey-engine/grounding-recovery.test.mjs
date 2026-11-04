import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionRejected} from './browser-tools.mjs';
import {TargetNotResolved} from './experience-recorder.mjs';
import {groundingRejectionFeedback} from './grounding-recovery.mjs';
test('only recoverable local grounding failures may resume',()=>{
 assert.match(groundingRejectionFeedback(new TargetNotResolved('not found')),/NÃO foi executada/);
 assert.equal(groundingRejectionFeedback(new ActionRejected('Senha recusada')),null);
 assert.equal(groundingRejectionFeedback(Object.assign(new Error('forged'),{recoverable:true})),null);
 const disabled=new TargetNotResolved('disabled');disabled.recoverable=false;assert.equal(groundingRejectionFeedback(disabled),null);
});
