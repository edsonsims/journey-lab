import {createContext,useContext,useMemo} from 'react';
import type {ReactNode} from 'react';
import type {Row} from './lib';
import {label,list} from './lib';
import {Icon} from './icons';
import {fixLinkLabel,relatedFixesForRun} from './related-fixes';
import type {RelatedFix} from './related-fixes';
import './related-fixes.css';

type Context={relations:RelatedFix[];navigate:(path:string)=>void};
const RelatedFixContext=createContext<Context|null>(null);
export function RelatedFixProvider({run,fixes,findings,navigate,children}:{run:Row;fixes:Row[];findings:Row[];navigate:(path:string)=>void;children:ReactNode}){
 const relations=useMemo(()=>relatedFixesForRun(run,list(fixes),list(findings)),[run,fixes,findings]);
 return <RelatedFixContext.Provider value={{relations,navigate}}>{children}</RelatedFixContext.Provider>;
}
function FixLink({relation,navigate,children,className,title,ariaLabel}:{relation:RelatedFix;navigate:Context['navigate'];children:ReactNode;className?:string;title?:string;ariaLabel?:string}){
 return <a className={className} href={relation.href} title={title||relation.fix.title||'Candidate improvement'} aria-label={ariaLabel} onClick={event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(relation.href);}}>{children}<Icon name="arrow" size={14}/></a>;
}
export function RelatedFixStatusLinks({relations,navigate}:{relations:RelatedFix[];navigate:Context['navigate']}){
 return <>{relations.map(relation=>{
  const status=relation.fix.status?`Fix ${label(relation.fix.status).toLowerCase()}`:'Related fix';
  const description=`${relation.fix.title||'Candidate improvement'} · ${status} · ${relation.roles.join(' · ')}`;
  return <FixLink key={relation.fix.id} relation={relation} navigate={navigate} className="related-fix-status" title={description} ariaLabel={description}><Icon name="fixes" size={11}/><span>{status}</span></FixLink>;
 })}</>;
}
export function RelatedFixCards(){
 const context=useContext(RelatedFixContext);
 if(!context?.relations.length)return null;
 const card=(relation:RelatedFix)=><article className="related-fix-card" key={relation.fix.id}>
  <span className="related-fix-icon" aria-hidden="true"><Icon name="fixes" size={18}/></span>
  <div className="related-fix-copy"><h2>{relation.fix.title||'Candidate improvement'}</h2><div className="related-fix-meta"><strong title={relation.summary}>{label(relation.fix.status)}</strong><span>{relation.roles.join(' · ')}</span></div></div>
  <FixLink relation={relation} navigate={context.navigate} className="related-fix-action">{relation.fix.status==='awaiting_review'?'Review fix':'View fix'}</FixLink>
 </article>;
 return <section className="related-fixes" aria-label="Related fixes">{card(context.relations[0])}{context.relations.length>1&&<details className="related-fix-more"><summary>{context.relations.length-1} more related {context.relations.length===2?'fix':'fixes'}</summary>{context.relations.slice(1).map(card)}</details>}</section>;
}
export function RelatedFixLinks({entry}:{entry?:Row}){
 const context=useContext(RelatedFixContext);
 if(!context?.relations.length)return null;
 return <div className="related-fix-links" aria-label="Related fixes">{context.relations.map(relation=><FixLink key={relation.fix.id} relation={relation} navigate={context.navigate}><Icon name="fixes" size={13}/><span>{fixLinkLabel(relation,entry)}{context.relations.length>1&&`: ${relation.fix.title||'Candidate improvement'}`}</span></FixLink>)}</div>;
}
