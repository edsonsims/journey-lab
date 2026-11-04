import {collectionSummary} from './collection-summary-metrics';
import type {CollectionKind,ImpactTotal,SummaryContext,SummaryMetric} from './collection-summary-metrics';
import type {Row} from './lib';

export type SummaryStripProps={count:number;label:string;total?:number;metrics:SummaryMetric[];secondary?:SummaryMetric[];impacts?:ImpactTotal[];impactDetail?:string;ariaLabel?:string;kind?:string};
function Stat({metric}:{metric:SummaryMetric}){
 return <div className={`collection-stat stat-${metric.tone||'neutral'}${metric.value==='0'?' stat-zero':''}${metric.value==='—'?' stat-unknown':''}`} data-stat={metric.key} title={metric.title}><dt>{metric.label}</dt><dd>{metric.value}</dd>{metric.detail&&<small>{metric.detail}</small>}</div>;
}
/** Scope, priority metrics, then supporting context. */
export function SummaryStrip({count,label,total=count,metrics,secondary=[],impacts=[],impactDetail,ariaLabel,kind}:SummaryStripProps){
 const supporting=[...metrics.slice(4),...secondary];
 return <section className="collection-summary" aria-label={ariaLabel||`${label} summary`} data-summary-kind={kind}>
  <div className="collection-summary-scope"><strong>{count.toLocaleString('en')}</strong><span>{label}{total!==count&&<small>of {total.toLocaleString('en')} total</small>}</span></div>
  <dl className="collection-summary-primary">{metrics.slice(0,4).map(metric=><Stat key={metric.key} metric={metric}/>)}</dl>
  {(supporting.length>0||impacts.length>0||impactDetail)&&<div className="collection-summary-secondary">
   {supporting.length>0&&<dl>{supporting.map(metric=><Stat key={metric.key} metric={metric}/>)}</dl>}
   {(impacts.length>0||impactDetail)&&<div className="collection-impact-summary" aria-label="Recorded findings by impact">{impacts.map(({impact,count})=><span key={impact} className={`summary-impact impact-${impact}`}><i aria-hidden="true"/><strong>{count.toLocaleString('en')}</strong>{impact==='informational'?'info':impact}</span>)}{impactDetail&&<small>{impactDetail}</small>}</div>}
  </div>}
 </section>;
}
export function CollectionSummary({kind,rows,total=rows.length,context}:{kind:CollectionKind;rows:Row[];total?:number;context?:SummaryContext}){
 const summary=collectionSummary(kind,rows,context);
 const singular={runs:'journey',findings:'finding',issues:'issue',fixes:'fix',environments:'environment',personas:'persona',charters:'mission'}[kind];
 const plural=kind==='runs'?'journeys':kind==='charters'?'missions':kind;
 return <SummaryStrip count={rows.length} label={rows.length===1?singular:plural} total={total} {...summary} kind={kind} ariaLabel={`${plural} summary`}/>;
}
