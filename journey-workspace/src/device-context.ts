import type {Row} from './lib.ts';

const dimensions=(value:Row|undefined)=>value&&Number.isFinite(value.width)&&Number.isFinite(value.height)?`${value.width} × ${value.height}`:'Not recorded';
export function recordedDevice(run:Row):Row {
 if(run.deviceSnapshot)return {...run.deviceSnapshot,name:run.deviceSnapshot.name||run.deviceName||'Recorded device',version:run.deviceSnapshot.version??run.deviceVersion};
 const viewport=run.viewport||run.personaSnapshot?.viewport||run.persona?.viewport;
 if(run.deviceId||run.deviceName)return {name:run.deviceName||'Recorded device',version:run.deviceVersion,viewport,missingSnapshot:true};
 return {name:viewport?`Legacy ${dimensions(viewport)}`:'Device not recorded',viewport,legacyViewport:true,browser:'chromium',deviceScaleFactor:1,isMobile:false,hasTouch:false};
}
export function recordedNetwork(run:Row):Row {
 return run.networkProfileSnapshot?{...run.networkProfileSnapshot,name:run.networkProfileSnapshot.name||run.networkProfileName||'Recorded connection'}:{name:run.networkProfileName||'Network not recorded',unrecorded:true};
}
export function networkSummary(network:Row):string {
 if(network.unrecorded)return 'No network profile was recorded.';
 if(network.offline)return 'Offline · disconnected from the start';
 const speed=(value:any)=>value==null?'Unlimited':`${value} Mbps`;
 return `${speed(network.downloadMbps)} down · ${speed(network.uploadMbps)} up · ${network.latencyMs??0} ms latency`;
}
export function recordedInput(run:Row):string {
 const types=Array.isArray(run.events)?run.events.filter((event:Row)=>event.type==='action').map((event:Row)=>event.action?.type):run.recordedActionTypes;
 if(!Array.isArray(types))return 'Not recorded';
 const used=new Set<string>(),touch=(run.browserExecution?.device?.hasTouch??run.deviceSnapshot?.hasTouch)===true;
 for(const type of types){
  if(['wait','screenshot'].includes(type))continue;
  if(['keypress','type'].includes(type))used.add('Keyboard');
  else if(['click','double_click','click_control','move','scroll'].includes(type))used.add(touch?'Touch':'Mouse');
  else if(['tap','touch','swipe'].includes(type))used.add('Touch');
  else if(type==='select_option')used.add('Programmatic selection');
  else used.add('Other input');
 }
 if(!used.size)return 'No input recorded';
 if(used.size===1&&used.has('Keyboard'))return 'Keyboard only';
 return ['Mouse','Touch','Keyboard','Programmatic selection','Other input'].filter(input=>used.has(input)).join(' + ');
}
export function deviceDetails(device:Row,network?:Row,run?:Row):{label:string;value:string}[] {
 const details=[{label:'Device',value:device.name||'Unnamed device'},...(device.version?[{label:'Version',value:String(device.version)}]:[]),{label:'Mode',value:device.missingSnapshot?'Configuration snapshot unavailable':device.legacyViewport?'Historical viewport-only session':'Browser emulation'},
  {label:'Browser',value:device.browser==='chromium'?'Chromium / Chrome':device.browser||'Not recorded'},
  {label:'Viewport',value:dimensions(device.viewport)},
  {label:'Screen',value:dimensions(device.screen)},
  {label:'Pixel density',value:device.deviceScaleFactor==null?'Not recorded':`${device.deviceScaleFactor}×`},
  {label:run?'Input used':'Input capability',value:run?recordedInput(run):device.hasTouch===true?'Touch':device.hasTouch===false?'Mouse and keyboard':'Not recorded'},
  {label:'Mobile layout',value:device.isMobile===true?'Enabled':device.isMobile===false?'Disabled':'Not recorded'}];
 if(device.userAgent)details.push({label:'Browser identity',value:device.userAgent});
 if(network)details.push({label:'Connection',value:network.name||'Unnamed profile'},{label:'Network settings',value:networkSummary(network)});
 return details;
}
export function personaDeviceIds(persona:Row):string[]{return Array.isArray(persona.deviceIds)?[...new Set<string>(persona.deviceIds.filter((id:unknown)=>typeof id==='string'))]:[];}
export function primaryDevice(persona:Row,devices:Row[]):Row|undefined{return devices.find(device=>device.id===persona.primaryDeviceId)||devices.find(device=>device.id===personaDeviceIds(persona)[0]);}
