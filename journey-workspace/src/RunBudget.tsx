import {list,num,totals,type Row} from './lib';
import './run-budget.css';

export function RunBudget({run}:{run:Row}){
 const stop=[...list(run.events)].reverse().find(event=>event.type==='budget_stop');
 if(!stop)return null;
 const budget=stop.budget;
 const used=budget?.actualUsed??totals(run),limit=budget?.tokenLimit??run.executionPolicy?.maxTokens;
 const heading=budget?.reason==='estimated_next_request'?'Next request exceeds the reserve':budget?.reason==='actual_exhaustion'?'Token limit reached':'Journey stopped at its budget guard';
 return <section className="run-budget" aria-label="Journey budget stop"><div><h3>{heading}</h3><p>{budget?.reason==='estimated_next_request'?'The next request was stopped before it was sent. Reserved tokens are an estimate, not billed usage.':budget?.reason==='actual_exhaustion'?'Provider-reported usage reached the configured limit. The recording is preserved.':'The recording is preserved. This older receipt does not include the estimate that triggered the stop.'}</p></div><dl><div><dt>Actual usage</dt><dd>{num(used)}</dd></div><div><dt>Journey limit</dt><dd>{num(limit)}</dd></div>{budget?.inputEstimate!=null&&<div><dt>Next input estimate</dt><dd>{num(budget.inputEstimate)}</dd></div>}</dl></section>;
}
