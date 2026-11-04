import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gatherIdentity,startGatherVariant,withGatherVariant} from '../serve.mjs';
import {sourceFingerprint} from '../../journey-engine/workspace-execution.mjs';
import {sourceManifest,manifestHash} from '../../journey-engine/workspace-fix-runtime.mjs';

for(const fails of [false,true])test(`owned demo preview stops after ${fails?'failure':'completion'}`,async()=>{
 let target;
 const work=()=>withGatherVariant({variant:'proposal'},async url=>{
  target=url;assert.equal((await fetch(url)).status,200);
  assert.equal((await (await fetch(url+'/__gather/build')).json()).variant,'proposal');
  if(fails)throw Error('Test stopped');return 'recorded';
 });
 if(fails)await assert.rejects(work,/Test stopped/);else assert.equal(await work(),'recorded');
 await assert.rejects(fetch(target,{signal:AbortSignal.timeout(500)}));
});
test('an existing configured server is reused only for the same build and is not stopped by the test',async()=>{
 const server=await startGatherVariant({variant:'base'}),port=Number(new URL(server.url).port);
 try{
  assert.equal(await withGatherVariant({variant:'base',port},async()=> 'done'),'done');
  assert.equal((await fetch(server.url)).status,200);
  await assert.rejects(withGatherVariant({variant:'proposal',port},async()=>assert.fail('wrong build accepted')),/different build/);
 }finally{await server.close();}
});

test('optional room photos are served and hashed without requiring them in legacy builds',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'gather-assets-'));
 let server;
 try{
  await Promise.all(['app.js','index.html','styles.css'].map(name=>writeFile(join(directory,name),name)));
  const legacy=await gatherIdentity(directory,'base');
  assert.deepEqual(legacy.files,await sourceFingerprint(directory));
  assert.equal(legacy.sourceHash,manifestHash(await sourceManifest(directory)));
  server=await startGatherVariant({variant:'base',directory});
  assert.equal((await fetch(server.url+'/assets/atlas.webp')).status,404);
  await mkdir(join(directory,'assets'));
  const photo=Buffer.from('RIFF\x04\x00\x00\x00WEBP','binary');
  await writeFile(join(directory,'assets/atlas.webp'),photo);
  const response=await fetch(server.url+'/assets/atlas.webp');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),photo);
  const head=await fetch(server.url+'/assets/atlas.webp',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const photographed=await (await fetch(server.url+'/__gather/build')).json();
  assert.deepEqual(photographed.files,await sourceFingerprint(directory));
  assert.equal(photographed.sourceHash,manifestHash(await sourceManifest(directory)));
  assert.notEqual(photographed.sourceHash,legacy.sourceHash);
  assert.equal((await fetch(server.url+'/assets/unapproved.webp')).status,404);
 }finally{await server?.close();await rm(directory,{recursive:true,force:true});}
});

test('current Gather manifests match journey and isolated-preview source identities',async()=>{
 for(const variant of ['base','proposal']){
  const directory=fileURLToPath(new URL('../'+variant+'/',import.meta.url));
  const identity=await gatherIdentity(directory,variant);
  assert.deepEqual(identity.files,await sourceFingerprint(directory));
  assert.equal(identity.sourceHash,manifestHash(await sourceManifest(directory)));
  const server=await startGatherVariant({variant,directory});
  try{
   for(const name of Object.keys(identity.files).filter(name=>name.endsWith('.webp'))){
    const response=await fetch(server.url+'/'+name);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(join(directory,name)));
   }
  }finally{await server.close();}
 }
});
