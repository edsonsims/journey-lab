import test from 'node:test';
import assert from 'node:assert/strict';
import {impactOrigin,formatImpactDate,comparisonLabels} from './impact-origin.ts';

const proposed={kind:'pull_request',state:'proposed',provider:'github',repository:'team/product',number:42,url:'https://github.com/team/product/pull/42',createdAt:'2026-11-01T12:15:00Z',baseRef:'main',headRef:'booking/quick',baseSha:'123abcd',headSha:'789abcd'};

test('legacy local reviews do not invent PR identities or source event times',()=>{
 const source=impactOrigin({kind:'local_proposal',provider:'not_connected',createdAt:'2026-11-01T23:04:50.456Z',updatedAt:'2026-11-02T01:00:00Z'});
 assert.equal(source.label,'Local proposal');assert.equal(source.href,null);assert.equal(source.sourceEvent.at,null);
 assert.equal(source.assessedAt,'2026-11-01T23:04:50.456Z');assert.equal(source.repository,null);
});
test('proposed PR displays source identity and creation time independently from assessment',()=>{
 const source=impactOrigin({origin:proposed,createdAt:'2026-11-02T01:00:00Z'});
 assert.equal(source.label,'PR #42');assert.equal(source.stateLabel,'Proposed PR');assert.equal(source.href,proposed.url);
 assert.deepEqual(source.sourceEvent,{label:'Proposed',at:'2026-11-01T12:15:00.000Z'});
 assert.equal(source.baseRef,'main');assert.equal(source.headRef,'booking/quick');assert.match(source.searchText,/team\/product/);
 assert.equal(source.assessedAt,'2026-11-02T01:00:00.000Z');
});
test('merged PR uses only supplied merge time and keeps the candidate separate from source status',()=>{
 const record={origin:{...proposed,state:'merged',mergedAt:'2026-11-01T18:15:00-05:00',mergeSha:'456abcd'},createdAt:'2026-11-02T01:00:00Z'};
 assert.equal(impactOrigin(record).stateLabel,'Merged PR');assert.equal(impactOrigin(record).sourceEvent.at,'2026-11-01T23:15:00.000Z');
 assert.equal(impactOrigin(record).mergeSha,'456abcd');
 assert.deepEqual(comparisonLabels(record,'proposal'),{before:'Before change',after:'Merged change'});
 assert.deepEqual(comparisonLabels(record,'repair'),{before:'Merged change',after:'Fixed candidate'});
 assert.equal(impactOrigin({...record,origin:{...record.origin,mergedAt:null}}).sourceEvent.at,null);
});
test('unsafe or mismatched links are never exposed as PR destinations',()=>{
 for(const url of ['javascript:alert(1)','http://github.com/team/product/pull/42','https://user:secret@github.com/team/product/pull/42','https://github.com/team/product/pull/43','https://github.com/team/product/pull/42?token=abc','https://github.com/team/product/pull/42#token'])assert.equal(impactOrigin({origin:{...proposed,url}}).href,null,url);
 assert.equal(impactOrigin({origin:{...proposed,repository:'team/../product'}}).href,null);
 assert.equal(impactOrigin({origin:{...proposed,provider:'unknown'}}).href,null);
 assert.equal(impactOrigin({origin:{...proposed,number:0}}).href,null);
});
test('GitLab group paths and explicit self-hosted PR URLs remain usable',()=>{
 const gitlab={...proposed,provider:'gitlab',repository:'team/platform/product',url:'https://gitlab.example.com/team/platform/product/-/merge_requests/42'};
 assert.equal(impactOrigin({origin:gitlab}).href,gitlab.url);
 const github={...proposed,url:'https://git.example.com/team/product/pull/42'};
 assert.equal(impactOrigin({origin:github}).href,github.url);
});
test('unknown dates and malformed timestamps remain missing, never assessment fallbacks',()=>{
 for(const createdAt of [null,'','yesterday','2026-11-01','2026-11-01T12:15:00','2026-02-30T12:15:00Z']){
  assert.equal(impactOrigin({origin:{...proposed,createdAt},updatedAt:'2026-11-02T01:00:00Z'}).sourceEvent.at,null);
  assert.equal(formatImpactDate(createdAt),'Not recorded');
 }
 assert.notEqual(formatImpactDate(proposed.createdAt),'Not recorded');
});
test('recorded build names remain the comparison labels and inputs are not mutated',()=>{
 const record={origin:proposed,baseline:{label:'Standard booking'},proposal:{label:'Quick booking'}};const before=structuredClone(record);
 assert.deepEqual(comparisonLabels(record,'proposal'),{before:'Standard booking',after:'Quick booking'});
 assert.deepEqual(comparisonLabels(record,'repair'),{before:'Quick booking',after:'Fixed candidate'});
 impactOrigin(record);assert.deepEqual(record,before);
});
