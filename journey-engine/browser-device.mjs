// Browser emulation is resolved from the immutable run, never the live catalog.
const configurationFields=['deviceId','deviceName','deviceVersion','deviceVersionId','deviceSnapshot','networkProfileId','networkProfileName','networkProfileVersion','networkProfileVersionId','networkProfileSnapshot','viewport'];
const invalid=message=>Object.assign(new Error(message),{code:'INVALID_BROWSER_CONFIGURATION'});
const dimensions=(value,label)=>{
  if(!value||![value.width,value.height].every(number=>Number.isSafeInteger(number)&&number>=100&&number<=4096))throw invalid(`The pinned ${label} dimensions are invalid.`);
  return {width:value.width,height:value.height};
};

export function copyBrowserConfiguration(run={}){
  return Object.fromEntries(configurationFields.filter(key=>run[key]!==undefined).map(key=>[key,structuredClone(run[key])]));
}

export function browserContextOptions(run={}){
  const device=run.deviceSnapshot;
  const viewport=dimensions(device?.viewport||run.viewport||run.personaSnapshot?.viewport||run.persona?.viewport||{width:1280,height:800},'viewport');
  if(!device)return {viewport}; // Historical runs keep their original desktop behavior.
  if(device.browser&&device.browser!=='chromium')throw invalid('This runner supports Chromium device emulation only.');
  for(const key of ['isMobile','hasTouch'])if(device[key]!==undefined&&typeof device[key]!=='boolean')throw invalid(`The pinned device ${key} must be a boolean.`);
  const deviceScaleFactor=device.deviceScaleFactor??1;
  if(!Number.isFinite(deviceScaleFactor)||deviceScaleFactor<0.5||deviceScaleFactor>8)throw invalid('The pinned device pixel ratio is invalid.');
  if(device.userAgent!==undefined&&device.userAgent!==null&&typeof device.userAgent!=='string')throw invalid('The pinned user agent must be text.');
  return {viewport,screen:dimensions(device.screen||viewport,'screen'),isMobile:device.isMobile??false,hasTouch:device.hasTouch??false,deviceScaleFactor,...(device.userAgent?{userAgent:device.userAgent}:{})};
}

export function effectiveNetworkProfile(run={}){
  const profile=run.networkProfileSnapshot||{};
  const result={offline:profile.offline??false,latencyMs:profile.latencyMs??0,downloadMbps:profile.downloadMbps??null,uploadMbps:profile.uploadMbps??null};
  if(typeof result.offline!=='boolean'||!Number.isFinite(result.latencyMs)||result.latencyMs<0||result.latencyMs>60000)throw invalid('The pinned network connection settings are invalid.');
  for(const key of ['downloadMbps','uploadMbps'])if(result[key]!==null&&(!Number.isFinite(result[key])||result[key]<=0||result[key]>100000))throw invalid(`The pinned network ${key} must be positive or unlimited.`);
  return result;
}

// Names and catalog IDs do not change behavior; actual applied settings do.
export function effectiveBrowserConditions(run={}){
  const options=browserContextOptions(run);
  return {device:{browser:'chromium',viewport:options.viewport,screen:options.screen||options.viewport,isMobile:options.isMobile??false,hasTouch:options.hasTouch??false,deviceScaleFactor:options.deviceScaleFactor??1,userAgent:options.userAgent||null},network:effectiveNetworkProfile(run)};
}

export function networkConditionsMatch(before,after){
  try{return JSON.stringify(effectiveBrowserConditions(before))===JSON.stringify(effectiveBrowserConditions(after));}catch{return false;}
}

export async function installBrowserNetwork(context,run={}){
  const profile=effectiveNetworkProfile(run),sessions=new Map();let failure=null;
  const configured=Boolean(run.networkProfileSnapshot);
  if(configured)await context.setOffline(profile.offline);
  const apply=page=>{
    if(!configured)return Promise.resolve();
    if(sessions.has(page))return sessions.get(page);
    const pending=(async()=>{
      const session=await context.newCDPSession(page);
      await session.send('Network.enable');
      // CDP expects bytes/second; null means no throughput limit. This session
      // affects browser traffic only, never the Node process's model requests.
      await session.send('Network.emulateNetworkConditions',{offline:profile.offline,latency:profile.latencyMs,downloadThroughput:profile.downloadMbps===null?-1:profile.downloadMbps*125000,uploadThroughput:profile.uploadMbps===null?-1:profile.uploadMbps*125000});
      return session;
    })().catch(error=>{if(page.isClosed())return null;failure=Object.assign(new Error('The requested network simulation could not be applied.'),{code:'NETWORK_EMULATION_FAILED',cause:error});throw failure;});
    sessions.set(page,pending);return pending;
  };
  const onPage=page=>{void apply(page).catch(()=>{});};
  context.on('page',onPage);
  for(const page of context.pages())await apply(page);
  return {profile,ready:apply,assertHealthy(){if(failure)throw failure;},async dispose(){context.off('page',onPage);await Promise.allSettled([...sessions.values()].map(async pending=>(await pending)?.detach()));}};
}

export async function tapBrowserPoint(page,{x,y},double=false){
  await page.touchscreen.tap(x,y);
  if(double)await page.touchscreen.tap(x,y);
}

export async function scrollBrowserTouch(page,action){
  const session=await page.context().newCDPSession(page);
  try{
    await session.send('Input.synthesizeScrollGesture',{x:action.x,y:action.y,xDistance:-action.scroll_x,yDistance:-action.scroll_y,gestureSourceType:'touch',speed:800,preventFling:true});
  }finally{await session.detach();}
}
