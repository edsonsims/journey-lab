/** Global Home is never an implicit selection of the first project. */
export function workspaceRoute(path:string,search=''){
 const parts=path.split('/').filter(Boolean);
 let projectId='';
 if(parts[0]==='projects'&&parts[1]){try{projectId=decodeURIComponent(parts[1]);}catch{projectId=parts[1];}}
 if(!projectId)return {projectId:'',section:'home',detailId:undefined,canonicalPath:undefined};
 let section=parts[2]==='settings'?(parts[3]||'devices'):(parts[2]||'runs');
 const detailId=parts[2]==='settings'?parts[4]:parts[3];
 const params=new URLSearchParams(search),base='/projects/'+encodeURIComponent(projectId);
 let canonicalPath:string|undefined;
 if(section==='dashboard'&&params.has('view')){
  if(projectId==='gather'&&params.get('view')==='story')section='guide';
  params.delete('view');
  canonicalPath=base+'/'+section+(params.size?'?'+params.toString():'');
 }else if(section==='guide'&&projectId!=='gather'){
  section='dashboard';canonicalPath=base+'/dashboard';
 }
 return {projectId,section,detailId,canonicalPath};
}
