import {useEffect} from 'react';
import type {RefObject} from 'react';

/** Detail views load independently; their rendered heading is the title's source of truth. */
export function usePageTitle(content:RefObject<HTMLDivElement|null>,routeKey:string,fallback:string,projectName?:string,preferFallback=false){
 useEffect(()=>{
  const root=content.current;
  if(!root)return;
  const update=()=>{
   const heading=root.querySelector('h1')?.cloneNode(true) as HTMLElement|undefined;
   heading?.querySelectorAll('.heading-dot,span').forEach(node=>{
    if(node.classList.contains('heading-dot')||node.textContent?.trim()==='.')node.remove();
   });
   const page=preferFallback?fallback:heading?.textContent?.replace(/\s+/g,' ').trim()||fallback;
   const title=[page,projectName,'Journey Lab'].filter((part,index,parts)=>part&&parts.indexOf(part)===index).join(' · ');
   if(document.title!==title)document.title=title;
  };
  update();
  const observer=new MutationObserver(update);
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  return()=>observer.disconnect();
 },[content,routeKey,fallback,projectName,preferFallback]);
}
