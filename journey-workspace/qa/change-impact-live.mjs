import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '../../journey-engine/node_modules/playwright/index.mjs';
import {buildJourneyMatches,applyJourneyReview} from '../src/journey-matching.ts';
import {repairRecordingsComplete} from '../src/change-impact.ts';

// Read-only browser acceptance of the captured Gather run pair. No paid runs,
// reviews, approvals or API mutations are submitted by this check.
const origin='http://127.0.0.1:4319',id='3c976cd2-5a9a-4c58-aef7-a40e4948f5e3';
const output='outputs/gather-impact-ui-qa';await mkdir(output,{recursive:true});
const record=await fetch(`${origin}/api/workspace/change-impacts/${id}?projectId=gather`).then(response=>response.json());
const pair=record.report.pairs.find(item=>item.personaId==='gather-coordinator');
const suggested=buildJourneyMatches(pair.before,pair.after),active=applyJourneyReview(suggested).activeMatches;
const target=suggested.matches.find(match=>suggested.beforeSteps.find(step=>step.id===match.beforeId)?.title==='Clicked “Review booking”');
assert.ok(target,'The actual journeys must include the review-booking suggestion.');
const at=[suggested.beforeSteps.find(step=>step.id===target.beforeId).ms/1000,suggested.afterSteps.find(step=>step.id===target.afterId).ms/1000];
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'}),page=await context.newPage();
let writes=0;const errors=[];
await context.route('**/*',route=>{if(!['GET','HEAD'].includes(route.request().method())){writes++;return route.fulfill({status:403,body:'Read-only QA'});}return route.continue();});
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(`${origin}/projects/gather/impact/${id}?persona=gather-coordinator&stage=proposal`);
 await page.locator('.fix-emotion-comparison').waitFor();
 assert.ok(active.length<2);
 assert.equal(await page.getByRole('button',{name:'Recording time',exact:true}).getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('.comparison-emotion-point.tone-negative,.comparison-emotion-point.tone-very-negative').count()>0);
 assert.equal(await page.getByLabel('Retests recorded',{exact:true}).count(),repairRecordingsComplete(record)?1:0);
 await page.screenshot({path:`${output}/live-maya-full-arcs.png`,fullPage:true});
 await page.locator('.match-recording-context').getByRole('button',{name:/Review matches/}).click();
 const row=page.locator(`[data-review-match="${target.id}"]`);
 assert.match(await row.locator('.match-review-state').innerText(),/Needs review/);
 await row.getByRole('button',{name:'Preview',exact:true}).click();
 await page.waitForFunction(expected=>{const videos=[...document.querySelectorAll('video')];return videos.length===2&&videos.every((video,index)=>Math.abs(video.currentTime-expected[index])<.1&&!video.seeking);},at);
 await page.screenshot({path:`${output}/live-maya-review-moment.png`,fullPage:true});
 const clocks=await page.locator('video').evaluateAll(videos=>videos.map(video=>video.currentTime));
 await page.getByRole('tab',{name:/Proposed.*Repaired/}).click();await page.locator('.fix-emotion-comparison').waitFor();assert.equal(await page.getByRole('button',{name:'Recording time',exact:true}).getAttribute('aria-pressed'),'true');assert.ok(await page.locator('.comparison-emotion-point.tone-negative,.comparison-emotion-point.tone-very-negative').count()>0);await page.screenshot({path:`${output}/live-maya-repair-full-arcs.png`,fullPage:true});
 const report={actualGatherRecords:true,beforeRunId:pair.before.id,afterRunId:pair.after.id,
  checks:{defaultsToFullArcs:true,negativeSignalsVisible:true,retestIndicatorMatchesCompletedMedia:true,weakMatchRemainsUnaccepted:true,reviewBookingPreviewSeeksBoth:true,repairDefaultsToFullArcs:true,repairNegativeMiddleSignalsVisible:true},
  repairRecordingsComplete:repairRecordingsComplete(record),expectedClocks:at,actualClocks:clocks,writes,errors};
 assert.equal(writes,0);assert.deepEqual(errors,[]);
 await writeFile(`${output}/live-review-fixes.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
