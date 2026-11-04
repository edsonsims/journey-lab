import type {Row} from './lib.ts';

/** Authored UI scenarios. These never enter project history or represent a model run. */
export type ImpactExample = {id:string;title:string;product:string;personaCount:number;description:string};
export const IMPACT_EXAMPLES:readonly ImpactExample[]=Object.freeze([
 {id:'example-relay-import',title:'One-click import, four different outcomes',product:'Customer CRM',personaCount:4,
  description:'A faster CSV import helps clean-data experts, but removes the checks other people depend on.'},
 {id:'example-handoff-links',title:'Faster sharing, a wider blast radius',product:'Document Sharing',personaCount:6,
  description:'Public links remove friction for some people and remove control for others. Six perspectives, including uncertainty.'},
]);

const PROVENANCE='authored_ui_example';
type Tone='very_positive'|'positive'|'neutral'|'negative'|'very_negative'|null;
type Outcome='goal_reached'|'obstacle_observed'|'inconclusive';
type Step={label:string|null;route:string;tone:Tone;reaction:string;observation:string;seconds?:number};
type Persona={id:string;name:string;role:string;goal:string;context:string;knowledge:string[];limitations:string[]};
type Script={outcome:Outcome;summary:string;steps:Step[];incomplete?:boolean};
type Scenario={id:string;product:string;title:string;baseline:string;proposal:string;intent:string;changes:string[];pairs:{persona:Persona;before:Script;after:Script;headline:string}[]};
const step=(label:string|null,route:string,tone:Tone,reaction:string,observation:string,seconds?:number):Step=>({label,route,tone,reaction,observation,seconds});

function authoredRun(scenario:Scenario,persona:Persona,side:'before'|'after',script:Script):Row{
 const id=`${scenario.id}-${persona.id}-${side}`,events:Row[]=[],experience:Row[]=[];
 let elapsed=0;
 script.steps.forEach((point,index)=>{
  elapsed+=index===0?0:(point.seconds??12)*1000;
  if(point.label!==null)events.push({index:events.length,type:'action',isExample:true,provenance:PROVENANCE,
   originalMs:elapsed,url:point.route,action:{type:'click_control',label:point.label},
   click:{target:{label:point.label,role:'button'}}});
  // Existing matching reads route context from this event type. No screenshot
  // exists: this is explicitly an authored screen descriptor, with no media URI.
  const eventIndex=events.length;
  events.push({index:eventIndex,type:'screenshot',isExample:true,provenance:PROVENANCE,
   captureKind:'authored_screen_state',originalMs:elapsed,url:point.route});
  experience.push({eventIndex,originalMs:elapsed,scenarioMs:elapsed,isExample:true,provenance:PROVENANCE,
   exampleStepId:`${point.route}:${point.label===null?'arrive':point.label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,
   exampleStepLabel:point.label??'Arrive on the page',
   clock:'relative_scenario_time',valence:point.tone,reaction:point.reaction,observation:point.observation,
   friction:point.tone==='negative'||point.tone==='very_negative'?'observed_in_scenario':'none_in_scenario'});
 });
 return {id,projectId:scenario.id,personaId:persona.id,personaName:persona.name,status:'finished',isExample:true,
  provenance:PROVENANCE,createdAt:null,startedAt:null,finishedAt:null,
  scenario:{product:scenario.product,label:side==='before'?scenario.baseline:scenario.proposal,
   goal:persona.goal,summary:script.summary,clock:'relative_scenario_time',complete:!script.incomplete},
  personaSnapshot:{...persona,mission:persona.goal,isExample:true,provenance:PROVENANCE,
   memoryMode:'first_time',familiarity:'The role supplies domain knowledge; this is the first visit to this product version.'},
  outcome:script.outcome,finding:{outcome:script.outcome,summary:script.summary},events,experience,
  video:null,replay:null,videoDurationMs:null,originalDurationMs:null,
  scenarioDurationMs:elapsed,
  // Unknown execution totals stay unknown. A partial scene is not a zero-action run.
  scenarioActionCount:script.incomplete?null:events.filter(event=>event.type==='action').length};
}

function metrics(run:Row):Row{
 return {status:run.status,outcome:run.outcome,executedActions:run.scenarioActionCount,
  interactionActions:run.scenarioActionCount,rejectedActions:run.scenario.complete?0:null,
  videoDurationMs:null,wallDurationMs:null,totalTokens:null,sourceHash:null,recording:null,
  isExample:true,provenance:PROVENANCE};
}

function makeRecord(scenario:Scenario):Row{
 const pairs=scenario.pairs.map(({persona,before,after,headline})=>{
  const beforeRun=authoredRun(scenario,persona,'before',before),afterRun=authoredRun(scenario,persona,'after',after);
  const b=metrics(beforeRun),a=metrics(afterRun),actionDelta=typeof a.interactionActions==='number'&&typeof b.interactionActions==='number'?a.interactionActions-b.interactionActions:null;
  const outcomeChange=before.outcome==='inconclusive'||after.outcome==='inconclusive'?'inconclusive':
   before.outcome===after.outcome?'unchanged':after.outcome==='goal_reached'?'improved':'regressed';
  return {personaId:persona.id,personaName:persona.name,personaRole:persona.role,personaSnapshot:{...persona},headline,
   exampleObservation:headline,exampleReason:after.summary,
   exampleBeforeSummary:before.summary,exampleAfterSummary:after.summary,
   beforeRunId:beforeRun.id,afterRunId:afterRun.id,before:beforeRun,after:afterRun,
   isExample:true,provenance:PROVENANCE,
   controls:{status:'matched',issues:[],basis:'Authored scenarios hold persona, goal and input constant.',provenance:PROVENANCE},
   metrics:{before:b,after:a,actionDelta},outcomeChange,
   effortChange:actionDelta===null?'unknown':actionDelta<0?'fewer_actions':actionDelta>0?'more_actions':'same',
   observations:{before:beforeRun.experience,after:afterRun.experience}};
 });
 const inconclusivePairs=pairs.filter(pair=>pair.outcomeChange==='inconclusive').length;
 return {id:scenario.id,projectId:scenario.id,title:scenario.title,intent:scenario.intent,
  product:scenario.product,isExample:true,provenance:PROVENANCE,kind:'local_proposal',provider:'not_connected',
  version:1,createdAt:null,updatedAt:null,changeSummary:scenario.intent,changes:scenario.changes,
  origin:{kind:'local_change',state:'proposed',provider:null,repository:null,number:null,url:null,
   createdAt:null,mergedAt:null,baseRef:null,headRef:null,baseSha:null,headSha:null,mergeSha:null,provenance:PROVENANCE},
  baseline:{label:scenario.baseline,environmentId:null,environmentVersion:null,sourceHash:null,isExample:true},
  proposal:{label:scenario.proposal,environmentId:null,environmentVersion:null,sourceHash:null,isExample:true},
  personas:pairs.map(pair=>({personaId:pair.personaId,personaName:pair.personaName,
   personaSnapshot:pair.personaSnapshot,baselineRunId:pair.beforeRunId,proposalRunId:pair.afterRunId})),
  fixId:null,roundId:null,comparisonId:null,
  report:{status:inconclusivePairs?'inconclusive':'completed',pairs,repair:null,
   summary:{personas:pairs.length,completedPairs:pairs.length-inconclusivePairs,inconclusivePairs,
    outcomeImprovements:pairs.filter(pair=>pair.outcomeChange==='improved').length,
    outcomeRegressions:pairs.filter(pair=>pair.outcomeChange==='regressed').length,
    fewerActionPairs:pairs.filter(pair=>pair.effortChange==='fewer_actions').length,
    moreActionPairs:pairs.filter(pair=>pair.effortChange==='more_actions').length},
   limitations:['Authored UI example. Outcomes, reactions and relative times illustrate a scenario; no browser or model run was performed.']}};
}

function relay():Scenario{
 return {id:'example-relay-import',product:'Customer CRM',title:'Skip CSV review for a one-click import',
  baseline:'Guided import',proposal:'One-click import',
  intent:'Automatically map columns and import valid contacts immediately, skipping the review screen to get a clean file into the CRM faster.',
  changes:['Detect column mappings automatically instead of requiring confirmation.',
   'Skip invalid rows and report only the imported total in the completion message.',
   'Move mapping overrides and rejected-row details out of the primary flow.'],pairs:[
  {persona:{id:'example-relay-nia',name:'Nia',role:'CRM administrator',
    goal:'Import 120 validated contacts without rechecking fields already verified in the source system.',
    context:'A small sales team exports the same clean, standard-column CSV each week. Nia understands CRM fields and expects the import to preserve them.',
    knowledge:['CSV schemas','Standard contact fields','A validated source file'],limitations:['Limited time for a repetitive task','Cannot justify reviewing unchanged mappings every week']},
   headline:'The clean file goes straight through; repetitive confirmation disappears.',
   before:{outcome:'goal_reached',summary:'All 120 contacts import after repeated mapping and validation confirmations.',steps:[
    step(null,'/contacts','neutral','I have already checked this file. I just need to bring it in.','The contacts page offers an import action.'),
    step('Import contacts','/import','neutral','This is the right place.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','negative','These are the same standard fields I verified before exporting.','The guided flow requires confirmation of unchanged column mappings.'),
    step('Confirm mapping','/import/review','negative','Another confirmation for a file with no errors.','A separate validation screen reports no issues and requires another action.'),
    step('Import valid contacts','/import/result','positive','All 120 are here. Finally.','The completion screen reports 120 imported contacts.'),
    step('View contacts','/contacts','positive','The names and companies match my source.','The new contacts appear in the list.') ]},
   after:{outcome:'goal_reached',summary:'The same 120 validated contacts import with fewer confirmations.',steps:[
    step(null,'/contacts','neutral','I have already checked this file. I just need to bring it in.','The contacts page offers an import action.'),
    step('Import contacts','/import','neutral','This is the right place.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','very_positive','All the fields were recognized. That saves a repetitive review.','The file is mapped automatically and the inline result shows all 120 contacts imported.'),
    step('View contacts','/contacts','positive','The names and companies match my source.','The contacts list contains the expected 120 new contacts.') ]}},
  {persona:{id:'example-relay-omar',name:'Omar',role:'Operations coordinator',
    goal:'Import every contact from a 200-row event spreadsheet, correcting errors without losing people.',
    context:'The spreadsheet combines entries from several event hosts. Twenty-eight rows contain inconsistent date formats or missing required company names.',
    knowledge:['The people and organizations in the source file','Spreadsheet cleanup'],limitations:['Does not know the CRM validation rules','Must account for every submitted contact']},
   headline:'The success message hides 28 skipped contacts, so a faster import fails the actual goal.',
   before:{outcome:'goal_reached',summary:'A row-level check identifies 28 errors; correcting the file allows all 200 contacts to import.',steps:[
    step(null,'/contacts','neutral','I need to account for all 200 people from the event.','The contacts list is ready for an import.'),
    step('Import contacts','/import','neutral','The spreadsheet combines a few formats. I hope I can check them.','The import flow accepts a CSV.'),
    step('Choose CSV','/import/review','positive','It tells me exactly which 28 rows need attention.','The review screen lists invalid rows and their failing fields before saving.'),
    step('Replace corrected CSV','/import/review','positive','Now every row passes. Nobody gets lost.','The corrected file passes validation for all 200 rows.'),
    step('Import valid contacts','/import/result','positive','The total matches the source.','The completion screen reports 200 imported contacts.'),
    step('View contacts','/contacts','positive','All 200 people are here, including the rows I corrected.','The list contains all 200 expected contacts after correcting the validation errors.')]},
   after:{outcome:'obstacle_observed',summary:'Only 172 of 200 contacts import; the flow gives no row-level explanation or recovery action.',steps:[
    step(null,'/contacts','neutral','I need to account for all 200 people from the event.','The contacts list is ready for an import.'),
    step('Import contacts','/import','neutral','The spreadsheet combines a few formats. I hope I can check them.','The import flow accepts a CSV.'),
    step('Choose CSV','/import/review','positive','That was quick. It says the import succeeded.','The inline success state reports 172 imported contacts without drawing attention to the skipped rows.'),
    step('View contacts','/contacts','very_negative','Twenty-eight people are missing, and I cannot tell who or why.','The list contains 172 new contacts; no rejected-row download or retry action is available.')] }},
  {persona:{id:'example-relay-sophie',name:'Sophie',role:'First-time account manager',
    goal:'Import a new territory list with the correct membership tier for each account.',
    context:'The CSV has both Plan and Segment columns. Sophie knows what the values mean, but does not know which CRM property stores membership tier.',
    knowledge:['Customer membership tiers','The meaning of the source spreadsheet columns'],limitations:['No prior experience with this CRM','Cannot infer undocumented field mappings']},
   headline:'Automatic mapping removes the explanation a new user needs and assigns the wrong tier.',
   before:{outcome:'goal_reached',summary:'Field descriptions expose the ambiguous mapping, and Sophie selects the correct membership-tier column.',steps:[
    step(null,'/contacts','neutral','This is my first import. I need the tiers to stay correct.','The contacts list offers an import action.'),
    step('Import contacts','/import','neutral','I have the territory spreadsheet ready.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','positive','The field description explains why Plan belongs in Membership tier.','The review shows source values next to destination-field descriptions.'),
    step('Confirm mapping','/import/review','positive','I can verify the examples before committing.','The preview shows the intended membership tiers.'),
    step('Import valid contacts','/import/result','positive','The preview and result agree.','Contacts import with the selected tier mapping.'),
    step('View contacts','/contacts','positive','The membership tiers match my spreadsheet.','The tier column contains the selected plan values for each account.')]},
   after:{outcome:'obstacle_observed',summary:'The importer maps Segment to membership tier without a preview; the wrong assignment is visible only after saving.',steps:[
    step(null,'/contacts','neutral','This is my first import. I need the tiers to stay correct.','The contacts list offers an import action.'),
    step('Import contacts','/import','neutral','I have the territory spreadsheet ready.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','negative','What did it put in Membership tier? I never got to check.','The import completes without showing the selected field mapping.'),
    step('View contacts','/contacts','very_negative','Enterprise and West are not the same kind of information. How do I undo this?','The tier column contains territory values; the completion flow offers no mapping correction or undo.')] }},
  {persona:{id:'example-relay-elias',name:'Elias',role:'Revenue operations analyst',
    goal:'Reconcile the import result against the source before refreshing the weekly revenue report.',
    context:'Elias must confirm row counts and rejected records. The proposed version has a background reporting job whose completion is not included in this scenario.',
    knowledge:['Import reconciliation','Reporting dependencies'],limitations:['Cannot infer a job result from a success toast','Needs an explicit count and rejected-row report']},
   headline:'The reconciliation report has not arrived; its impact is still unknown.',
   before:{outcome:'goal_reached',summary:'An immediate import report accounts for imported and rejected rows.',steps:[
    step(null,'/contacts','neutral','The report cannot refresh until I reconcile this import.','The contacts list offers an import action.'),
    step('Import contacts','/import','neutral','I need a clear accounting of the result.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','positive','The preview accounts for every row.','The review shows imported and rejected row totals.'),
    step('Download import report','/import/report','positive','This is enough to reconcile the batch.','A report lists each accepted or rejected row.')]},
   after:{outcome:'inconclusive',incomplete:true,summary:'The scenario stops while the background report is pending, so reconciliation cannot be evaluated.',steps:[
    step(null,'/contacts','neutral','The report cannot refresh until I reconcile this import.','The contacts list offers an import action.'),
    step('Import contacts','/import','neutral','I need a clear accounting of the result.','The import flow asks for a CSV.'),
    step('Choose CSV','/import/review','neutral','It says the report is being prepared. I still need that result.','The interface reports a pending background reconciliation job.'),
    step('Open import report','/import/report',null,'','The authored scenario ends before the report is available; no later reaction or outcome is supplied.')] }},
 ]};
}

function handoff():Scenario{
 return {id:'example-handoff-links',product:'Document Sharing',title:'Make public links the default sharing action',
  baseline:'Named recipients',proposal:'Instant public link',
  intent:'Replace the recipient picker with an instant copy-link action. Anyone with the link can view unless the sender changes access in advanced settings.',
  changes:['Copy a public viewing link immediately from the primary Share action.',
   'Move recipient restrictions and expiration controls into advanced settings.',
   'Keep existing named-recipient links and their permissions unchanged.'],pairs:[
  {persona:{id:'example-handoff-ari',name:'Ari',role:'Campaign designer',
    goal:'Send a public launch brief to a group of freelance contributors quickly.',
    context:'The brief is already approved for public distribution. Ari does not need to restrict who reads it.',
    knowledge:['Which campaign assets are public','The contributor group'],limitations:['Several recipients are outside the organization','Adding every recipient separately is unnecessary work']},
   headline:'An already-public brief is easier to share without entering every recipient.',
   before:{outcome:'goal_reached',summary:'The public brief can be shared after entering individual recipients.',steps:[
    step(null,'/briefs/launch','neutral','This brief is approved for anyone working on the launch.','The public launch brief is open.'),
    step('Share','/briefs/launch/share','negative','I do not need separate permissions for a public brief.','The dialog requires named recipients before generating a link.'),
    step('Add recipients','/briefs/launch/share','negative','I have to repeat this when another contributor joins.','The recipient list must be maintained manually.'),
    step('Copy link','/briefs/launch/share','positive','The contributors can open it now.','A link is generated for the named contributors.')]},
   after:{outcome:'goal_reached',summary:'The public brief is ready to share with a single action.',steps:[
    step(null,'/briefs/launch','neutral','This brief is approved for anyone working on the launch.','The public launch brief is open.'),
    step('Share','/briefs/launch/share','very_positive','That is all I needed: a link everyone can open.','The primary action copies a public viewing link and shows its audience.')] }},
  {persona:{id:'example-handoff-leah',name:'Leah',role:'External illustrator',
    goal:'Open the approved public launch brief without creating an account.',
    context:'Leah has received a link to public campaign instructions and has no account in the sender’s workspace.',
    knowledge:['Campaign requirements from the invitation'],limitations:['No workspace account','Only needs to read the public brief']},
   headline:'The account wall disappears for an external reader of public content.',
   before:{outcome:'obstacle_observed',summary:'The named-recipient link requires a workspace sign-in the external reader does not have.',steps:[
    step(null,'/shared/launch','neutral','I just need the brief to start drawing.','The invitation opens the shared-brief entry screen.'),
    step('Open brief','/shared/launch/view','very_negative','I was sent the brief, but I cannot get past the account requirement.','The reader is redirected to a workspace sign-in with no guest view.')]},
   after:{outcome:'goal_reached',summary:'The same public brief opens in a guest view.',steps:[
    step(null,'/shared/launch','neutral','I just need the brief to start drawing.','The invitation opens the shared-brief entry screen.'),
    step('Open brief','/shared/launch/view','very_positive','I can see the dimensions and deadline. I can start now.','The guest view displays the approved public brief without an account.')] }},
  {persona:{id:'example-handoff-dev',name:'Dev',role:'Procurement coordinator',
    goal:'Share a confidential vendor contract with two named reviewers only.',
    context:'The document contains negotiated pricing. Dev uses the primary Share action and expects to confirm the audience before a link becomes usable.',
    knowledge:['The two authorized reviewers','The contract’s confidentiality requirement'],limitations:['Must not grant anonymous access','Will not infer access controls hidden in advanced settings']},
   headline:'The primary action creates public access before a confidential sender can restrict it.',
   before:{outcome:'goal_reached',summary:'The contract link is restricted to the two specified reviewers.',steps:[
    step(null,'/contracts/vendor','neutral','Only the two reviewers should see these prices.','The confidential vendor contract is open.'),
    step('Share','/contracts/vendor/share','positive','I can choose the two people before any access is granted.','The recipient picker appears before a share link exists.'),
    step('Confirm reviewers','/contracts/vendor/share','positive','The audience is explicit.','The dialog lists only the two authorized accounts.'),
    step('Copy link','/contracts/vendor/share','positive','This link is restricted to the people I selected.','The copy action preserves named-recipient access.')]},
   after:{outcome:'obstacle_observed',summary:'A public link becomes active immediately; the confidentiality goal fails even if access can later be changed.',steps:[
    step(null,'/contracts/vendor','neutral','Only the two reviewers should see these prices.','The confidential vendor contract is open.'),
    step('Share','/contracts/vendor/share','very_negative','Anyone with the link? I have not even chosen the reviewers yet.','The primary action creates an active public link before presenting audience settings.'),
    step('Advanced settings','/contracts/vendor/share','negative','I can restrict it now, but why was it public first?','The audience restriction is available only after the link has been created.')] }},
  {persona:{id:'example-handoff-priya',name:'Priya',role:'Workspace security reviewer',
    goal:'Verify a shared policy document’s audience and expiration before approving distribution.',
    context:'Priya reviews whether a sender can set and verify access limits at the moment of sharing.',
    knowledge:['Workspace access policy','Audience and expiration requirements'],limitations:['Needs controls visible before distribution','Cannot approve an unspecified audience']},
   headline:'Sharing still works, but audience and expiry checks become harder to discover.',
   before:{outcome:'goal_reached',summary:'Audience and expiry are visible in the initial sharing dialog.',steps:[
    step(null,'/policies/partner','neutral','I need to verify access and expiration together.','The partner policy document is open.'),
    step('Share','/policies/partner/share','positive','Both controls are visible before a link is generated.','The dialog displays named recipients and an expiration field.'),
    step('Review access','/policies/partner/share','positive','The restrictions are clear enough to approve.','The review presents the intended audience and expiration in one summary.')]},
   after:{outcome:'goal_reached',summary:'Priya eventually verifies and restricts access, but only after finding advanced settings.',steps:[
    step(null,'/policies/partner','neutral','I need to verify access and expiration together.','The partner policy document is open.'),
    step('Share','/policies/partner/share','negative','I cannot see an expiry or a restricted audience here.','The primary dialog shows the public link and hides controls in advanced settings.'),
    step('Advanced settings','/policies/partner/share','negative','These are core checks for my task, not occasional preferences.','The audience and expiry controls are discoverable inside the advanced panel.'),
    step('Review access','/policies/partner/share','positive','I can approve after making the restrictions explicit.','The configured access summary now shows the intended restrictions.')] }},
  {persona:{id:'example-handoff-mateo',name:'Mateo',role:'Internal project lead',
    goal:'Open an existing restricted project brief that already names him as a reviewer.',
    context:'Mateo follows a previously issued link while signed in. The proposed change affects newly created links only.',
    knowledge:['The existing project workspace','His authorized review role'],limitations:['Needs the existing restricted link to retain its permissions']},
   headline:'Existing restricted links retain their access and reading flow.',
   before:{outcome:'goal_reached',summary:'An authorized internal reader opens the existing restricted link.',steps:[
    step(null,'/shared/existing','neutral','I am opening the brief from yesterday’s invitation.','The existing named-recipient link recognizes the signed-in account.'),
    step('Open brief','/shared/existing/view','positive','The brief and comments are here.','The authorized reader sees the project brief and comments.')]},
   after:{outcome:'goal_reached',summary:'The same authorized reader opens the same existing restricted link without a changed experience.',steps:[
    step(null,'/shared/existing','neutral','I am opening the brief from yesterday’s invitation.','The existing named-recipient link recognizes the signed-in account.'),
    step('Open brief','/shared/existing/view','positive','The brief and comments are here.','The authorized reader sees the project brief and comments.')] }},
  {persona:{id:'example-handoff-chen',name:'Chen',role:'Customer support lead',
    goal:'Confirm that a guest can open an approved troubleshooting guide after receiving a forwarded link.',
    context:'Chen can create and forward the link, but the recipient’s separate browser session is outside this authored scenario.',
    knowledge:['The guide is approved for public sharing','The customer’s troubleshooting goal'],limitations:['Cannot treat copying a link as proof a recipient can open it','No guest-session result is available']},
   headline:'The sender can copy a link, but the recipient’s result remains unverified.',
   before:{outcome:'goal_reached',summary:'The baseline scenario includes a successful guest-session check.',steps:[
    step(null,'/guides/setup','neutral','I need to know the customer can open this without our workspace account.','The approved troubleshooting guide is open.'),
    step('Share','/guides/setup/share','neutral','I can create the invitation. The recipient still needs to try it.','A sharing invitation is prepared.'),
    step('Check guest access','/guides/setup/guest','positive','The guest view contains the complete guide.','The baseline scenario includes a guest view of the guide.')]},
   after:{outcome:'inconclusive',incomplete:true,summary:'No guest-session check is supplied, so successful access and the recipient’s reaction are unknown.',steps:[
    step(null,'/guides/setup','neutral','I need to know the customer can open this without our workspace account.','The approved troubleshooting guide is open.'),
    step('Share','/guides/setup/share','positive','The link is ready. I still need to check the other side.','A public viewing link is copied.'),
    step('Check guest access','/guides/setup/guest',null,'','The scenario has no guest-browser result or recipient reaction.')] }},
 ]};
}

/** Fresh objects keep UI selection/review experiments from altering the next example load. */
export function getImpactExample(id:string):Row|null{
 return id==='example-relay-import'?makeRecord(relay()):id==='example-handoff-links'?makeRecord(handoff()):null;
}
