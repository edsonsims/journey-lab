import type {JourneyReviewDecision} from './journey-matching.ts';

type Pair=Pick<JourneyReviewDecision,'beforeId'|'afterId'>;
type PreviousPair=Pair&Pick<JourneyReviewDecision,'source'>;
const samePair=(a:Pair,b:Pair)=>a.beforeId===b.beforeId&&a.afterId===b.afterId;

/** Replace one review edge; unrelated reviews remain for normal conflict validation. */
export function replaceJourneyPair(
 decisions:readonly JourneyReviewDecision[],
 next:Pair,
 previous?:PreviousPair|null,
):JourneyReviewDecision[]{
 const remaining=decisions
  .filter(decision=>!samePair(decision,next)&&(!previous||!samePair(decision,previous)))
  .map(decision=>({...decision}));
 if(previous&&!samePair(previous,next))remaining.push({
  beforeId:previous.beforeId,afterId:previous.afterId,status:'rejected',source:previous.source,
 });
 remaining.push({beforeId:next.beforeId,afterId:next.afterId,status:'accepted',source:'manual'});
 return remaining;
}
