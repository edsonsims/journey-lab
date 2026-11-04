import test from 'node:test';
import assert from 'node:assert/strict';
import {NAV_GROUPS,groupForSection,navigationHref,navigationGroups,pageLabelForSection} from './workspace-navigation.ts';

test('dashboard and every existing collection remain reachable from exactly one main section',()=>{
 assert.deepEqual(NAV_GROUPS.map(group=>group.key),['runs','insights','library','settings']);
 const leaves=NAV_GROUPS.flatMap(group=>group.items.map(item=>item.key));
 assert.equal(new Set(leaves).size,leaves.length);
 assert.deepEqual([...leaves].sort(),['dashboard','guide','runs','impact','findings','issues','fixes','coverage','experience','charters','personas','competitors','memory','calibration','environments','integrations','devices','network-profiles'].sort());
});

test('collection and detail section keys keep their parent, including settings aliases and unknown-route fallback',()=>{
 assert.equal(groupForSection('dashboard').key,'settings');
 for(const section of ['runs','findings','issues','fixes'])assert.equal(groupForSection(section).key,'runs');
 for(const section of ['impact','coverage','experience'])assert.equal(groupForSection(section).key,'insights');
 assert.deepEqual(NAV_GROUPS.find(group=>group.key==='insights').items.map(item=>item.key),['experience','impact','coverage']);
 for(const section of ['charters','personas'])assert.equal(groupForSection(section).key,'library');
 for(const section of ['devices','environments','network-profiles','integrations','memory','competitors','calibration','dashboard','guide'])assert.equal(groupForSection(section).key,'settings');
 assert.deepEqual(NAV_GROUPS.find(group=>group.key==='settings').items.map(item=>item.key),['devices','environments','network-profiles','integrations','memory','competitors','calibration','dashboard','guide']);
 for(const section of [null,undefined,'','unrecognized'])assert.equal(groupForSection(section).key,'runs');
});

test('navigation scopes the dashboard and existing collections to the selected project',()=>{
 const base='/projects/product%20two';
 assert.equal(navigationHref(base,'dashboard'),'/projects/product%20two/dashboard');
 assert.equal(navigationHref(base,'fixes'),`${base}/fixes`);
 assert.equal(navigationHref(base,'impact'),`${base}/impact`);
 assert.equal(navigationHref(`${base}/`,'personas'),`${base}/personas`);
 assert.equal(navigationHref(base,'devices'),`${base}/settings/devices`);
 assert.equal(navigationHref(base,'network-profiles'),`${base}/settings/network-profiles`);
 assert.equal(navigationHref(base,'environments'),`${base}/settings/environments`);
 assert.equal(navigationHref(`${base}//`,'integrations'),`${base}/settings/integrations`);
 for(const group of NAV_GROUPS)assert(navigationHref(base,group.items[0].key).startsWith(`${base}/`));
});

 test('Home is global and the guided example belongs only to Gather',()=>{
 assert.equal(pageLabelForSection('home'),'Home');
 assert.equal(pageLabelForSection('dashboard'),'App overview');
 assert.equal(pageLabelForSection('guide'),'Guided example');
 assert.equal(groupForSection('guide').key,'settings');
 assert(navigationGroups('gather').find(group=>group.key==='settings').items.some(item=>item.key==='guide'));
 for(const project of ['little-steps','product-two',''])assert(!navigationGroups(project).some(group=>group.items.some(item=>item.key==='guide')));
});
