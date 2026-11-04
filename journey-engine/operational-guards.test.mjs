import {retainedFixture} from './retained-test-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createCaptureCapacity} from './capture-capacity.mjs';
import {boundModelRequest,usageTotal} from './model-budget.mjs';

test('capacity gate preserves existing evidence and rechecks available space before capture',async()=>{
  const root=await retainedFixture('journey-capacity-');const path=join(root,'original.webm');await writeFile(path,'original');
  let free=11;const capacity=createCaptureCapacity({root,reserveBytes:10,captureAllowanceBytes:5,readSpace:async()=>({bavail:free,bsize:1,blocks:100})});
  await assert.rejects(capacity.assertAvailable(),{code:'CAPTURE_CAPACITY_LOW'});assert.equal(await readFile(path,'utf8'),'original');
  free=15;assert.equal((await capacity.assertAvailable()).status,'ready');
});
test('unknown capacity fails closed without deleting originals',async()=>{
  const root=await retainedFixture('journey-capacity-');const capacity=createCaptureCapacity({root,readSpace:async()=>{throw Error('unavailable');}});
  assert.equal((await capacity.inspect()).status,'unknown');await assert.rejects(capacity.assertAvailable(),{code:'CAPTURE_CAPACITY_UNKNOWN'});
});
test('model limits reserve bounded output and stop when prior usage is absent or exhausted',()=>{
  const body={model:'muse-wonder-1.0',input:[{role:'user',content:[{type:'input_text',text:'Observe.'},{type:'input_image',image_url:'data:image/png;base64,'+'A'.repeat(100000)}]}]};
  const limited=boundModelRequest(body,{remainingTokens:5000});assert.ok(limited.max_output_tokens>128&&limited.max_output_tokens<1000);
  assert.equal(boundModelRequest(body,{remainingTokens:100000}).max_output_tokens,4096);
  assert.throws(()=>boundModelRequest(body,{remainingTokens:100}),{code:'TOKEN_BUDGET'});
  assert.throws(()=>usageTotal([null]),{code:'USAGE_UNAVAILABLE'});assert.equal(usageTotal([{total_tokens:30},{total_tokens:20}]),50);
});
