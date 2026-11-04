import {list} from './lib.ts';
import type {Row} from './lib.ts';
import {IMPACT_EXAMPLES,getImpactExample} from './impact-examples.ts';
import {impactOrigin} from './impact-origin.ts';
import {changeImpactSummary} from './insight-summary-metrics.ts';

/** Examples share navigation and layout, but never contribute recorded evidence. */
export function impactCollectionRows(records:Row[]){
 const ids=new Set(records.map(record=>record.id));
 return [...records,...IMPACT_EXAMPLES.filter(example=>!ids.has(example.id)).map(example=>getImpactExample(example.id)!).filter(Boolean)];
}
export const impactCollectionAssessment=(record:Row)=>record.isExample?'illustrated':record.report?.status||'pending';
export const impactCollectionSource=(record:Row)=>record.isExample?'Illustrated example':impactOrigin(record).stateLabel;

export function impactCollectionPersonas(record:Row){
 const personas=new Map<string,{id:string;name:string}>();
 for(const persona of [...list(record.personas),...list(record.report?.pairs)]){
  const id=String(persona.personaId||'');
  if(!id)continue;
  const name=persona.personaName||persona.personaSnapshot?.name||persona.before?.personaSnapshot?.name||persona.after?.personaSnapshot?.name||persona.before?.personaName||id;
  if(!personas.has(id)||personas.get(id)!.name===id)personas.set(id,{id,name:String(name)});
 }
 return [...personas.values()];
}
export function impactCollectionSearchText(record:Row){
 return [record.title,record.intent,record.changeSummary,record.product,impactCollectionAssessment(record),impactCollectionSource(record),impactOrigin(record).searchText,
  ...impactCollectionPersonas(record).map(persona=>persona.name)].filter(Boolean).join(' ');
}
export function impactCollectionSummary(rows:Row[]){
 const saved=rows.filter(row=>!row.isExample);
 return {...changeImpactSummary(saved),saved:saved.length,examples:rows.length-saved.length};
}
