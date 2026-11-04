const chapters:readonly string[]=['change','people','mismatch','difference','repair','retest'];
const legacySteps=new Map([['1',1],['2',3],['3',4],['4',5]]);

/** Named chapters are canonical; legacy steps retain their original meaning. */
export function guideChapterIndex(search:string):number|null {
 const params=new URLSearchParams(search);
 const chapter=chapters.indexOf(params.get('chapter')||'');
 if(chapter>=0)return chapter;
 return legacySteps.get(params.get('step')||'')??null;
}
