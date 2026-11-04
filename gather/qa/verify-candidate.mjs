import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from '../../journey-engine/node_modules/playwright/index.mjs';
import {staticPreview,sourceManifest,manifestHash} from '../../journey-engine/workspace-fix-runtime.mjs';

const EXPECTED={atlas:{name:'Atlas',base:220,projectorFee:35,serviceFee:25,total:280},willow:{name:'Willow',base:235,projectorFee:0,serviceFee:10,total:245}};
const PURPOSE='Quarterly planning';
const STORAGE='gather-reservations-v1';
const safeLabel=value=>String(value||'candidate').replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,60);
const escapeRegExp=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const errorText=error=>String(error?.message||error).slice(0,2000);

/** Independent real-browser verification. No model calls or Journey Lab mutations. */
export async function verifyGatherCandidate({directory,url,outputDir,label='candidate',negativeControl=null,browserChannel=process.env.JOURNEY_BROWSER_CHANNEL||'chrome'}={}){
  if(Boolean(directory)===Boolean(url))throw Error('Provide exactly one directory or URL.');
  if(negativeControl&&!['base','proposal'].includes(negativeControl))throw Error('Negative control must be base or proposal.');
  let preview,browser,sourceHash=null,sourceFiles=null;
  const startedAt=new Date().toISOString();
  outputDir=resolve(outputDir||join('gather/qa/results',safeLabel(label)+'-'+startedAt.replaceAll(':','-')));
  await mkdir(outputDir,{recursive:true});
  const receipt={schemaVersion:1,kind:'gather-functional-candidate-verification',label,startedAt,status:'running',source:{directory:directory?resolve(directory):null,url:null,hash:null},fixture:{purpose:PURPOSE,people:12,projector:true,date:'Tomorrow',slot:'10:00–11:00',prices:EXPECTED},checks:[],artifacts:[],sessions:[],limitations:['Deterministic browser checks are not Muse Wonder journeys or human experience measurements.','Action counts measure this scripted functional path, not human or model speed.']};
  const check=(id,passed,details={})=>{receipt.checks.push({id,passed:Boolean(passed),...details});return Boolean(passed);};
  const screenshot=async(page,name)=>{const path=join(outputDir,name+'.png');await page.screenshot({path,fullPage:true});receipt.artifacts.push({name,path});};
  const click=async(page,name,session)=>{await page.getByRole('button',{name,exact:typeof name==='string'}).click();session.actions.push({type:'click',target:String(name)});};
  const nameField=page=>page.getByRole('textbox',{name:/^Meeting name$/i});
  const chooseName=room=>new RegExp('^(?:Choose|Book|Select) '+escapeRegExp(room.name)+'$','i');
  async function chooseFromHome(page,room,session){
    await click(page,chooseName(room),session);
    let direct=true;
    try{await nameField(page).waitFor({state:'visible',timeout:1500});}
    catch{
      direct=false;
      // Continue the baseline negative control to independently verify data correctness.
      // Taking this fallback never makes the quick-flow check pass.
      await click(page,/^See available rooms$/i,session);
      await click(page,chooseName(room),session);
      await nameField(page).waitFor({state:'visible',timeout:5000});
    }
    return direct;
  }
  async function fillName(page,session,value=PURPOSE){await nameField(page).fill(value);session.actions.push({type:'fill',target:'Meeting name',value});}
  async function stored(page){return page.evaluate(key=>{try{return JSON.parse(sessionStorage.getItem(key)||'[]');}catch{return null;}},STORAGE);}
  async function confirm(page,session){
    await click(page,/^Review booking$/i,session);
    await page.getByRole('heading',{name:/^Ready when you are\.$/i}).waitFor();
    await screenshot(page,session.id+'-review');
    await click(page,/^Confirm reservation$/i,session);
    await page.getByRole('heading',{name:/^You.ve got a room\.$/i}).waitFor();
    await screenshot(page,session.id+'-confirmed');
    return stored(page);
  }
  function correctRecord(record,room){
    return Boolean(record&&record.roomId===room.name.toLowerCase()&&record.purpose===PURPOSE&&record.people===12&&record.projector===true&&record.date==='Tomorrow'&&record.slot==='10:00–11:00'&&record.base===room.base&&record.projectorFee===room.projectorFee&&record.serviceFee===room.serviceFee&&record.total===room.total&&record.status==='confirmed'&&typeof record.id==='string'&&record.id.length>0);
  }
  try{
    if(directory){sourceFiles=await sourceManifest(directory);sourceHash=manifestHash(sourceFiles);preview=await staticPreview(directory);url=preview.url;}
    const target=new URL(url);
    if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password)throw Error('Gather verification is restricted to an approved local HTTP preview.');
    receipt.source={directory:directory?resolve(directory):null,url:target.href,hash:sourceHash,files:sourceFiles};
    browser=await chromium.launch({headless:true,channel:browserChannel});
    for(const [id,room] of Object.entries(EXPECTED)){
      const context=await browser.newContext({viewport:{width:1360,height:900}});
      const page=await context.newPage(),session={id,actions:[],pageErrors:[]};receipt.sessions.push(session);
      page.on('pageerror',error=>session.pageErrors.push(errorText(error)));
      try{
        await page.goto(target.href);await page.getByRole('heading',{name:room.name,exact:true}).waitFor();
        const initial=await stored(page);check(id+'.isolated-session',Array.isArray(initial)&&initial.length===0,{observed:initial});
        const roomHeading=page.getByRole('heading',{name:room.name,exact:true});
        const card=roomHeading.locator('xpath=ancestor::article[1]');
        session.cardText=await card.innerText();
        session.totalOnCard=new RegExp('\\$'+room.total+'(?:\\b|$)').test(session.cardText)&&/total|all.in|all charges/i.test(session.cardText);
        const direct=await chooseFromHome(page,room,session);
        const beforePurpose=await page.locator('main').innerText();
        const priceVisible=new RegExp('\\$'+room.total+'(?:\\b|$)').test(beforePurpose)&&/total|all.in|all charges/i.test(beforePurpose);
        check(id+'.early-total',priceVisible,{expected:room.total,observedText:beforePurpose.slice(0,5000),totalOnCard:session.totalOnCard});
        await screenshot(page,id+'-before-purpose');
        await fillName(page,session);const records=await confirm(page,session);
        check(id+'.quick-flow',direct&&session.actions.length===4,{directToName:direct,actions:session.actions,expectedActions:4});
        check(id+'.reservation-correct',Array.isArray(records)&&records.length===1&&correctRecord(records[0],room),{observed:records});
        await page.getByRole('link',{name:/^View my reservations$/i}).click();
        await page.getByRole('heading',{name:/^My reservations\.$/i}).waitFor();await page.reload();
        const persisted=await stored(page),visible=await page.locator('main').innerText();
        check(id+'.persists-on-reload',Array.isArray(persisted)&&persisted.length===1&&correctRecord(persisted[0],room)&&visible.includes(PURPOSE)&&visible.includes(room.name)&&visible.includes('$'+room.total),{observed:persisted,visibleText:visible.slice(0,4000)});
        check(id+'.no-page-errors',session.pageErrors.length===0,{errors:session.pageErrors});
      }catch(error){check(id+'.flow-executed',false,{error:errorText(error)});await screenshot(page,id+'-failure').catch(()=>{});}
      finally{await context.close();}
    }
    const context=await browser.newContext({viewport:{width:1360,height:900}}),page=await context.newPage(),session={id:'room-change',actions:[],pageErrors:[]};receipt.sessions.push(session);
    page.on('pageerror',error=>session.pageErrors.push(errorText(error)));
    try{
      await page.goto(target.href);await page.getByRole('heading',{name:'Atlas',exact:true}).waitFor();
      await chooseFromHome(page,EXPECTED.atlas,session);await fillName(page,session);
      await click(page,/^Review booking$/i,session);await page.getByRole('heading',{name:/^Ready when you are\.$/i}).waitFor();
      await click(page,/^(?:←\s*)?Choose another room$/i,session);await click(page,chooseName(EXPECTED.willow),session);await nameField(page).waitFor({state:'visible'});
      const nameAfterChange=await nameField(page).inputValue();
      check('room-change.preserves-purpose',nameAfterChange===PURPOSE,{expected:PURPOSE,observed:nameAfterChange});
      await screenshot(page,'room-change-preserved-purpose');
      if(nameAfterChange!==PURPOSE)await fillName(page,session); // Keep the failed preservation result; inspect available recovery separately.
      const records=await confirm(page,session);
      check('room-change.correct-recovery',Array.isArray(records)&&records.length===1&&correctRecord(records[0],EXPECTED.willow),{observed:records,refillRequired:nameAfterChange!==PURPOSE});
      check('room-change.no-page-errors',session.pageErrors.length===0,{errors:session.pageErrors});
    }catch(error){check('room-change.flow-executed',false,{error:errorText(error)});await screenshot(page,'room-change-failure').catch(()=>{});}
    finally{await context.close();}
    if(directory)check('source-unchanged',manifestHash(await sourceManifest(directory))===sourceHash,{expectedHash:sourceHash});
    receipt.status=receipt.checks.every(item=>item.passed)?'passed':'failed';
  }catch(error){receipt.status='failed';receipt.error=errorText(error);}
  finally{
    if(browser)await browser.close();if(preview)await preview.close();
    receipt.finishedAt=new Date().toISOString();receipt.passed=receipt.checks.filter(item=>item.passed).length;receipt.failed=receipt.checks.filter(item=>!item.passed).length;
    if(negativeControl){
      const expected=negativeControl==='base'?['atlas.quick-flow','willow.quick-flow']:['atlas.early-total','willow.early-total','room-change.preserves-purpose'];
      const observed=receipt.checks.filter(item=>!item.passed).map(item=>item.id);
      receipt.negativeControl={variant:negativeControl,expectedFailures:expected,observedFailures:observed,matched:!receipt.error&&expected.length===observed.length&&expected.every(id=>observed.includes(id))};
    }
    receipt.receiptPath=join(outputDir,'receipt.json');await writeFile(receipt.receiptPath,JSON.stringify(receipt,null,2));
  }
  return receipt;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2),read=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
  if(args.includes('--help')||(!read('--directory')&&!read('--url'))){
    console.log('node gather/qa/verify-candidate.mjs --directory /absolute/candidate [--output /absolute/results] [--label candidate]\nOr use --url http://127.0.0.1:PORT/ .\nFor known controls only: --negative-control base|proposal. Actual acceptance failures remain failures in the receipt.');
  }else{
    const receipt=await verifyGatherCandidate({directory:read('--directory'),url:read('--url'),outputDir:read('--output'),label:read('--label')||read('--negative-control')||'candidate',negativeControl:read('--negative-control')});
    console.log(JSON.stringify({status:receipt.status,passed:receipt.passed,failed:receipt.failed,negativeControl:receipt.negativeControl,receiptPath:receipt.receiptPath,error:receipt.error}));
    if(receipt.negativeControl?!receipt.negativeControl.matched:receipt.status!=='passed')process.exitCode=1;
  }
}
