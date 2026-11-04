import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceRoute} from './workspace-route.ts';

test('Home is global, apps open Journeys, and explicit overview remains available',()=>{
 assert.deepEqual(workspaceRoute('/'),{projectId:'',section:'home',detailId:undefined,canonicalPath:undefined});
 assert.equal(workspaceRoute('/projects/gather/dashboard').section,'dashboard');
 assert.equal(workspaceRoute('/projects/little-steps').section,'runs');
 assert.equal(workspaceRoute('/projects/gather/guide').section,'guide');
});
test('legacy walkthrough links preserve their chapter while workspace links retain overview',()=>{
 const route=workspaceRoute('/projects/gather/dashboard','?view=story&step=3');
 assert.equal(route.section,'guide');assert.equal(route.canonicalPath,'/projects/gather/guide?step=3');
 const overview=workspaceRoute('/projects/gather/dashboard','?view=workspace');
 assert.equal(overview.section,'dashboard');assert.equal(overview.canonicalPath,'/projects/gather/dashboard');
 assert.equal(workspaceRoute('/projects/little-steps/dashboard','?view=story').canonicalPath,'/projects/little-steps/dashboard');
 assert.equal(workspaceRoute('/projects/little-steps/guide').canonicalPath,'/projects/little-steps/dashboard');
});
test('project identity, detail URLs and nested settings retain their scope',()=>{
 assert.deepEqual(workspaceRoute('/projects/product%20two/settings/environments/env-1'),{projectId:'product two',section:'environments',detailId:'env-1',canonicalPath:undefined});
 assert.deepEqual(workspaceRoute('/projects/gather/runs/run-1','?mode=original&at=0'),{projectId:'gather',section:'runs',detailId:'run-1',canonicalPath:undefined});
 assert.equal(workspaceRoute('/projects/gather/settings').section,'devices');
});
