import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../outputs/automated-test-fixtures');

// Test fixtures obey the same keep-all policy as captured journeys. Each setup
// gets a fresh namespace; teardown closes resources but never removes its files.
export function retainedFixture(label='fixture'){
  const name=String(label).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,100)||'fixture';
  mkdirSync(root,{recursive:true});
  const directory=mkdtempSync(join(root,`${name.replace(/-+$/,'')}-`));
  writeFileSync(join(directory,'fixture.json'),JSON.stringify({kind:'synthetic-automated-test-fixture',label:name,createdAt:new Date().toISOString(),retention:'keep-all'},null,2));
  return directory;
}
export function retainedDatabasePath(label){return join(retainedFixture(label),'fixture.sqlite');}
