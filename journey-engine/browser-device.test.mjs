import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {browserContextOptions,effectiveBrowserConditions,networkConditionsMatch,installBrowserNetwork} from './browser-device.mjs';
import {DEVICE_PRESETS} from './device-profiles.mjs';
import {ExperienceRecorder} from './experience-recorder.mjs';
import {parseBrowserCall} from './browser-tools.mjs';

const phone={name:'Fixture phone',browser:'chromium',category:'phone',viewport:{width:390,height:844},screen:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Journey fixture mobile'};
const unlimited={name:'Unthrottled',offline:false,latencyMs:0,downloadMbps:null,uploadMbps:null};
async function fixture(t){
  const requests=[];
  const server=createServer((request,response)=>{
    requests.push(request.url);response.setHeader('cache-control','no-store');
    if(request.url.startsWith('/payload')){response.setHeader('content-type','application/octet-stream');response.end(Buffer.alloc(65536,65));return;}
    response.setHeader('content-type','text/html');response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:3500px}button{position:absolute;left:70px;top:80px;width:180px;height:60px}</style><button>Continue</button><script>window.inputs=[];document.querySelector("button").addEventListener("pointerdown",event=>inputs.push({type:event.pointerType,x:event.clientX,y:event.clientY}));</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  t.after(()=>browser.close());
  return {browser,url:`http://127.0.0.1:${server.address().port}`,requests};
}

test('every seeded device is accepted and historical viewport sessions remain desktop',()=>{
  for(const deviceSnapshot of DEVICE_PRESETS)assert.doesNotThrow(()=>browserContextOptions({deviceSnapshot}));
  const legacy={viewport:{width:390,height:844}};
  assert.deepEqual(browserContextOptions(legacy),{viewport:legacy.viewport});
  assert.equal(effectiveBrowserConditions(legacy).device.hasTouch,false);
  assert.equal(effectiveBrowserConditions(legacy).device.isMobile,false);
  assert.throws(()=>browserContextOptions({deviceSnapshot:{...phone,browser:'webkit'}}),{code:'INVALID_BROWSER_CONFIGURATION'});
  assert.throws(()=>effectiveBrowserConditions({networkProfileSnapshot:{downloadMbps:0}}),{code:'INVALID_BROWSER_CONFIGURATION'});
});

test('comparison uses frozen effective settings, rather than profile names or IDs',()=>{
  const original={deviceId:'a',deviceSnapshot:phone,networkProfileSnapshot:unlimited};
  assert.equal(networkConditionsMatch(original,{...original,deviceId:'b',deviceSnapshot:{...phone,name:'Renamed'}}),true);
  for(const change of [{hasTouch:false},{deviceScaleFactor:2},{screen:{width:400,height:900}},{userAgent:'Different'}])assert.equal(networkConditionsMatch(original,{...original,deviceSnapshot:{...phone,...change}}),false);
  assert.equal(networkConditionsMatch(original,{...original,networkProfileSnapshot:{...unlimited,latencyMs:200}}),false);
});

test('DPR 3 CSS screenshots, normalized clicks and mobile gestures agree on a real page',{timeout:25000},async t=>{
  const {browser,url}=await fixture(t),context=await browser.newContext(browserContextOptions({deviceSnapshot:phone}));
  const recorder=await ExperienceRecorder.install(context),page=await context.newPage();await page.goto(url);
  const actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,ratio:devicePixelRatio,touch:navigator.maxTouchPoints,agent:navigator.userAgent,coarse:matchMedia('(pointer:coarse)').matches}));
  assert.deepEqual(actual,{width:390,height:844,ratio:3,touch:1,agent:'Journey fixture mobile',coarse:true});
  const screenshot=await page.screenshot({type:'png',scale:'css'});
  assert.equal(screenshot.readUInt32BE(16),390);assert.equal(screenshot.readUInt32BE(20),844);
  const action=parseBrowserCall({type:'function_call',call_id:'tap-1',name:'browser_click',arguments:JSON.stringify({x:410,y:130})},{width:390,height:844});
  const hit=await recorder.perform(page,action,{hasTouch:true,expectedLabel:'Continue'});
  assert.equal(hit.target.label,'Continue');
  const inputs=await page.evaluate(()=>inputs);assert.equal(inputs.length,1);assert.equal(inputs[0].type,'touch');assert.ok(Math.abs(inputs[0].x-160)<1);assert.ok(Math.abs(inputs[0].y-110)<1);
  await recorder.perform(page,{type:'scroll',x:195,y:650,scroll_x:0,scroll_y:450},{hasTouch:true});
  await page.waitForFunction(()=>scrollY>100);assert.ok(await page.evaluate(()=>scrollY)>100);
  await context.close();
});

test('HTTP latency and bandwidth are applied in the browser while host requests stay unaffected',{timeout:25000},async t=>{
  const {browser,url}=await fixture(t),context=await browser.newContext({viewport:{width:1280,height:800}});
  const run={networkProfileSnapshot:{name:'Test slow connection',offline:false,latencyMs:200,downloadMbps:0.25,uploadMbps:1}};
  const network=await installBrowserNetwork(context,run);t.after(()=>network.dispose());
  await context.route('**/*',async route=>{await network.ready(route.request().frame().page());await route.continue();});
  const page=await context.newPage();await network.ready(page);await page.goto(url);
  const started=performance.now();
  assert.equal(await page.evaluate(async()=>new Uint8Array(await (await fetch('/payload?slow')).arrayBuffer()).length),65536);
  const elapsed=performance.now()-started;assert.ok(elapsed>=1200,`64 KiB download took only ${elapsed} ms despite 0.25 Mbps cap`);
  const hostStarted=performance.now();assert.equal((await (await fetch(`${url}/payload?host`)).arrayBuffer()).byteLength,65536);
  assert.ok(performance.now()-hostStarted<elapsed,'Node HTTP traffic must remain outside browser throttling');
  const second=await context.newPage();await network.ready(second);await second.goto(url);
  const secondStarted=performance.now();await second.evaluate(async()=>await (await fetch('/payload?second')).arrayBuffer());assert.ok(performance.now()-secondStarted>=1200,'Additional browser pages keep the frozen network conditions');
  network.assertHealthy();await network.dispose();await context.close();
});

test('offline blocks initial navigation and HTTP in browser pages but not the model host process',{timeout:15000},async t=>{
  const {browser,url,requests}=await fixture(t),context=await browser.newContext({viewport:{width:1280,height:800}});
  const network=await installBrowserNetwork(context,{networkProfileSnapshot:{...unlimited,offline:true}}),page=await context.newPage();
  await network.ready(page);await assert.rejects(page.goto(`${url}/offline`),/ERR_INTERNET_DISCONNECTED/);
  assert.equal(requests.includes('/offline'),false);await page.waitForFunction(()=>navigator.onLine===false);
  const second=await context.newPage();await network.ready(second);await assert.rejects(second.goto(`${url}/offline-second`),/ERR_INTERNET_DISCONNECTED/);
  assert.equal((await fetch(`${url}/host-online`)).status,200);assert.equal(requests.includes('/host-online'),true);
  await network.dispose();await context.close();
});

test('a failed requested network emulation fails closed',async()=>{
  const page={isClosed:()=>false},context={setOffline:async()=>{},on(){},off(){},pages:()=>[],newCDPSession:async()=>({send:async()=>{throw Error('Unavailable protocol');}})};
  const network=await installBrowserNetwork(context,{networkProfileSnapshot:unlimited});
  await assert.rejects(network.ready(page),{code:'NETWORK_EMULATION_FAILED'});assert.throws(()=>network.assertHealthy(),{code:'NETWORK_EMULATION_FAILED'});await network.dispose();
});
