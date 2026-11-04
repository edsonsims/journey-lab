import { devices } from 'playwright';

const dimension = (value, fallback, label, ErrorClass) => {
  const result=value??fallback;
  if(typeof result!=='number'||!Number.isInteger(result)||result<240||result>3840)throw new ErrorClass(`${label} must be an integer between 240 and 3840.`);
  return result;
};
const dimensions=(value,fallback,label,ErrorClass)=>({width:dimension(value?.width,fallback.width,`${label} width`,ErrorClass),height:dimension(value?.height,fallback.height,`${label} height`,ErrorClass)});
const flag=(input,old,key,fallback,ErrorClass)=>{const value=input[key]??old[key]??fallback;if(typeof value!=='boolean')throw new ErrorClass(`${key} must be true or false.`);return value;};
export function cleanDeviceProfile(input,old={},ErrorClass=Error){
  const category=input.category??old.category??'desktop',browser=input.browser??old.browser??'chromium';
  if(!['phone','tablet','desktop'].includes(category))throw new ErrorClass('Choose phone, tablet or desktop.');
  if(browser!=='chromium')throw new ErrorClass('Only Chromium emulation is currently supported.');
  const viewport=dimensions(input.viewport,old.viewport||{width:1280,height:800},'Viewport',ErrorClass);
  const screen=dimensions(input.screen,old.screen||viewport,'Screen',ErrorClass);
  const deviceScaleFactor=input.deviceScaleFactor??old.deviceScaleFactor??1;
  if(typeof deviceScaleFactor!=='number'||!Number.isFinite(deviceScaleFactor)||deviceScaleFactor<0.5||deviceScaleFactor>8)throw new ErrorClass('Pixel density must be between 0.5 and 8.');
  const userAgent=input.userAgent??old.userAgent??'';
  if(typeof userAgent!=='string'||userAgent.length>1000||/[\r\n]/.test(userAgent))throw new ErrorClass('Enter a valid browser user agent (up to 1,000 characters).');
  return {category,browser,viewport,screen,deviceScaleFactor,isMobile:flag(input,old,'isMobile',category!=='desktop',ErrorClass),hasTouch:flag(input,old,'hasTouch',category!=='desktop',ErrorClass),userAgent,presetId:typeof (input.presetId??old.presetId)==='string'?(input.presetId??old.presetId).slice(0,100):null,legacyViewport:flag(input,old,'legacyViewport',false,ErrorClass)};
}
export function cleanNetworkProfile(input,old={},ErrorClass=Error){
  const latencyMs=input.latencyMs??old.latencyMs??0;
  if(typeof latencyMs!=='number'||!Number.isFinite(latencyMs)||latencyMs<0||latencyMs>10000)throw new ErrorClass('Latency must be between 0 and 10,000 milliseconds.');
  const speed=key=>{const value=Object.hasOwn(input,key)?input[key]:old[key]??null;if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>10000)throw new ErrorClass(`${key} must be greater than zero and at most 10,000, or null for unlimited.`);return value;};
  return {offline:flag(input,old,'offline',false,ErrorClass),latencyMs,downloadMbps:speed('downloadMbps'),uploadMbps:speed('uploadMbps'),presetId:typeof (input.presetId??old.presetId)==='string'?(input.presetId??old.presetId).slice(0,100):null};
}
export function legacyDeviceProfile(viewport={width:1280,height:800}){
  const category=viewport.width<600?'phone':viewport.width<1024?'tablet':'desktop';
  return {name:`Custom ${category} — ${viewport.width} × ${viewport.height}`,description:'Preserved viewport-only configuration. Desktop Chromium behavior, without mobile or touch emulation.',category,browser:'chromium',viewport:{...viewport},screen:{...viewport},deviceScaleFactor:1,isMobile:false,hasTouch:false,userAgent:'',legacyViewport:true,presetId:null};
}
const preset=(key,category)=>{const source=devices[key];if(!source)return null;return {presetId:key,name:source.defaultBrowserType==='webkit'?`${key} · Chromium emulation`:key,description:source.defaultBrowserType==='webkit'?'Device dimensions and touch emulated in Chromium; this does not test Safari or a physical device.':'Browser device emulation; this does not run on physical hardware.',category,browser:'chromium',viewport:{...source.viewport},screen:{...(source.screen||source.viewport)},deviceScaleFactor:source.deviceScaleFactor,isMobile:source.isMobile,hasTouch:source.hasTouch,userAgent:source.userAgent,legacyViewport:false};};
export const DEVICE_PRESETS=[
  {presetId:'desktop-1280',name:'Desktop — 1280 × 800',description:'Desktop Chromium with mouse and keyboard.',category:'desktop',browser:'chromium',viewport:{width:1280,height:800},screen:{width:1280,height:800},deviceScaleFactor:1,isMobile:false,hasTouch:false,userAgent:'',legacyViewport:false},
  {presetId:'desktop-1440',name:'Laptop — 1440 × 900',description:'Desktop Chromium with mouse and keyboard.',category:'desktop',browser:'chromium',viewport:{width:1440,height:900},screen:{width:1440,height:900},deviceScaleFactor:1,isMobile:false,hasTouch:false,userAgent:'',legacyViewport:false},
  preset('iPhone 13','phone'),preset('Pixel 7','phone'),preset('Galaxy S9+','phone'),preset('iPad Mini','tablet'),preset('Desktop Chrome HiDPI','desktop'),
].filter(Boolean);
export const NETWORK_PRESETS=[
  {presetId:'unthrottled',name:'Unthrottled',description:'Uses the host connection without additional throttling.',offline:false,latencyMs:0,downloadMbps:null,uploadMbps:null},
  {presetId:'fast',name:'Fast connection',description:'Simulated 20 Mbps download, 10 Mbps upload, 20 ms latency.',offline:false,latencyMs:20,downloadMbps:20,uploadMbps:10},
  {presetId:'slow-mobile',name:'Slow mobile',description:'Simulated 1.6 Mbps download, 0.75 Mbps upload, 150 ms latency.',offline:false,latencyMs:150,downloadMbps:1.6,uploadMbps:0.75},
  {presetId:'offline',name:'Offline',description:'Starts without network access. Cached PWA behavior is not validated by this profile.',offline:true,latencyMs:0,downloadMbps:null,uploadMbps:null},
];
