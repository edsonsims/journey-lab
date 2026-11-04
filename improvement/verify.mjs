#!/usr/bin/env node
import { chromium } from '../journey-engine/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRINT_SCENARIO, verifyPrintCandidate } from './print-contract.mjs';
import { PREVIEW_CSP } from '../journey-engine/improvements-api.mjs';
import { productFingerprint, sameProductFingerprint } from '../journey-engine/product-integrity.mjs';

const home = resolve(fileURLToPath(new URL('.',import.meta.url)),'workspaces');
export async function verify(id) {
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Informe o identificador do experimento.');
const base=join(home,id), candidate=join(base,'candidate'), statusPath=join(base,'status.json');
let server, browser;
const results=[];
function pass(name) { results.push({name,status:'passed'}); }
try {
  const status=JSON.parse(await readFile(statusPath,'utf8'));
  if(status.experimentId!==id || status.status!=='awaiting_review')throw new Error('A candidata ainda não está pronta para verificação.');
  const verifiedFingerprint = await productFingerprint(candidate);
  server=createServer(async(req,res)=>{try{if(req.method!=='GET'){res.writeHead(405);return res.end();}const path=resolve(candidate,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'' )||'index.html');if(!path.startsWith(candidate+sep)){res.writeHead(403);return res.end();}const buf=await readFile(path);res.writeHead(200,{'content-security-policy':PREVIEW_CSP,'x-content-type-options':'nosniff','Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'text/plain'});res.end(buf);}catch{res.writeHead(404);res.end();}});
  await new Promise(resolvePromise=>server.listen(0,'127.0.0.1',resolvePromise));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.JOURNEY_BROWSER_CHANNEL||'chrome'});
  if (status.scenarioId === PRINT_SCENARIO) {
    const checked = await verifyPrintCandidate({browser,origin,pass,results});
    if (!sameProductFingerprint(verifiedFingerprint, await productFingerprint(candidate))) throw Error('A candidata mudou durante a verificação.');
    status.verification={candidateFingerprint:verifiedFingerprint,status:'passed',at:new Date().toISOString(),checks:results,blockedExternalRequests:checked.blockedRequests,limitations:'Verificação funcional independente dos dois formatos. O reteste com Muse Wonder e pessoas é separado.'};
    await writeFile(statusPath,JSON.stringify(status,null,2),{mode:0o600});return status.verification;
  }
  const ctx=await browser.newContext({viewport:{width:1280,height:800}}); let blockedRequests=0;
  await ctx.route('**/*',route=>{let isLocal=false;try{isLocal=new URL(route.request().url()).origin===origin}catch{}if(!isLocal || route.request().method()!=='GET'){blockedRequests++;return route.abort()}return route.continue()});
  const page=await ctx.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const entry=page.getByTestId('guest-start'); if(!await entry.isVisible())throw new Error('A entrada da demonstração sem cadastro não está visível.');
  const signup=page.locator('a[href$="signup.html"]').first(); if(!await signup.isVisible())throw new Error('O caminho para cadastro não está visível.');
  await entry.click(); if(new URL(page.url()).pathname.endsWith('/signup.html'))throw new Error('A entrada de demonstração ainda leva ao cadastro.');
  await page.locator('#age').selectOption({label:'6–8 years'});await page.locator('#interest').selectOption({label:'Animals'});
  await page.locator('#setup-form button[type="submit"]').click();
  await page.locator('#activity-title').waitFor({state:'visible'});
  const interest=await page.locator('#activity-interest').innerText(), age=await page.locator('#activity-age').innerText();
  if(!interest.includes('Animals')||!age.includes('6–8'))throw new Error('O resultado não reflete idade e interesse escolhidos.');
  pass('Demonstração sem cadastro alcança resultado com as duas escolhas');
  const body=(await page.locator('body').innerText()).toLowerCase();
  // Avoid claiming semantic validation of copy: check explicit temporary wording is present somewhere in the flow.
  const copy=await readFile(join(candidate,'index.html'),'utf8'); const setup=await readFile(join(candidate,'setup.html'),'utf8');
  if(!/guest|demo|preview|try/i.test(copy)||!/temporar|browser|not saved|not stored|session/i.test(copy+' '+setup+' '+body))throw new Error('Não foi encontrada uma explicação clara do caráter temporário da demonstração.');
  pass('Existe texto sobre a demonstração e seu caráter temporário');
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('a[href$="signup.html"]').first().click();
  await page.locator('#name').fill('Demo Parent');await page.locator('#email').fill('demo@example.test');await page.locator('#password').fill('demo-only-123');
  await page.locator('#signup-form button[type="submit"]').click();await page.locator('#setup-form').waitFor({state:'visible'});
  pass('Fluxo fictício de cadastro continua acessível');
  if(errors.length)throw new Error(`Erro de JavaScript no navegador: ${errors[0]}`);
  pass('Nenhum erro de JavaScript durante os percursos');
  await ctx.close();
  if (!sameProductFingerprint(verifiedFingerprint, await productFingerprint(candidate))) throw Error('A candidata mudou durante a verificação.');
  status.verification={candidateFingerprint:verifiedFingerprint,status:'passed',at:new Date().toISOString(),checks:results,blockedExternalRequests:blockedRequests,limitations:'Verificação de demonstração local; não mede comportamento de pessoas nem confirma melhoria de conversão.'};
  await writeFile(statusPath,JSON.stringify(status,null,2),{mode:0o600});return status.verification;
} catch(e) { results.push({name:'Verificação do percurso',status:'failed',message:String(e.message||e).slice(0,500)});try{const status=JSON.parse(await readFile(statusPath,'utf8'));status.verification={status:'failed',at:new Date().toISOString(),checks:results};await writeFile(statusPath,JSON.stringify(status,null,2),{mode:0o600});}catch{}return {status:'failed',checks:results}; }
finally { await browser?.close().catch(()=>{});if(server)await new Promise(r=>server.close(r)); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result=await verify(process.argv[2] || ''); console.log(JSON.stringify(result,null,2)); if(result.status!=='passed')process.exitCode=1; }
  catch(error) { console.error(error.message); process.exitCode=2; }
}
