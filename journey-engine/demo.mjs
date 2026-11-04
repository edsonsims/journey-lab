#!/usr/bin/env node
// Starts Journey Lab with the recorded Gather demo data, so the whole loop can be
// reviewed without a model key: journeys, findings, emotional arcs, fixes,
// retests, change impact and Muse Glimmer summaries.
//
//   npm --prefix journey-engine run demo            # start (copies data on first run)
//   npm --prefix journey-engine run demo -- --reset # restore the original demo data
//
// The recorded data in ../demo-data is never modified. It is copied to
// journey-engine/.demo (ignored by Git) and the engine works on that copy.
import {cp, readdir, readFile, writeFile, rm, stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, resolve, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SEED = join(REPO, 'demo-data');
const LIVE = join(HERE, '.demo');
const RUNS = join(LIVE, 'runs');
const WORKSPACE = join(LIVE, 'workspace');
const COMPARISONS = join(LIVE, 'comparisons');
const TEXT = new Set(['.json', '.md', '.txt', '.log', '.patch', '.diff', '.html', '.js', '.css', '.mjs', '.jsonl']);
const SUBS = [['__JL_DEMO_WORKSPACE__', WORKSPACE], ['__JL_DEMO_RUNS__', RUNS], ['__JL_REPO__', REPO]];
const localize = text => SUBS.reduce((t, [from, to]) => t.split(from).join(to), text);

async function* files(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path); else yield path;
  }
}

async function prepare() {
  if (!existsSync(SEED)) throw new Error(`Demo data not found at ${SEED}`);
  await rm(LIVE, {recursive: true, force: true});
  await cp(SEED, LIVE, {recursive: true});
  for await (const path of files(LIVE)) {
    if (!TEXT.has(extname(path))) continue;
    const text = await readFile(path, 'utf8');
    if (text.includes('__JL_')) await writeFile(path, localize(text));
  }
  const db = new DatabaseSync(join(WORKSPACE, 'workspace.sqlite'));
  for (const {name: table} of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    for (const {name: column, type} of db.prepare(`PRAGMA table_info("${table}")`).all()) {
      if (type && !/TEXT/i.test(type)) continue;
      for (const [from, to] of SUBS) db.prepare(`UPDATE "${table}" SET "${column}"=replace("${column}",?,?) WHERE "${column}" LIKE ?`).run(from, to, `%${from}%`);
    }
  }
  db.close();
  console.log(`Demo data ready in ${LIVE}`);
}

const reset = process.argv.includes('--reset');
if (reset || !existsSync(join(WORKSPACE, 'workspace.sqlite'))) await prepare();
else console.log(`Using existing demo data in ${LIVE} (run with --reset to restore it)`);

const env = {...process.env, JOURNEY_RUNS_DIR: RUNS, JOURNEY_WORKSPACE_DIR: WORKSPACE, JOURNEY_COMPARISONS_DIR: COMPARISONS};
const children = [
  spawn(process.execPath, [join(HERE, 'server.mjs')], {env, stdio: 'inherit'}),
  spawn(process.execPath, [join(REPO, 'gather', 'serve.mjs')], {env: process.env, stdio: 'inherit'}),
];
const stop = () => { for (const child of children) child.kill('SIGTERM'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (const child of children) child.on('exit', code => { if (code) { stop(); process.exitCode = code; } });
