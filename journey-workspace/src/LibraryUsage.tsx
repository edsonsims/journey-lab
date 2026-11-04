import {AppLink,Badge,Button,Empty} from './App';
import {SummaryStrip} from './CollectionSummary';
import {SmartFilters,useTableFilters} from './SmartFilters';
import {collectionFilters} from './collection-filters';
import {environmentLabel} from './environment-context';
import {runVersion} from './library-authoring';
import type {LibraryKind} from './library-authoring';
import {buildLibraryUsage} from './library-usage';
import {fullDate,label,list,ongoing,outcome,title} from './lib';
import type {Row} from './lib';
import {Icon} from './icons';
import './library-usage.css';

type Props={kind:LibraryKind;runs:Row[];base:string;route:{path:string;search:string;navigate:(path:string,replace?:boolean)=>void};navigate:(path:string)=>void;data:Row};

function FindingItem({finding,base,navigate,resolved}:{finding:Row;base:string;navigate:Props['navigate'];resolved:boolean}){
 const heading=finding.title||finding.observation||'Recorded finding';
 return <li className="library-usage-finding">
  <Badge value={finding.impact||'untriaged'}/>
  <div>{finding.id?<AppLink to={`${base}/findings/${encodeURIComponent(finding.id)}`} navigate={navigate}>{heading}</AppLink>:<strong>{heading}</strong>}
   {finding.observation&&finding.observation!==heading&&<p>{finding.observation}</p>}
   {(resolved||finding.triage)&&<small>{resolved?'Resolved issue':label(finding.triage)}</small>}
  </div>
 </li>;
}

export function LibraryUsage({kind,runs,base,route,navigate,data}:Props){
 const all=buildLibraryUsage(runs,data),config=collectionFilters('runs',{...data,runs:all.filterRows});
 const filters=useTableFilters(all.filterRows,{...config,searchText:run=>[config.searchText(run),...(all.byRun.get(run.id)||[]).flatMap(finding=>[finding.title,finding.observation,finding.personaComment])].filter(value=>typeof value==='string').join(' ')},route);
 const usage=buildLibraryUsage(filters.rows,data),issues=new Map(list(data.issues).map(issue=>[issue.id,issue]));
 const definition=kind==='personas'?'persona':'mission';
 const findingItem=(finding:Row,index:number)=><FindingItem key={finding.id||index} finding={finding} base={base} navigate={navigate} resolved={issues.get(finding.issueId)?.status==='resolved'}/>;
 return <section className="library-usage" aria-label="Journey results">
  <header className="library-usage-heading"><h2>What these journeys found</h2><p>Recorded findings across this {definition}’s versions. The summary follows your filters.</p></header>
  <SummaryStrip count={filters.rows.length} total={runs.length} label={filters.rows.length===1?'journey':'journeys'} {...usage.summary} kind="library-usage" ariaLabel="Journey findings summary"/>
  <SmartFilters filters={filters} noun="journeys" placeholder="Search journeys or what they found…"/>
  {filters.rows.length?<div className="library-usage-list">{filters.rows.map(run=>{
   const findings=usage.byRun.get(run.id)||[],version=runVersion(run,kind),recordedOutcome=outcome(run);
   const invalidated=run.integrityStatus==='invalidated'||run.status==='invalidated';
   const outcomeEligible=!invalidated&&!ongoing(run.status)&&!['failed','cancelled','canceled','incomplete'].includes(run.status);
   return <article key={run.id} className="library-usage-journey" aria-label={title(run)}>
    <div className="library-usage-context">
     <div className="library-usage-status"><Badge value={run.status}/>{invalidated&&run.status!=='invalidated'&&<Badge value="invalidated"/>}<span className="version-pill">{version?`v${version}`:'Version not recorded'}</span></div>
     <h3><AppLink to={`${base}/runs/${encodeURIComponent(run.id)}`} navigate={navigate}>{title(run)}<Icon name="arrow" size={14}/></AppLink></h3>
     {recordedOutcome&&<span className={`library-usage-outcome ${outcomeEligible?`outcome-${recordedOutcome}`:''}`}>{!outcomeEligible?'Recorded outcome · ':''}{label(recordedOutcome)}</span>}
     <dl><div><dt>Environment</dt><dd>{environmentLabel(run,list(data.environments))}</dd></div><div><dt>Started</dt><dd>{fullDate(run.startedAt||run.createdAt)}</dd></div></dl>
    </div>
    <div className="library-usage-discoveries">
     <div className="library-usage-findings-label"><Icon name="findings" size={14}/><h4>{usage.findingsAvailable?`${findings.length} recorded ${findings.length===1?'finding':'findings'}`:'Findings'}</h4></div>
     {findings.length?<><ul>{findings.slice(0,2).map(findingItem)}</ul>{findings.length>2&&<details className="library-usage-more"><summary>{findings.length-2} more {findings.length===3?'finding':'findings'}</summary><ul>{findings.slice(2).map(findingItem)}</ul></details>}</>:<p className="library-usage-no-findings">{!usage.findingsAvailable?'Finding details are unavailable. Open the journey to inspect its record.':ongoing(run.status)?'No findings yet. This journey is still in progress.':'No findings were recorded for this journey.'}</p>}
    </div>
   </article>;
  })}</div>:<Empty icon="runs" title={runs.length?'No matching journeys.':'The first journey is still ahead.'} action={runs.length?<Button onClick={filters.clear}>Clear filters</Button>:undefined}>{runs.length?'Try a different search or clear the filters.':`Launch a journey with this ${definition} to see its results and saved version here.`}</Empty>}
 </section>;
}
