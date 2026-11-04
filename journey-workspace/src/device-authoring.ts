import type {Row} from './lib.ts';

export function devicePayload(form:Row,original:Row={}):Row {
 const unchanged=['category','browser','viewport','screen','deviceScaleFactor','isMobile','hasTouch','userAgent'].every(key=>JSON.stringify(form[key])===JSON.stringify(original[key]));
 return {name:form.name,description:form.description,category:form.category,browser:'chromium',viewport:{...form.viewport},screen:{...form.screen},deviceScaleFactor:Number(form.deviceScaleFactor),isMobile:!!form.isMobile,hasTouch:!!form.hasTouch,userAgent:form.userAgent,presetId:form.presetId||null,legacyViewport:!!original.legacyViewport&&unchanged};
}
export function networkProfilePayload(form:Row):Row {
 const speed=(value:any)=>value==null||value===''?null:Number(value);
 return {name:form.name,description:form.description,offline:!!form.offline,latencyMs:Number(form.latencyMs),downloadMbps:speed(form.downloadMbps),uploadMbps:speed(form.uploadMbps)};
}
