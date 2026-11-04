import type {Row} from './lib.ts';

export type ExperienceTakeawayKind='benefit'|'friction'|'uncertainty'|'unmet_need';
export type ExperienceFeedbackCitation={sourceId:string;exactQuote:string};
export type ExperienceTakeaway={summary:string;why:string;kind:ExperienceTakeawayKind;provenance:{kind:'recorded_feedback'|'recorded_reaction'|'recorded_finding'|'meta_recorded_evidence';fields:string[];citations?:ExperienceFeedbackCitation[];sourceHash?:string;model?:string;promptVersion?:string;version?:number|string;createdAt?:string;requestId?:string}};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").toLowerCase();
const kinds=new Set<ExperienceTakeawayKind>(['benefit','friction','uncertainty','unmet_need']);
const list=(value:unknown):Row[]=>Array.isArray(value)?value:[];
const sentence=(value:string)=>{const clean=value.trim().replace(/[,;:]$/,'');return clean&&!/[.!?]$/.test(clean)?`${clean}.`:clean;};

/** The API only returns current-source revisions; the UI also binds them to the exact row. */
function derived(row:Row):ExperienceTakeaway|null|undefined{
 const value=row.derivedFeedback;
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const feedback=value as Row;
 if(!text(row.id)||feedback.id!==row.id||(feedback.runId!==undefined&&feedback.runId!==row.runId)||!text(feedback.sourceHash)||!text(feedback.model)||!text(feedback.promptVersion))return undefined;
 if(typeof feedback.summary!=='string'||typeof feedback.why!=='string'||feedback.summary.length>240||feedback.why.length>600||!Array.isArray(feedback.citations))return undefined;
 const summary=text(feedback.summary),why=text(feedback.why);
 if(feedback.kind==='routine')return !summary&&!why&&!feedback.citations.length?null:undefined;
 if(!kinds.has(feedback.kind)||!summary||!why||!feedback.citations.length)return undefined;
 const citations:ExperienceFeedbackCitation[]=[];
 for(const citation of feedback.citations){
  if(!citation||typeof citation!=='object'||Array.isArray(citation)||!text(citation.sourceId)||!text(citation.exactQuote))return undefined;
  citations.push({sourceId:citation.sourceId,exactQuote:citation.exactQuote});
 }
 return {summary,why,kind:feedback.kind,provenance:{kind:'meta_recorded_evidence',fields:citations.map(citation=>citation.sourceId),citations,sourceHash:feedback.sourceHash,model:feedback.model,promptVersion:feedback.promptVersion,...(feedback.version!==undefined?{version:feedback.version}:{}),...(text(feedback.createdAt)?{createdAt:feedback.createdAt}:{}),...(text(feedback.provenance?.requestId)?{requestId:feedback.provenance.requestId}:{})}};
}

function reactionTakeaway(value:string):{summary:string;why:string}{
 // Keep the experienced reason, not the next click. Matching is against the original
 // string so the result remains an extract of the recorded words, including numbers.
 const nextAction=/(?:,?\s+so\s+|;\s*|\s+[—–]\s+|,?\s+ent[aã]o\s+)((?:(?:now|next|just)\s+)?I(?:['’]ll| will| am going to)\s+(?:just\s+)?(?:click|type|enter|re-enter|select|choose|open|scroll|review|check|try|confirm|save|move|go|name|pick|continue|verify|take|add)|vou\s+(?:clicar|digitar|inserir|escolher|selecionar|abrir|rolar|descer|subir|verificar|tentar|confirmar|salvar|voltar|continuar|conferir|checar|testar))\b/i.exec(value);
 if(!nextAction||!nextAction.index)return {summary:value,why:''};
 const head=sentence(value.slice(0,nextAction.index)),tail=sentence(value.slice(nextAction.index+nextAction[0].length-nextAction[1].length));
 // Re-entering lost work is a consequence, rather than routine forward navigation.
 const repeatWork=/\b(?:again|re-enter|de novo|novamente|refazer)\b/i.test(tail)&&meaningfulKind(head)==='friction';
 return {summary:head,why:repeatWork?tail:''};
}

// Legacy recordings did not label a takeaway separately from public action narration.
// These conservative, language-aware checks select existing evaluative text; they never
// manufacture a reason from valence, friction scores, a screenshot, or a persona goal.
const uncertainty=/\b(?:unclear|uncertain|not sure|can't tell|cannot tell|couldn't tell|don't know|do not know|not clear|hard to tell|unsure|nao sei|nao esta claro|nao consigo saber|nao fica claro)\b/;
const friction=/\b(?:can't|cannot|couldn't|unable to|forced to|have to .{0,70}again|has to .{0,70}again|need to .{0,70}again|lost|cleared|erased|reset|didn't carry|did not carry|didn't save|did not save|doesn't save|does not save|doesn't work|does not work|not working|broken|failed|not saved|not retained|over .{0,40}(?:budget|limit)|above .{0,40}(?:budget|limit)|exceed(?:s|ed)? .{0,40}(?:budget|limit)|unexpected|confusing|confused|frustrating|misleading|too (?:late|small|slow|expensive)|doesn't mean|does not mean|still (?:requires?|tells|asks)|nao consigo|nao consegui|nao posso|perdi|apagou|limpou|sumiu|nao manteve|nao salvou|nao guardou|nao vi mudanca|nao vejo mudanca|de novo|novamente|refazer)\b/;
const unmetNeed=/\b(?:no (?:way|option|alternative|access)|don't have|do not have|have no|doesn't (?:offer|support|provide)|does not (?:offer|support|provide)|missing .{0,50}(?:need|require)|nao (?:vejo|vi|encontrei) (?:uma? )?(?:opcao|alternativa|atividade)|sem (?:opcao|alternativa)|nao (?:tenho|temos)|pede (?:logo )?conta|pede conta|conta (?:logo |ja )?no (?:passo|primeiro)|pede .{0,20}conta .{0,25}(?:antes|primeir))\b/;
const benefit=/\b(?:(?:within|under|below|fits? .{0,25}|meets? .{0,25}|matches? .{0,25}|stays? .{0,25}|keeps? .{0,25}).{0,35}(?:budget|limit|requirements|needs)|meets? (?:all |everything )?(?:my|our|the) requirements|matches? (?:everything|what) (?:i|we) need|fits? .{0,30}(?:people|seats?|of us|age|minutes)|meets? .{0,30}(?:seat|projector|time) .{0,30}needs|helps? (?:me|us)|lets? (?:me|us)|allows? (?:me|us)|can .{0,70}without|clear (?:total|price|pricing|instructions|next step)|(?:total|price|instructions|next step) (?:is|are) clear|easy to|easier to|exactly what .{0,25}(?:looking for|need)|hasn't changed|has not changed|no extra charge|no (?:need|requirement) to|dentro (?:do|de) .{0,15}orcamento|atende .{0,30}(?:necessidade|requisito)|permite .{0,45}(?:sem|antes)|(?:previa|visitante|convidado).{0,55}(?:caminho certo|experimentar|testar)|(?:caminho certo).{0,20}(?:mim|nos))\b/;

function meaningfulKind(value:string):ExperienceTakeawayKind|null{
 const n=normalized(value);
 if(n.split(/\s+/).length<3||/^(?:(?:this|that|it|everything) (?:is|was|seems|looks|feels) |i(?:'m| am) )?(?:really |very |so )?(?:good|bad|great|fine|helpful|nice|confusing|confused|frustrating|frustrated|disappointing|excellent)[.!?]*$/.test(n))return null;
 // Pure future actions remain narration, including a purpose that has not been observed.
 // An evaluative clause after "because/but" is still considered on its own evidence.
 const actionStart=/^(?:(?:now |next |then )?(?:i(?:'ll| will| am going to)|let's|we(?:'ll| will)) (?:click|type|enter|re-enter|select|choose|open|scroll|review|check|try|confirm|save|move|go|name|pick|continue|verify)|vou (?:clicar|digitar|inserir|escolher|selecionar|abrir|rolar|descer|subir|verificar|tentar|confirmar|salvar|voltar|continuar|conferir|checar|testar))/;
 if(actionStart.test(n)&&!/(?:because|but|since|as .{0,15}(?:lost|missing)|porque|mas|pois)\b/.test(n))return null;
 if(uncertainty.test(n))return 'uncertainty';
 if(unmetNeed.test(n))return 'unmet_need';
 if(friction.test(n))return 'friction';
 if(benefit.test(n))return 'benefit';
 return null;
}

function structured(value:unknown):ExperienceTakeaway|null|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const feedback=value as Row;
 if(Object.keys(feedback).some(key=>!['kind','summary','why'].includes(key))||typeof feedback.summary!=='string'||typeof feedback.why!=='string'||feedback.summary.length>240||feedback.why.length>600)return undefined;
 if(feedback.kind==='routine')return null;
 const summary=text(feedback.summary),why=text(feedback.why);
 if(!kinds.has(feedback.kind)||!summary||!why||summary.length>240||why.length>600)return undefined;
 return {summary,why,kind:feedback.kind,provenance:{kind:'recorded_feedback',fields:['moment.feedback.summary','moment.feedback.why']}};
}

/** A sourced experience takeaway, or null when only routine/unsupported narration exists. */
export function deriveExperienceTakeaway(row:Row):ExperienceTakeaway|null{
 const rewritten=derived(row);
 if(rewritten!==undefined)return rewritten;
 const explicit=structured(row.moment?.feedback??row.feedback);
 if(explicit)return explicit;
 const reaction=text(row.reaction||row.moment?.reaction),extracted=reactionTakeaway(reaction),reactionKind=explicit===null?null:meaningfulKind(extracted.summary);
 const findings=list(row.findings);
 const adverse=findings.filter(f=>['critical','high','medium','low'].includes(f.impact)&&text(f.title));
 // A source-linked problem title is a compact lead, with its actual persona effect below.
 // Informational findings may cite an earlier frame than their final conclusion: never
 // turn their retrospective headline into an event that happened on this frame.
 if(adverse.length&&reactionKind&&reactionKind!=='benefit'){
  const title=text(adverse.find(f=>f.title===row.title)?.title||adverse[0].title);
  const reason=[extracted.summary,extracted.why].filter(Boolean).join(' ');
  return {summary:title,why:reason===title?'':reason,kind:reactionKind,provenance:{kind:'recorded_finding',fields:['findings.title','reaction']}};
 }
 if(reactionKind){
  const n=normalized(extracted.summary),observation=text(row.observation||row.moment?.observation);
  const genericFit=reactionKind==='benefit'&&/\b(?:matches?|meets?)\b.{0,45}\b(?:requirements|needs|what i need|everything i need)\b/.test(n)&&!/[0-9]|\b(?:without|extra charge|easy to|easier to)\b/.test(n);
  // "Matches my requirements" is useful but vague. Its original observation may
  // supply the concrete details; quote that source rather than invent a rationale.
  const supportingObservation=genericFit&&!extracted.why&&observation&&observation!==extracted.summary?observation:'';
  return {...extracted,why:extracted.why||supportingObservation,kind:reactionKind,provenance:{kind:'recorded_reaction',fields:['reaction',...(supportingObservation?['observation']:[])]}};
 }
 // Standalone findings are retrospective, not timed feelings. A recorded finding can
 // explain a material gap even when its cited frame had only an ordinary action note.
 // A moment may be only the first citation of a later finding. Without an evaluative
 // reaction of its own, that link cannot move the later consequence into this frame.
 if(row.kind!=='finding')return null;
 for(const finding of adverse){
  const comment=text(finding.personaComment),observation=text(finding.observation),title=text(finding.title);
  const commentKind=meaningfulKind(comment),observationKind=meaningfulKind(observation),titleKind=meaningfulKind(title);
  const why=commentKind?comment:observationKind?observation:'';
  if(commentKind||observationKind||titleKind)return {summary:title,why:why===title?'':why,kind:commentKind||observationKind||titleKind!,provenance:{kind:'recorded_finding',fields:['findings.title',...(why?[commentKind?'findings.personaComment':'findings.observation']:[])]}};
 }
 return null;
}
