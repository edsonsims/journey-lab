import test from 'node:test';
import assert from 'node:assert/strict';
import {experienceJourneyFingerprint as fingerprint} from './experience-refresh.ts';

test('background headline refresh detects journey completion and newly recorded journeys',()=>{
 const running={id:'r',projectId:'gather',status:'running'},completed={...running,status:'finished',completedAt:'2026-11-01T20:00:00Z'};
 assert.notEqual(fingerprint([running],'gather'),fingerprint([completed],'gather'));
 assert.notEqual(fingerprint([completed],'gather'),fingerprint([completed,{...completed,id:'second'}],'gather'));
 assert.notEqual(fingerprint([{...completed,completedAt:''}],'gather'),fingerprint([completed],'gather'));
});

test('routine bootstrap reordering and unrelated metadata changes do not retrigger experience fetches',()=>{
 const a={id:'a',projectId:'gather',status:'finished',name:'First',updatedAt:'before'},b={id:'b',projectId:'gather',status:'running'};
 assert.equal(fingerprint([a,b],'gather'),fingerprint([b,{...a,name:'Renamed',updatedAt:'after'}],'gather'));
});

test('bootstrap data from another project cannot trigger the selected experience refresh',()=>{
 const own={id:'a',projectId:'gather',status:'finished'},other={id:'b',projectId:'other',status:'running'};
 assert.equal(fingerprint([own],'gather'),fingerprint([own,other],'gather'));
 assert.equal(fingerprint(null,'gather'),'[]');
 assert.equal(fingerprint([null,{},'invalid'],'gather'),'[]');
});
