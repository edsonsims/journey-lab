import type {Row} from './lib.ts';

export function findingPersonaName(finding:Row,run:Row={},personas:Row[]=[]):string {
 const id=run.personaId||finding.personaId;
 const saved=personas.find(persona=>persona.id===id);
 const names=[run.personaSnapshot?.name,run.persona?.name,run.persona?.label,run.personaName,finding.personaName,saved?.name];
 return names.find(name=>typeof name==='string'&&name.trim()&&name!==id&&!['Unknown persona','Persona'].includes(name))||'Unknown persona';
}
