import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PRODUCT_FILES=['activity.html','app.js','index.html','preview.html','setup.html','signup.html','styles.css'];
export async function productFingerprint(directory) {
  const directoryStat=await lstat(directory);
  if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink())throw new Error('Cópia indisponível.');
  const hashes={};
  for(const name of PRODUCT_FILES) {
    const path=join(directory,name);
    let stat;try{stat=await lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw new Error('Arquivo inválido na cópia.');
    hashes[name]=createHash('sha256').update(await readFile(path)).digest('hex');
  }
  if(!hashes['index.html'])throw new Error('Página inicial ausente.');
  return hashes;
}
export function sameProductFingerprint(left,right) {
  const ordered=value=>Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify(ordered(left))===JSON.stringify(ordered(right));
}
