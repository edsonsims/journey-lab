import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveExperienceTakeaway as derive} from './experience-takeaways.ts';

const row=(reaction,extra={})=>({reaction,observation:'A recorded screen.',valence:'positive',findings:[],...extra});
const explicit=(feedback,extra={})=>row('A routine public note.',{moment:{feedback},...extra});

test('structured feedback preserves its grounded summary, consequence and source',()=>{
 const original=explicit({kind:'benefit',summary:'The all-in price was visible before choosing.',why:'Maya could compare rooms against her $250 budget.'}),copy=structuredClone(original),result=derive(original);
 assert.equal(result.summary,'The all-in price was visible before choosing.');assert.equal(result.why,'Maya could compare rooms against her $250 budget.');assert.equal(result.kind,'benefit');assert.equal(result.provenance.kind,'recorded_feedback');assert.deepEqual(original,copy);
});

test('explicit routine narration stays out of the feed even with a positive mood or evaluative legacy phrase',()=>{
 assert.equal(derive(explicit({kind:'routine',summary:'',why:''},{reaction:'The total fits my budget.'})),null);
});

test('invalid or incomplete structured feedback cannot manufacture a takeaway',()=>{
 for(const feedback of [null,[],{kind:'benefit',summary:'Great',why:''},{kind:'invented',summary:'Great',why:'Why'},{kind:'benefit',summary:'x'.repeat(241),why:'Why'},{kind:'benefit',summary:'Great',why:'x'.repeat(601)},{kind:'benefit',summary:'Great',why:'Why',hidden:'unsupported'},{kind:'routine',summary:12,why:''}])assert.equal(derive(explicit(feedback)),null);
 assert.equal(derive(explicit({kind:'benefit',summary:'Great',why:''},{reaction:'The total is over my budget, so I cannot confirm.'})).kind,'friction');
});

test('ordinary navigation never becomes feedback because of a mood, friction score, or screen inventory',()=>{
 for(const reaction of ["I'll type the required meeting purpose exactly as given.","The field is focused, so I'll type the meeting purpose exactly as requested.","Name is in, so I'll check the review before confirming.","Now I'll move to review to see the full cost, including any fees, before I confirm.","I'll re-enter Quarterly planning so I can review Willow's full price.","I'll open my reservations to double-check this booking is saved with the right details."]){
  assert.equal(derive(row(reaction,{valence:'very_negative',aiFriction:3,observation:'An expensive room and the empty meeting-name input are visible.'})),null,reaction);
 }
 for(const reaction of ['', 'That was frustrating.', 'Looks good.', 'Excellent!'])assert.equal(derive(row(reaction)),null);
});

test('future budget verification does not claim a benefit already observed',()=>{
 assert.equal(derive(row("Atlas is the lower-priced 12-seat option, so I'll check whether its full cost stays within my budget.")),null);
 assert.equal(derive(row("I'll check whether this stays within my budget.")),null);
});

test('a positive takeaway keeps the observed constraint fit and removes the next click',()=>{
 const result=derive(row("Willow seats 12 and the $245 total is within my budget, so I'll go with this one."));
 assert.equal(result.summary,'Willow seats 12 and the $245 total is within my budget.');assert.equal(result.why,'');assert.equal(result.kind,'benefit');assert.equal(result.provenance.kind,'recorded_reaction');
});

test('generic requirement-fit reactions carry the exact supporting observation without adding screen inventory to concrete feedback',()=>{
 const observation='Confirmation shows Willow, 12 seats, projector included and $245 total.';
 const result=derive(row("The confirmation matches my requirements, so I'll check my saved reservations.",{observation}));
 assert.equal(result.summary,'The confirmation matches my requirements.');assert.equal(result.why,observation);assert.deepEqual(result.provenance.fields,['reaction','observation']);
 assert.equal(derive(row("Everything on review matches my requirements and budget, so I'll confirm it.",{observation})).why,observation);
 assert.equal(derive(row('Willow is within my $250 budget.',{observation})).why,'');
 assert.equal(derive(row("I'll open the confirmation.",{observation})),null);
});

test('a material negative consequence survives causal extraction with its exact amounts',()=>{
 const result=derive(row('The $280 total is over my $250 limit, so I need to go back and check the other options instead of confirming.',{valence:'negative'}));
 assert.equal(result.summary,'The $280 total is over my $250 limit, so I need to go back and check the other options instead of confirming.');assert.equal(result.kind,'friction');
});

test('lost input retains repeat work as the reason it matters',()=>{
 const result=derive(row("My meeting name didn't carry over when I changed rooms, so I'll enter it again.",{valence:'negative'}));
 assert.equal(result.summary,"My meeting name didn't carry over when I changed rooms.");assert.equal(result.why,"I'll enter it again.");assert.equal(result.kind,'friction');
 const direct=derive(row('Changing to Willow cleared the Quarterly planning name I already entered, so I have to do that work again.'));
 assert.equal(direct.summary,'Changing to Willow cleared the Quarterly planning name I already entered, so I have to do that work again.');
});

test('linked problem leads with its title and carries the recorded persona consequence',()=>{
 const result=derive(row('The $280 total is over my $250 limit, so I cannot confirm.',{title:'Required fees appear late',findings:[{id:'f',impact:'medium',title:'Required fees appear late'}]}));
 assert.equal(result.summary,'Required fees appear late');assert.equal(result.why,'The $280 total is over my $250 limit, so I cannot confirm.');assert.equal(result.provenance.kind,'recorded_finding');
});

test('informational conclusions cannot turn a routine landing moment into a later success',()=>{
 const finding={id:'f',impact:'informational',title:'Reservation is confirmed with all required equipment',personaComment:'The final reservation meets my requirements.'};
 assert.equal(derive(row("I'll click the room.",{findings:[finding]})),null);
 const useful=derive(row("Willow is within my budget, so I'll pick it.",{findings:[finding]}));
 assert.equal(useful.summary,'Willow is within my budget.');assert(!useful.summary.includes('confirmed'));
});

test('a later problem conclusion cannot overwrite an independently positive reaction at its earlier citation',()=>{
 const result=derive(row("Willow is within my budget, so I'll pick it.",{findings:[{id:'f',impact:'high',title:'Later booking confirmation failed',personaComment:'I could not finish the reservation.'}]}));
 assert.equal(result.summary,'Willow is within my budget.');assert.equal(result.kind,'benefit');assert.equal(result.provenance.kind,'recorded_reaction');
});

test('a standalone retrospective finding survives a routine capture annotation',()=>{
 const result=derive(explicit({kind:'routine',summary:'',why:''},{kind:'finding',findings:[{id:'f',impact:'medium',title:'Switching rooms erases input',personaComment:'Changing rooms cleared my name, so I had to enter it again.'}]}));
 assert.equal(result.summary,'Switching rooms erases input');assert.equal(result.kind,'friction');assert.equal(result.why,'Changing rooms cleared my name, so I had to enter it again.');
});

test('a routine pre-review moment cannot inherit a later lost-name finding from its first cited frame',()=>{
 const result=derive(row("Now I'll move to review to see the full cost, including any fees, before I confirm.",{kind:'moment',runId:'ea312038-a7e1-4169-a661-32ffb884503b',eventIndex:9,observation:"Meeting name now reads 'Quarterly planning' and the Atlas sidebar still shows 12 people, 10:00–11:00, projector included.",findings:[{id:'lost-name',impact:'low',title:'Changing rooms cleared the previously entered meeting name',personaComment:'I had to type the same meeting name again after changing rooms, which was unnecessary extra work.'}]}));
 assert.equal(result,null);
});

test('positive field-entry narration cannot inherit a later pricing complaint from its citation',()=>{
 const result=derive(row("The room details match so far; I'll enter the meeting purpose in the name field.",{kind:'moment',runId:'ea312038-a7e1-4169-a661-32ffb884503b',eventIndex:5,observation:"Your meeting step for Atlas shows 12 people, Tomorrow 10:00–11:00, Projector 'Included in your booking', and an empty Meeting name field.",findings:[{id:'late-price',impact:'medium',title:"'Projector included' wording does not mean included in price for every room",personaComment:'Seeing the projector listed as included, I did not expect a $35 projector charge to appear for Atlas at review.'}]}));
 assert.equal(result,null);
});

test('neutral uncertainty and unmet needs remain useful without inventing an emotional rating',()=>{
 const neutral=row("I can't tell whether the mandatory equipment is included in that price.",{valence:'neutral'}),copy=structuredClone(neutral),result=derive(neutral);
 assert.equal(result.kind,'uncertainty');assert.deepEqual(neutral,copy);
 assert.equal(derive(row("We don't have a printer or scissors, so I need to see if there's a way to do this without them.",{valence:null})).kind,'unmet_need');
});

test('legacy Portuguese observations remain sourced while ordinary Portuguese action narration is hidden',()=>{
 assert.equal(derive(row('Vou digitar o nome da atividade.')),null);
 const result=derive(row('Não consigo imprimir os cartões agora, então vou procurar uma alternativa.',{valence:'negative'}));
 assert.equal(result.summary,'Não consigo imprimir os cartões agora, então vou procurar uma alternativa.');assert.equal(result.kind,'friction');
 assert.equal(derive(row('Como quero experimentar antes de criar conta, esta prévia de convidado parece o caminho certo para mim.')).kind,'benefit');
});

test('wording and independent records are not rewritten or merged',()=>{
 const a=row('This room is within my $350 limit.',{runId:'a',personaName:'Alex'}),b={...a,runId:'b',personaName:'Maya'};
 assert.equal(derive(a).summary,a.reaction);assert.deepEqual(derive(a),derive(b));assert.equal(a.runId,'a');assert.equal(b.runId,'b');
});

const rewritten=(extra={})=>({id:'feedback:["r","signal",0]',runId:'r',kind:'benefit',summary:'Showing the $245 total let Maya check the room against her $250 limit before selecting it.',why:'The room list showed 12 seats and the all-in amount, and Maya explicitly judged it within budget.',citations:[{sourceId:'moment.reaction',exactQuote:'Willow seats 12 and the $245 total is within my budget.'}],sourceHash:'sha256-current-source',model:'Muse Wonder',promptVersion:'experience-feedback-v1',version:1,...extra});
const rewrittenRow=(derivedFeedback=rewritten(),extra={})=>row('Everything matches what I need.',{id:'feedback:["r","signal",0]',runId:'r',derivedFeedback,...extra});

test('grounded derived feedback replaces generic captured wording and retains exact evidence provenance',()=>{
 const input=rewrittenRow(rewritten(),{moment:{feedback:{kind:'benefit',summary:'Everything matches my needs.',why:'The room works.'}}}),original=structuredClone(input),result=derive(input);
 assert.equal(result.summary,input.derivedFeedback.summary);assert.equal(result.why,input.derivedFeedback.why);assert.equal(result.provenance.kind,'meta_recorded_evidence');assert.deepEqual(result.provenance.citations,input.derivedFeedback.citations);assert.equal(result.provenance.sourceHash,input.derivedFeedback.sourceHash);assert.deepEqual(input,original);
});

test('derived routine decisions suppress only the takeaway even with a linked retrospective finding',()=>{
 const input=rewrittenRow(rewritten({kind:'routine',summary:'',why:'',citations:[]}),{valence:'positive',findings:[{title:'Later fees exceeded budget',impact:'medium',personaComment:'The final total was over my budget.'}]}),original=structuredClone(input);
 assert.equal(derive(input),null);assert.deepEqual(input,original);
});

test('derived feedback must match the exact source identity and include its source metadata and citations',()=>{
 const invalid=[null,[],rewritten({id:'feedback:["other","signal",0]'}),rewritten({runId:'other'}),rewritten({sourceHash:''}),rewritten({model:''}),rewritten({promptVersion:''}),rewritten({citations:[]}),rewritten({citations:[{sourceId:'moment.reaction',exactQuote:''}]}),rewritten({citations:[null]}),rewritten({summary:'x'.repeat(241)}),rewritten({why:'x'.repeat(601)}),rewritten({kind:'invented'}),rewritten({kind:'routine'})];
 for(const record of invalid){const result=derive(rewrittenRow(record));assert.equal(result.summary,'Everything matches what I need.');assert.equal(result.provenance.kind,'recorded_reaction');}
});

test('derived uncertainty does not invent or overwrite the recorded emotion',()=>{
 const input=rewrittenRow(rewritten({kind:'uncertainty',summary:'Unclear equipment pricing left Maya unable to check the total against her budget.',why:'The recorded reaction asks whether the listed price includes the projector.'}),{valence:'neutral'});
 assert.equal(derive(input).kind,'uncertainty');assert.equal(input.valence,'neutral');
});
