export type WorkspaceSection = 'dashboard'|'guide'|'runs'|'impact'|'findings'|'issues'|'fixes'|'coverage'|'experience'|'charters'|'personas'|'competitors'|'memory'|'calibration'|'environments'|'integrations'|'devices'|'network-profiles';
export type WorkspaceGroupKey = 'runs'|'insights'|'library'|'settings';
export type WorkspaceNavItem = {key:WorkspaceSection;label:string;icon:string};
export type WorkspaceNavGroup = {key:WorkspaceGroupKey;label:string;icon:string;items:readonly WorkspaceNavItem[]};

/** A leaf keeps its existing route; only its place in the navigation changes. */
export const NAV_GROUPS:readonly WorkspaceNavGroup[] = [
 {key:'runs',label:'Journeys',icon:'runs',items:[
  {key:'runs',label:'All journeys',icon:'runs'},
  {key:'findings',label:'Findings',icon:'findings'},
  {key:'issues',label:'Issues',icon:'issues'},
  {key:'fixes',label:'Fixes',icon:'fixes'},
 ]},
 {key:'insights',label:'Insights',icon:'activity',items:[
  {key:'experience',label:'Experience',icon:'experience'},
  {key:'impact',label:'Change impact',icon:'branch'},
  {key:'coverage',label:'Coverage',icon:'coverage'},
 ]},
 {key:'library',label:'Library',icon:'folder',items:[
  {key:'charters',label:'Missions',icon:'charters'},
  {key:'personas',label:'Personas',icon:'personas'},
 ]},
 {key:'settings',label:'Settings',icon:'settings',items:[
  {key:'devices',label:'Devices',icon:'devices'},
  {key:'environments',label:'Environments',icon:'environments'},
  {key:'network-profiles',label:'Network profiles',icon:'activity'},
  {key:'integrations',label:'Connections',icon:'branch'},
  {key:'memory',label:'Memory',icon:'memory'},
  {key:'competitors',label:'Competitors',icon:'competitors'},
  {key:'calibration',label:'Calibration',icon:'calibration'},
  {key:'dashboard',label:'App overview',icon:'coverage'},
  {key:'guide',label:'Guided example',icon:'branch'},
 ]},
];

export function navigationGroups(projectId:string){return NAV_GROUPS.map(group=>({...group,items:group.items.filter(item=>item.key!=='guide'||projectId==='gather')}));}

/** App already resolves collection and detail URLs to a section key. */
export function groupForSection(section:string|null|undefined):WorkspaceNavGroup {
 return NAV_GROUPS.find(group=>group.items.some(item=>item.key===section))||NAV_GROUPS.find(group=>group.key==='runs')!;
}

/** Page labels stay specific even when several destinations share a menu. */
export function pageLabelForSection(section:string):string {
 if(section==='home')return 'Home';
 if(section==='dashboard')return 'App overview';
 if(section==='runs')return 'Journeys';
 return NAV_GROUPS.flatMap(group=>group.items).find(item=>item.key===section)?.label||'Journey Lab';
}

export function navigationHref(base:string,section:WorkspaceSection):string {
 const prefix=['devices','network-profiles','environments','integrations'].includes(section)?'settings/':'';
 return `${base.replace(/\/+$/,'')}/${prefix}${section}`;
}
