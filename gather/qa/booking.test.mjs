import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {chromium} from '../../journey-engine/node_modules/playwright/index.mjs';
import {startGather} from '../serve.mjs';

const output=resolve('gather/qa/results',new Date().toISOString().replaceAll(':','-'));
await mkdir(output,{recursive:true});
const servers=await startGather({basePort:0,proposalPort:0});
const browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
const receipt={createdAt:new Date().toISOString(),baseUrl:servers.base.url,proposalUrl:servers.proposal.url,checks:[],artifacts:[]};
const newPage=async(variant,viewport={width:1360,height:900})=>{
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  await page.goto(servers[variant].url);
  await page.locator('.room-scene img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  assert.equal(await page.locator('.room-scene img').count(),2);
  return {page,context};
};
const click=async(page,name)=>page.getByRole('button',{name,exact:true}).click();
async function choose(page,variant,room){
  if(variant==='base'){await click(page,'Plan a meeting');await click(page,'See available rooms');}
  await click(page,'Choose '+room);
}
async function complete(page,variant,room){
  await choose(page,variant,room);
  await page.getByLabel('Meeting name',{exact:true}).fill('Quarterly planning');
  await click(page,'Review booking');
  await click(page,'Confirm reservation');
  await page.getByRole('heading',{name:'You’ve got a room.',exact:true}).waitFor();
  return page.evaluate(()=>JSON.parse(sessionStorage.getItem('gather-reservations-v1')));
}
const checked=(name,extra={})=>receipt.checks.push({name,passed:true,...extra});

test('all-in pricing is correct and differs from proposal room rates',async()=>{
  for(const variant of ['base','proposal']){
    const {page,context}=await newPage(variant);
    const atlas=page.locator('[data-room="atlas"] .room-price');
    const willow=page.locator('[data-room="willow"] .room-price');
    assert.match(await atlas.innerText(),new RegExp(variant==='base'?'\\$280':'\\$220'));
    assert.match(await willow.innerText(),new RegExp(variant==='base'?'\\$245':'\\$235'));
    const build=await (await page.request.get(servers[variant].url+'/__gather/build')).json();
    assert.match(build.sourceHash,/^[a-f0-9]{64}$/);
    const screenshot=join(output,variant+'-home.png');await page.screenshot({path:screenshot,fullPage:true});receipt.artifacts.push(screenshot);
    await context.close();
  }
  checked('Prices: Atlas 280 total / 220 advertised room rate; Willow 245 / 235');
});
test('baseline coordinator and assistant can persist correct reservations',async()=>{
  for(const [room,total] of [['Willow',245],['Atlas',280]]){
    const {page,context}=await newPage('base');
    const records=await complete(page,'base',room);
    assert.equal(records.length,1);assert.equal(records[0].roomId,room.toLowerCase());assert.equal(records[0].total,total);
    assert.equal(records[0].people,12);assert.equal(records[0].projector,true);assert.equal(records[0].purpose,'Quarterly planning');
    assert.equal(records[0].date,'Tomorrow');assert.equal(records[0].slot,'10:00–11:00');
    await page.getByRole('link',{name:'View my reservations',exact:true}).click();
    assert.match(await page.locator('.booking-item').innerText(),/Quarterly planning/);
    await page.reload();assert.equal(await page.locator('.booking-item').count(),1);
    await context.close();
  }
  checked('Both baseline goals persist correct room, price, requirements and purpose');
});
test('proposal assistant has a shorter valid booking path',async()=>{
  const {page,context}=await newPage('proposal');
  const records=await complete(page,'proposal','Atlas');
  assert.equal(records[0].total,280);assert.ok(records[0].total<=350);
  checked('Proposal assistant Atlas succeeds at 280 within 350', {scriptedActions:{base:6,proposal:4},note:'Deterministic interaction count, not a recorded model or human timing measure.'});
  await context.close();
});
test('proposal exposes late total and loses name on room change; base preserves it',async()=>{
  for(const variant of ['base','proposal']){
    const {page,context}=await newPage(variant);
    await choose(page,variant,'Atlas');
    if(variant==='proposal')assert.equal(await page.locator('[data-booking-total]').count(),0);
    await page.getByLabel('Meeting name',{exact:true}).fill('Quarterly planning');
    await click(page,'Review booking');
    assert.equal(await page.locator('[data-booking-total]').getAttribute('data-booking-total'),'280');
    await click(page,'← Choose another room');
    await click(page,'Choose Willow');
    assert.equal(await page.getByLabel('Meeting name',{exact:true}).inputValue(),variant==='base'?'Quarterly planning':'');
    if(variant==='proposal'){
      await page.getByLabel('Meeting name',{exact:true}).fill('Quarterly planning');
      await click(page,'Review booking');await click(page,'Confirm reservation');
      await page.getByRole('heading',{name:'You’ve got a room.',exact:true}).waitFor();
      const records=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('gather-reservations-v1')));
      assert.equal(records[0].total,245);assert.equal(records[0].roomId,'willow');
    }
    await context.close();
  }
  checked('Late 280 total and lost name are observable; 245 recovery remains available');
});
test('sessions isolate bookings and requirements change actual totals',async()=>{
  const {page,context}=await newPage('base');
  await click(page,'Plan a meeting');await page.getByLabel('We need a projector').uncheck();await click(page,'See available rooms');
  assert.match(await page.locator('[data-room="atlas"] .room-price').innerText(),/\$245/);
  await click(page,'Choose Atlas');await page.getByLabel('Meeting name',{exact:true}).fill('Team catch-up');
  await click(page,'Review booking');await click(page,'Confirm reservation');await page.getByRole('heading',{name:'You’ve got a room.',exact:true}).waitFor();
  const item=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('gather-reservations-v1'))[0]);
  assert.equal(item.total,245);assert.equal(item.projector,false);assert.equal(item.projectorFee,0);
  const independent=await newPage('base');assert.equal(await independent.page.evaluate(()=>sessionStorage.getItem('gather-reservations-v1')),null);
  await independent.context.close();await context.close();
  checked('Bookings isolated per browser session; no-projector total computed correctly');
});
test('desktop and mobile pages render without overflow or console errors',async()=>{
  for(const variant of ['base','proposal'])for(const viewport of [{width:1360,height:900},{width:390,height:844}]){
    const {page,context}=await newPage(variant,viewport);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await choose(page,variant,'Willow');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByLabel('Meeting name',{exact:true}).fill('Quarterly planning');await click(page,'Review booking');
    await page.getByRole('heading',{name:'Ready when you are.',exact:true}).waitFor();
    await page.locator('.mini-scene img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    assert.equal(await page.locator('.mini-scene img').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const screenshot=join(output,variant+'-review-'+viewport.width+'.png');await page.screenshot({path:screenshot,fullPage:true});receipt.artifacts.push(screenshot);
    assert.deepEqual(errors,[]);await context.close();
  }
  checked('1360px and 390px layouts have no horizontal overflow or page errors');
});
test.after(async()=>{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2));await browser.close();await servers.close();console.log('Gather QA receipt: '+join(output,'receipt.json'));});
