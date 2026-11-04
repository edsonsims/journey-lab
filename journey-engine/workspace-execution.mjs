import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { effectiveExecutionPolicy } from './library-context.mjs';

const sensitive = /password|passwd|secret|authorization|cookie|token|api.?key|credential|session|email|phone|address|birth|card|ssn/i;
export function redactText(value, secrets = []) {
  let text = String(value ?? '').slice(0, 16000);
  for (const secret of secrets.filter(x => typeof x === 'string' && x.length > 3)) text = text.split(secret).join('[REDACTED]');
  return text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(["']?(?:password|secret|token|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi, '$1[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
}
export function safeUrl(value) {
  try { const url = new URL(value); url.username = ''; url.password = ''; url.hash = ''; for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, '[REDACTED]'); return url.href; } catch { return '[invalid URL]'; }
}
export function redactJson(value, secrets = [], depth = 0) {
  if (depth > 8) return '[DEPTH LIMIT]';
  if (Array.isArray(value)) return value.slice(0, 100).map(x => redactJson(x, secrets, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k, v]) => [k, sensitive.test(k) ? '[REDACTED]' : redactJson(v, secrets, depth + 1)]));
  return typeof value === 'string' ? redactText(value, secrets) : value;
}

export function allowedOriginsFor(run) {
  const target = new URL(run.target);
  const configured = run.environmentSnapshot?.allowedOrigins || run.environment?.allowedOrigins || [];
  const origins = new Set([target.origin]);
  for (const item of Array.isArray(configured) ? configured : []) { try { const u = new URL(item); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) origins.add(u.origin); } catch {} }
  return origins;
}
export function requestAllowed(run, value, method = 'GET') {
  try {
    method = String(method).toUpperCase();
    if(method==='DELETE')return false;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowedOriginsFor(run).has(url.origin)) return false;
    if (!effectiveExecutionPolicy(run).allowMutations && !['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
    if (!run.projectId && run.comparisonId && !url.pathname.startsWith(new URL(run.target).pathname)) return false;
    return true;
  } catch { return false; }
}

export async function installCaptureMask(context, extraSelectors = []) {
  const selectors = ['input[type="password"]', '[autocomplete="one-time-code"]', '[autocomplete^="cc-"]', '[data-private]', '[data-sensitive]', 'input[name*="token" i]', 'input[name*="secret" i]', ...extraSelectors.filter(x => typeof x === 'string' && x.length < 200)];
  await context.addInitScript(({ selectors }) => {
    const install = () => {
      if (!document.documentElement || document.getElementById('journey-lab-private-mask')) return;
      const style = document.createElement('style'); style.id = 'journey-lab-private-mask';
      style.textContent = selectors.map(s => `${s}{visibility:hidden!important}`).join('\n');
      document.documentElement.append(style);
    };
    install(); new MutationObserver(install).observe(document, { childList: true, subtree: true });
  }, { selectors });
}

const excluded = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage', '.tools', 'runs', 'workspaces', 'outputs', 'data']);
export async function sourceFingerprint(directory) {
  if (!directory) return null;
  const root = resolve(directory), result = {};
  if (!(await lstat(root)).isDirectory()) throw new Error('Source directory is unavailable.');
  let count = 0;
  async function walk(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || excluded.has(entry.name) || entry.name.startsWith('.') || /(?:secret|credential|storage.?state)|\.(?:pem|key|p12|db|sqlite|webm|mp4|png|jpe?g|woff2?|zip)$/i.test(entry.name)) continue;
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (++count > 6000) throw new Error('Source snapshot exceeds the supported file limit.');
      if (entry.isDirectory()) await walk(join(dir,entry.name),name);
      else if (entry.isFile()) { const info = await lstat(join(dir,entry.name)); if (info.size > 2_000_000) continue; result[name] = createHash('sha256').update(await readFile(join(dir,entry.name))).digest('hex'); }
    }
  }
  await walk(root); return result;
}

export class RunQueue {
  constructor({ execute, save, maxQueued = 30 }) { this.execute=execute;this.save=save;this.maxQueued=maxQueued;this.items=[];this.active=null;this.running=false;this.pending=0;this.closed=false; }
  async enqueue(run) {
    if(this.closed)throw new Error('The journey service is stopping. Start a new journey after it restarts.');
    if (this.items.length+this.pending >= this.maxQueued) throw new Error('The run queue is full.');
    this.pending++;
    let resolveCompletion;
    const completion = new Promise(resolve => {resolveCompletion=resolve;});
    try{
      run.status='queued'; await this.save(run);
      if(this.closed){run.status='cancelled';run.completedAt=new Date().toISOString();run.error='Service stopped before browser launch.';await this.save(run);resolveCompletion(run);}
      else {this.items.push({run,controller:new AbortController(),resolveCompletion});void this.pump();}
      return {run,completion};
    }finally{this.pending--;}
  }
  async pump() {
    if(this.running)return;this.running=true;
    try { while(this.items.length) {
      const item=this.items.shift();this.active=item;
      try { await this.execute(item.run,item.controller.signal); }
      catch(error){item.run.status=item.controller.signal.aborted?'cancelled':'failed';item.run.error=redactText(error.message);item.run.completedAt=new Date().toISOString();await this.save(item.run);}
      finally {item.resolveCompletion(item.run);this.active=null;}
    }} finally {this.running=false;}
  }
  async cancel(id) {
    if(this.active?.run.id===id){this.active.controller.abort();return {id,status:'cancelling'};}
    const index=this.items.findIndex(x=>x.run.id===id);if(index<0)return null;
    const [item]=this.items.splice(index,1);item.run.status='cancelled';item.run.completedAt=new Date().toISOString();item.run.error='Cancelled before browser launch.';
    await this.save(item.run);item.resolveCompletion(item.run);return item.run;
  }
  ids(){return [this.active?.run.id,...this.items.map(x=>x.run.id)].filter(Boolean);}
  async close(){
    this.closed=true;
    await Promise.all(this.ids().map(id=>this.cancel(id)));
    while(this.running||this.pending)await new Promise(resolve=>setTimeout(resolve,10));
  }
}

export async function runQueued(queue, run, signal) {
  const queued = await queue.enqueue(run);
  const cancel = () => { void queue.cancel(run.id).catch(() => {}); };
  if (signal) {
    signal.addEventListener('abort', cancel, {once: true});
    if (signal.aborted) cancel();
  }
  try { return await queued.completion; }
  finally { signal?.removeEventListener('abort', cancel); }
}
