import {randomUUID} from 'node:crypto';
import {copyBrowserConfiguration} from './browser-device.mjs';

// The environment is a saved target policy. A preview is one disposable execution
// of a particular build under that policy, and never a new Library definition.
export function createRetestRun(input,{configuredEnvironment}={}){
  const source=input.sourceRun||{},persona=structuredClone(input.persona||source.personaSnapshot||source.persona);
  const parent=configuredEnvironment||source.environmentSnapshot||input.environment||{};
  const samePersona=(persona.id||source.personaId)===source.personaId,id=input.id||randomUUID();
  const environmentId=parent.id||source.configuredEnvironment?.id||source.environmentId||null;
  const environmentVersion=parent.version??source.environmentVersion??null;
  const environmentVersionId=parent.versionId||source.environmentVersionId||null;
  const environmentName=parent.name||source.configuredEnvironment?.name||source.environmentName||null;
  const identity=environmentId?{id:environmentId,name:environmentName,version:environmentVersion,versionId:environmentVersionId}:null;
  const environment={...structuredClone(input.environment||parent),id:environmentId,name:environmentName,version:environmentVersion,versionId:environmentVersionId,url:input.target,repositoryPath:input.productDirectory,allowedOrigins:input.allowedOrigins||input.environment?.allowedOrigins||[new URL(input.target).origin]};
  return {id,projectId:input.projectId||source.projectId,name:`${source.charterName||'Retest'} · ${persona.name||persona.label} · ${input.variant}`,status:'queued',createdAt:new Date().toISOString(),events:[],experience:[],usage:[],video:null,replay:null,finalMessage:null,error:null,persona,personaSnapshot:structuredClone(persona),personaId:persona.id||source.personaId,personaVersion:persona.version||(samePersona?source.personaVersion:undefined),personaVersionId:persona.versionId||(samePersona?source.personaVersionId:undefined),viewport:persona.viewport||source.viewport,charterId:source.charterId,charterVersion:source.charterVersion,charterVersionId:source.charterVersionId,charterSnapshot:input.charter||source.charterSnapshot,
    environmentId,environmentName,environmentVersion,environmentVersionId,configuredEnvironment:identity,environmentKind:'temporary',environmentSnapshot:environment,
    executionInstance:{id:`preview-${id}`,kind:'fix-preview',environmentId,environmentVersion,sourceRunId:source.id,comparisonId:input.comparisonId,variant:input.variant,url:input.target,repositoryPath:input.productDirectory},
    executionPolicy:input.executionPolicy??source.executionPolicy,memorySnapshotId:source.memorySnapshotId,memorySnapshot:source.memorySnapshot?structuredClone(source.memorySnapshot):undefined,memoryReferenceUrl:source.memoryReferenceUrl||configuredEnvironment?.url||source.target,productDirectory:input.productDirectory,target:input.target,scenarioId:source.scenarioId||'web-app',model:source.model||'muse-wonder-1.0',comparisonId:input.comparisonId,variant:input.variant,...copyBrowserConfiguration(source),limitations:'Fresh synthetic persona retest; does not measure real-user impact.'};
}
