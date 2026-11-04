import {SummaryStrip} from './CollectionSummary';
import {librarySummary} from './library-summary-metrics';
import type {LibrarySummaryKind} from './library-summary-metrics';
import type {Row} from './lib';

export function LibraryDataSummary({kind,rows,total=rows.length,label,context={}}:{kind:LibrarySummaryKind;rows:Row[];total?:number;label:string;context?:Row}){
 return <SummaryStrip kind={kind} count={rows.length} total={total} label={label} {...librarySummary(kind,rows,context)}/>;
}
