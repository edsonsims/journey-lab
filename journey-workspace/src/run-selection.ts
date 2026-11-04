import {configuredEnvironments} from './environment-context.ts';
import type {Row} from './lib.ts';

export type RunSelection={charterId:string;environmentId:string;personaIds:string[]};
const active=(value:unknown,projectId:string):Row[]=>Array.isArray(value)?value.filter(item=>item&&typeof item.id==='string'&&!item.archived&&(!item.projectId||item.projectId===projectId)):[];

export function runSelectionOptions(data:Row,projectId:string,charterId:string){
 const charters=active(data.charters,projectId),personas=active(data.personas,projectId),charter=charters.find(item=>item.id===charterId);
 const compatible=Array.isArray(charter?.compatibleEnvironmentIds)?charter.compatibleEnvironmentIds:[];
 const environments=charter?active(configuredEnvironments(data.environments),projectId).filter(item=>!compatible.length||compatible.includes(item.id)):[];
 return {charters,personas,charter,environments};
}

function preferredEnvironment(charter:Row|undefined,environments:Row[]){return environments.find(item=>item.id===charter?.defaultEnvironmentId)?.id||environments[0]?.id||'';}
function suggestedPersonas(charter:Row|undefined,personas:Row[]):string[]{
 const available=new Set(personas.map(item=>item.id));
 const suggested=Array.isArray(charter?.personaIds)?[...new Set<string>(charter.personaIds.filter((id:unknown)=>typeof id==='string'&&available.has(id)))].slice(0,12):[];
 return suggested.length?suggested:personas[0]?[personas[0].id]:[];
}

// Selecting a charter deliberately reapplies its defaults and valid suggestions.
export function defaultRunSelection(data:Row,projectId:string,charterId?:string):RunSelection{
 const charters=active(data.charters,projectId),charter=charters.find(item=>item.id===charterId)||charters[0];
 const options=runSelectionOptions(data,projectId,charter?.id||'');
 return {charterId:charter?.id||'',environmentId:preferredEnvironment(charter,options.environments),personaIds:charter?suggestedPersonas(charter,options.personas):[]};
}

// Refreshes reconcile only unavailable choices. Valid manual choices, including
// an intentionally empty persona selection, survive new Library versions.
export function reconcileRunSelection(data:Row,projectId:string,selection:RunSelection):RunSelection{
 const options=runSelectionOptions(data,projectId,selection.charterId);
 if(!options.charter)return defaultRunSelection(data,projectId);
 const environmentId=options.environments.some(item=>item.id===selection.environmentId)?selection.environmentId:preferredEnvironment(options.charter,options.environments);
 const available=new Set(options.personas.map(item=>item.id));
 let personaIds=selection.personaIds.filter(id=>available.has(id));
 if(selection.personaIds.length&&!personaIds.length)personaIds=suggestedPersonas(options.charter,options.personas);
 if(environmentId===selection.environmentId&&personaIds.length===selection.personaIds.length&&personaIds.every((id,index)=>id===selection.personaIds[index]))return selection;
 return {charterId:selection.charterId,environmentId,personaIds};
}
