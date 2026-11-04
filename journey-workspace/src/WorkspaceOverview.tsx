import {useState} from 'react';
import type {ReactNode} from 'react';
import {AppLink,Badge,Button} from './App';
import {Icon} from './icons';
import {date,fullDate,initials,num,person,title} from './lib';
import type {Row} from './lib';
import {projectDashboardSummary} from './project-dashboard-metrics';

const percent=(value:number|null)=>value===null?'—':`${Math.round(value)}%`;
const shortNumber=(value:number|null)=>value===null?'—':Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);
const dayLabel=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString('en',{month:'short',day:'numeric',timeZone:'UTC'});
const severity=['critical','high','medium','low'];
function PanelHeading({title:heading,detail,children}:{title:string;detail:string;children?:ReactNode}){return <header className="overview-panel-heading"><div><h2>{heading}</h2><p>{detail}</p></div>{children}</header>;}

type Props={data:Row;base:string;navigate:(path:string)=>void;onNewJourney:()=>void};
export function WorkspaceOverview({data,base,navigate,onNewJourney}:Props){
 const now=Date.now(),summary=projectDashboardSummary(data,now),scope=summary.scope;
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const activity=summary.dailyActivity,day=activity.days.find(item=>item.date===selectedDay);
 const maxActivity=Math.max(1,...activity.days.map(item=>item.total));
 const activePersonas=summary.personaOutcomes.filter(row=>row.current&&row.journeys>0).length;
 const personas=[...summary.personaOutcomes].sort((a,b)=>b.openHighImpactFindings-a.openHighImpactFindings||b.withFriction-a.withFriction||b.journeys-a.journeys);
 const findings=[...summary.openFindings].sort((a,b)=>severity.indexOf(a.impact)-severity.indexOf(b.impact));
 const severityCounts=severity.map(impact=>({impact,count:findings.filter(item=>item.impact===impact).length}));
 const runById=new Map(summary.eligibleRuns.map(run=>[run.id,run]));
 const pipeline=summary.fixPipeline;
 const metrics=[
  {label:'Goal attainment',value:percent(summary.goalAttainment.rate),detail:`${num(summary.goalAttainment.reached)} of ${num(summary.goalAttainment.assessed)} assessed journeys reached their goal`,icon:'check',tone:'green',note:'Completed journeys with a recorded goal or product-obstacle outcome.'},
  {label:'Journeys with friction',value:percent(summary.friction.rate),detail:`${num(summary.friction.affectedCompleted)} of ${num(summary.friction.completed)} completed journeys had problem findings`,icon:'experience',tone:'amber',note:'Each completed journey counts once. Resolved findings remain part of its recorded experience.'},
  {label:'Open high-impact findings',value:num(summary.friction.openHighImpactCount),detail:`Critical + high · ${num(summary.openFindingCount)} open problems across all severities`,icon:'findings',tone:'rose',note:'Excludes dismissed, duplicate and explicitly resolved findings.'},
  {label:'Fixes to review',value:num(summary.pendingReviewFixCount),detail:pipeline.inProgress?`${num(pipeline.inProgress)} more in progress`:'Candidates awaiting your decision',icon:'fixes',tone:'purple',note:'Review the candidate and its retests before approval.'}
 ];
 const outcomes=[
  {label:'Goal reached',value:summary.goalReachedCount,tone:'green'},
  {label:'Product obstacle',value:summary.productBlockedCount,tone:'amber'},
  {label:'Finished, unassessed',value:summary.unassessedCompletedCount,tone:'muted'},
  {label:'In progress',value:summary.inProgressCount,tone:'purple'},
  {label:'Stopped / incomplete',value:summary.incompleteCount,tone:'rose'},
  {label:'Unknown status',value:summary.unknownStatusCount,tone:'muted'}
 ];
 const recent=day?summary.recentRuns.filter(run=>{const time=Date.parse(run.createdAt||run.startedAt||'');return Number.isFinite(time)&&time<=now&&new Date(time).toISOString().slice(0,10)===day.date;}):summary.recentRuns;
 return <div className="workspace-overview">
  <div className="overview-scope"><span><Icon name="activity" size={14}/><strong>{num(scope.eligible)} eligible journeys</strong><span>·</span>All loaded evidence</span><span>{scope.total!==null?`${num(scope.loaded)} / ${num(scope.total)} records loaded`:'History total unavailable'}</span></div>
  {(scope.partial||scope.excluded>0||scope.unscopedRuns>0)&&<p className="overview-scope-note"><Icon name="info" size={14}/><span>{scope.excluded>0&&`${num(scope.excluded)} experimental or invalidated records excluded. `}{scope.unscopedRuns>0&&`${num(scope.unscopedRuns)} records without an app ID excluded. `}{scope.partial&&'Metrics cover loaded evidence only. Load earlier journeys above to expand the scope.'}</span></p>}
  <section className="overview-metrics" aria-label="App performance metrics">{metrics.map(metric=><article key={metric.label} className={`overview-metric tone-${metric.tone}`}><div><span>{metric.label}</span><Icon name={metric.icon} size={17}/></div><strong>{metric.value}</strong><p>{metric.detail}</p><span className="overview-metric-help" title={metric.note}><Icon name="info" size={12}/>{metric.label==='Goal attainment'?'Assessed outcomes only':metric.label==='Journeys with friction'?'Includes journeys that reached their goal':metric.label==='Open high-impact findings'?'Current unresolved findings':'Ready for human review'}</span></article>)}</section>
  {!summary.eligibleRuns.length&&<div className="overview-empty"><Icon name="runs" size={27}/><div><h2>Start collecting product evidence.</h2><p>Your first journey will reveal goal outcomes, friction, and opportunities to improve.</p></div><Button kind="primary" icon="plus" onClick={onNewJourney}>New journey</Button></div>}
  <div className="overview-chart-grid">
   <section className="overview-panel overview-activity">
    <PanelHeading title="Journey activity" detail={`${dayLabel(activity.from)}–${dayLabel(activity.to)} · last 14 days · UTC`}><span className="overview-panel-total"><strong>{num(activity.total)}</strong> journeys</span></PanelHeading>
    <div className="overview-chart-legend"><span><i className="tone-green"/>Goal reached</span><span><i className="tone-amber"/>Product obstacle</span><span><i className="tone-muted"/>Other outcomes / states</span></div>
    <div className="overview-activity-chart" role="group" aria-label="Daily journeys; select a day to filter recent journeys"><div className="overview-chart-scale" aria-hidden="true"><span>{maxActivity}</span><span>{Math.round(maxActivity/2)}</span><span>0</span></div><div className="overview-chart-columns">{activity.days.map((item,index)=><button key={item.date} type="button" className={day?.date===item.date?'selected':''} aria-pressed={day?.date===item.date} aria-label={`${dayLabel(item.date)}: ${item.total} journeys, ${item.goalsReached} goals reached, ${item.productObstacles} product obstacles, ${item.other} other; filter recent journeys`} onClick={()=>setSelectedDay(day?.date===item.date?null:item.date)}><span className="overview-bar-value">{item.total||''}</span><span className="overview-bar-track"><span className="overview-stacked-bar" style={{height:`${item.total/maxActivity*100}%`}}>{[{count:item.other,tone:'muted'},{count:item.productObstacles,tone:'amber'},{count:item.goalsReached,tone:'green'}].filter(segment=>segment.count).map(segment=><span key={segment.tone} className={`tone-${segment.tone}`} style={{flex:segment.count}}/>)}</span></span><span className="overview-bar-date">{index===0||index===activity.days.length-1||index%3===0?dayLabel(item.date):'\u00a0'}</span></button>)}</div></div>
    <footer className="overview-panel-footer"><span>{day?`${dayLabel(day.date)} · ${num(day.total)} journeys selected`:'Select a day to inspect its journeys below.'}{activity.undatedCount>0&&` ${activity.undatedCount} undated journeys omitted.`}{activity.futureCount>0&&` ${activity.futureCount} future-dated journeys omitted.`}</span>{day?<button className="text-button" onClick={()=>setSelectedDay(null)}>Clear day</button>:<AppLink to={`${base}/runs?sort=newest`} navigate={navigate}>Journey history<Icon name="arrow" size={13}/></AppLink>}</footer>
   </section>
   <section className="overview-panel overview-outcomes">
    <PanelHeading title="Outcome breakdown" detail="Every eligible journey, including unfinished runs"/>
    <div className="overview-outcome-visual"><div className="overview-donut" role="img" aria-label={outcomes.map(item=>`${item.label}: ${item.value}`).join(', ')} style={{background:summary.eligibleRuns.length?`conic-gradient(${outcomes.filter(item=>item.value).map((item,index,items)=>{const start=items.slice(0,index).reduce((sum,row)=>sum+row.value,0)/summary.eligibleRuns.length*100,end=start+item.value/summary.eligibleRuns.length*100;return `var(--overview-${item.tone}) ${start}% ${end}%`;}).join(',')})`:'var(--line)'}}><div><strong>{num(summary.eligibleRuns.length)}</strong><span>journeys</span></div></div><dl>{outcomes.filter(item=>item.value||['Goal reached','Product obstacle'].includes(item.label)).map(item=><div key={item.label}><dt><i className={`tone-${item.tone}`}/>{item.label}</dt><dd>{num(item.value)}</dd></div>)}</dl></div>
    <p className="overview-panel-note">A reached goal can still contain friction. Rates describe AI persona journeys across recorded contexts.</p>
   </section>
  </div>
  <div className="overview-detail-grid">
   <section className="overview-panel overview-personas" id="overview-personas">
    <PanelHeading title="Outcomes by persona" detail="See who encounters friction, even when their goal is reached"><AppLink to={`${base}/personas`} navigate={navigate}>Personas<Icon name="arrow" size={13}/></AppLink></PanelHeading>
    {personas.length?<div className="overview-table-scroll"><table className="overview-persona-table"><thead><tr><th>Persona</th><th>Goal attainment</th><th>With friction</th><th>Obstacles</th><th>Open findings</th></tr></thead><tbody>{personas.map((row,index)=><tr key={row.persona.id||'unassigned'}><td><div className="overview-persona-identity"><span className={`avatar ${index%2?'avatar-peach':'avatar-blue'}`}>{initials(row.persona.name||row.persona.label||'Unknown')}</span><span>{row.persona.id?<AppLink to={`${base}/runs?persona=${encodeURIComponent(row.persona.id)}`} navigate={navigate}>{row.persona.name||row.persona.label||row.persona.id}</AppLink>:<strong>Unassigned persona</strong>}<small>{num(row.journeys)} journeys{row.persona.id&&!row.current?' · historical profile':''}</small></span></div></td><td data-label="Goal attainment"><strong>{percent(row.goalRate)}</strong><small>{row.goalsReached} / {row.assessed} assessed</small><span className="overview-mini-meter"><span style={{width:`${row.goalRate||0}%`}}/></span></td><td data-label="With friction"><strong className={row.withFriction?'overview-warning':''}>{row.withFriction}<span className="overview-denominator"> / {row.completed}</span></strong><small>completed journeys</small></td><td data-label="Product obstacles"><strong>{row.productObstacles}</strong></td><td data-label="Open findings"><strong>{row.openFindings}</strong>{row.openHighImpactFindings>0&&<small className="overview-danger">{row.openHighImpactFindings} high / critical</small>}</td></tr>)}</tbody></table></div>:<p className="overview-panel-note">No personas or recorded perspectives in this app yet.</p>}
    <footer className="overview-panel-footer"><span>{activePersonas} / {summary.personaCount} current personas have eligible journeys</span><AppLink to={`${base}/experience`} navigate={navigate}>Explore experience<Icon name="arrow" size={13}/></AppLink></footer>
   </section>
   <section className="overview-panel overview-backlog">
    <PanelHeading title="Open problem findings" detail="Unresolved observations by severity"><span className="overview-panel-total"><strong>{num(summary.openFindingCount)}</strong></span></PanelHeading>
    <div className="overview-severity-list">{severityCounts.map(item=><div key={item.impact}><span><i className={`severity-${item.impact}`}/>{item.impact}</span><span className="overview-severity-track"><span className={`severity-${item.impact}`} style={{width:`${item.count/Math.max(1,summary.openFindingCount)*100}%`}}/></span><strong>{item.count}</strong></div>)}</div>
    <p className="overview-panel-note">Counts are findings, not unique defects. Several observations can describe the same problem.</p>
    <footer className="overview-panel-footer"><AppLink to={`${base}/findings?sort=impact`} navigate={navigate}>Inspect findings<Icon name="arrow" size={13}/></AppLink></footer>
   </section>
  </div>
  <div className="overview-review-grid">
   <section className="overview-panel overview-fixes">
    <PanelHeading title="Fix pipeline" detail="From candidate work to a review decision"><AppLink to={`${base}/fixes`} navigate={navigate}>All fixes<Icon name="arrow" size={13}/></AppLink></PanelHeading>
    <div className="overview-pipeline">{[{label:'In progress',value:pipeline.inProgress,tone:'purple'},{label:'To review',value:pipeline.awaitingReview,tone:'amber'},{label:'Approved',value:pipeline.approved,tone:'green'},{label:'Needs work',value:pipeline.needsWork,tone:'rose'}].map(item=><div className={`tone-${item.tone}`} key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>
    {summary.pendingReviewFixes.length?<div className="overview-review-list">{summary.pendingReviewFixes.slice(0,2).map(fix=><AppLink key={fix.id} to={`${base}/fixes/${encodeURIComponent(fix.id)}`} navigate={navigate}><span className="overview-review-icon"><Icon name="fixes" size={18}/></span><span><small>READY FOR REVIEW</small><strong>{fix.title||'Review candidate'}</strong></span><Icon name="arrow" size={15}/></AppLink>)}</div>:<p className="overview-panel-note">No candidates awaiting review in the loaded evidence.</p>}
    <p className="overview-panel-note">{pipeline.other>0&&`${pipeline.other} other / inactive candidates. `}Approval is separate from deployment and issue resolution.</p>
   </section>
   <section className="overview-panel overview-priorities">
    <PanelHeading title="Findings to investigate" detail="Highest severity first, linked to their source journey"/>
    {findings.length?<div className="overview-finding-list">{findings.slice(0,3).map(finding=><AppLink key={finding.id} to={`${base}/findings/${encodeURIComponent(finding.id)}`} navigate={navigate}><span><Badge value={finding.impact}/><small>{person(runById.get(finding.runId)||finding.sourceRun||finding)}</small></span><strong>{finding.title||finding.observation||'Inspect recorded finding'}</strong><Icon name="arrow" size={14}/></AppLink>)}</div>:<p className="overview-panel-note">No unresolved problem findings in the loaded evidence.</p>}
   </section>
  </div>
  <section className="overview-panel overview-recent">
   <PanelHeading title={day?`Journeys on ${dayLabel(day.date)}`:'Recent journeys'} detail={`${Math.min(4,recent.length)} of ${recent.length} ${day?'journeys on the selected day':'eligible journeys'} shown`}><AppLink to={`${base}/runs?sort=newest`} navigate={navigate}>All journeys<Icon name="arrow" size={13}/></AppLink></PanelHeading>
   {recent.length?<div className="overview-recent-list">{recent.slice(0,4).map(run=><AppLink key={run.id} to={`${base}/runs/${encodeURIComponent(run.id)}`} navigate={navigate}><span className="overview-record-icon"><Icon name="play" size={15}/></span><span><strong>{title(run)}</strong><small>{person(run)}</small></span><Badge value={run.status}/><time dateTime={run.createdAt} title={fullDate(run.createdAt)}>{date(run.createdAt)}</time><Icon name="arrow" size={14}/></AppLink>)}</div>:<p className="overview-panel-note">{day?'No journeys started on this day.':'No journeys recorded yet.'}</p>}
  </section>
  <div className="overview-operations" aria-label="Workspace operations"><AppLink to={`${base}/runs?status=active`} navigate={navigate}><Icon name="activity" size={15}/><strong>{summary.inProgressCount}</strong> in progress</AppLink><AppLink to={`${base}/runs?status=failed&status=interrupted&status=incomplete&status=blocked&status=cancelled&status=canceled`} navigate={navigate}><Icon name="stop" size={15}/><strong>{summary.incompleteCount}</strong> stopped / incomplete</AppLink><span title={summary.tokens.reportedTotal===null?'Usage is not reported':`${num(summary.tokens.reportedTotal)} reported tokens`}><Icon name="tokens" size={15}/><strong>{shortNumber(summary.tokens.reportedTotal)}</strong> reported tokens <small>{summary.tokens.knownRuns}/{summary.tokens.totalRuns} receipts{summary.tokens.partialRuns?` · ${summary.tokens.partialRuns} partial`:''}</small></span><AppLink to={`${base}/settings/integrations`} navigate={navigate}><i className={data.health?.modelConfigured?'connected':''}/>{data.health?.modelConfigured?'Meta configured':'Review mode'}<Icon name="arrow" size={12}/></AppLink></div>
  <p className="overview-footnote">Usage excludes coding. Missing receipts remain unknown. All metrics describe the eligible loaded evidence for this app.</p>
 </div>;
}
