import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {AppLink,Badge,Button,useResource} from './App';
import {Icon} from './icons';
import {list} from './lib';
import type {Row} from './lib';
import {GATHER_DEMO_IMPACT_ID,gatherDashboardStory,isRecordedGatherStage} from './dashboard-story';
import {storyPath} from './story-path';
import {guideChapterIndex} from './gather-guide-navigation';
import './gather-case-study.css';

const scene=new URL('./assets/dashboard-story/meeting-room.png',import.meta.url).href;
const product=new URL('./assets/dashboard-story/gather-proposal.jpg',import.meta.url).href;
const before=new URL('./assets/dashboard-story/proposal-review.jpg',import.meta.url).href;
const after=new URL('./assets/dashboard-story/repaired-review.jpg',import.meta.url).href;
const proposedPrice=new URL('./assets/dashboard-story/proposal-room-price.png',import.meta.url).href;
const candidatePrice=new URL('./assets/dashboard-story/candidate-room-price.png',import.meta.url).href;
const priceCrop:[number,number,number,number]=[568,686,145,66];
const priceHighlight:[number,number,number,number]=[578,695,124,49];
const nameCleared=new URL('./assets/dashboard-story/proposal-name-cleared.png',import.meta.url).href;
const namePreserved=new URL('./assets/dashboard-story/candidate-name-preserved.png',import.meta.url).href;
type FocusProps={image:string;alt:string;crop:[number,number,number,number];size?:[number,number];tone?:'problem'|'resolved'|'neutral';label:string;caption:string;source:string;to?:string;navigate:(path:string)=>void;highlight?:[number,number,number,number]};
/** Show the important pixels first; the unchanged full screenshot remains available. */
function EvidenceFocus({image,alt,crop,size=[1280,888],tone='neutral',label,caption,source,to,navigate,highlight}:FocusProps){
 const clipId=useId();
 return <figure className={'case-evidence-focus '+tone}>
  <figcaption className="case-focus-label">{label}</figcaption>
  <div className="case-focus-window"><svg viewBox={crop.join(' ')} role="img" aria-label={alt} preserveAspectRatio="xMidYMid meet"><defs><clipPath id={clipId}><rect x={crop[0]} y={crop[1]} width={crop[2]} height={crop[3]}/></clipPath></defs><image href={image} width={size[0]} height={size[1]} clipPath={`url(#${clipId})`}/>{highlight&&<rect className="case-focus-highlight" x={highlight[0]} y={highlight[1]} width={highlight[2]} height={highlight[3]} rx="5"/>}</svg><span className="case-zoom-label"><Icon name="search" size={11}/>Detail view</span></div>
  <p className="case-focus-takeaway">{caption}</p>
  <details className="case-full-frame"><summary>See full screen<Icon name="down" size={12}/></summary><img src={image} alt={alt+' Full source screen.'} width={size[0]} height={size[1]} loading="lazy"/><p>{source}</p>{to&&<AppLink to={to} navigate={navigate}>Watch this recorded moment<Icon name="play" size={12}/></AppLink>}</details>
 </figure>;
}
const chapters=[{id:'change',label:'The change'},{id:'people',label:'The people'},{id:'mismatch',label:'Price & fix'},{id:'difference',label:'Name & fix'},{id:'repair',label:'The candidate'},{id:'retest',label:'The retest'}];
function TrailMarkers({number}:{number:number}){return <><span className="case-waypoint" data-path-node aria-hidden="true">0{number}</span><span className="case-bend" data-path-node aria-hidden="true"/><span className="case-exit" data-path-node aria-hidden="true"/></>;}
const originalReview='ea312038-a7e1-4169-a661-32ffb884503b',repairedReview='de304bc2-6ccd-422a-a5d3-2a4cdacb1e0d';
type Props={data:Row;base:string;navigate:(path:string)=>void;onWorkspace:()=>void;onFilm:()=>void};

export function GatherCaseStudy({data,base,navigate,onWorkspace,onFilm}:Props){
 const resource=useResource('/change-impacts/'+GATHER_DEMO_IMPACT_ID+'?projectId=gather',0,true);
 const story=resource.error?null:gatherDashboardStory(resource.data);
 const [active,setActive]=useState(0),sections=useRef<(HTMLElement|null)[]>([]),opened=useRef(false),opening=useRef<HTMLDivElement>(null),trail=useRef<HTMLDivElement>(null);
 const [selectedFrame,setSelectedFrame]=useState<'before'|'after'>('before');
 const [path,setPath]=useState<{d:string;width:number;height:number}|null>(null);
 const comparison=base+'/impact/'+GATHER_DEMO_IMPACT_ID;
 const fix=story?list(data.fixes).find(item=>item.id===story.fixId):null;
 const maya=story?.personas.find(persona=>persona.id==='gather-coordinator');
 const alex=story?.personas.find(persona=>persona.id==='gather-assistant');
 const repairValid=!!story?.repairComplete&&isRecordedGatherStage(maya,'repair')&&isRecordedGatherStage(alex,'repair');
 const proposalValid=isRecordedGatherStage(maya,'proposal')&&isRecordedGatherStage(alex,'proposal');
 const knownFrames=resource.data?.report?.repair?.status==='completed'&&isRecordedGatherStage(maya,'repair');
 const knownCandidateCheck=knownFrames&&story?.fixId==='4c801e88-44d9-4dfe-8148-2ffb9b9d78f1'&&story?.roundId==='bdca6a99-c20f-4db4-bb98-7dd355f1e9cf';
 const fixPath=base+'/fixes'+(story?.fixId?'/'+encodeURIComponent(story.fixId):'');
 function goToChapter(index:number){
  setActive(index);
  const url=new URL(window.location.href);url.searchParams.delete('view');url.searchParams.delete('step');url.searchParams.set('chapter',chapters[index].id);window.history.replaceState({},'',url);
  const heading=sections.current[index]?.querySelector<HTMLElement>('h3');
  heading?.focus({preventScroll:true});sections.current[index]?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 }
 useEffect(()=>{
  if(!story||opened.current)return;
  opened.current=true;
  const index=guideChapterIndex(window.location.search);
  if(index!==null){setActive(index);sections.current[index]?.scrollIntoView({block:'start'});}
 },[story]);
 useEffect(()=>{
  if(!story||typeof IntersectionObserver==='undefined')return;
  const visible=new Map<Element,IntersectionObserverEntry>();
  const observer=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{if(entry.isIntersecting)visible.set(entry.target,entry);else visible.delete(entry.target);});
   const first=[...visible.keys()].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
   if(first)setActive(Number((first as HTMLElement).dataset.chapter));
  },{rootMargin:'-15% 0px -55% 0px',threshold:0});
  sections.current.forEach(section=>{if(section)observer.observe(section);});
  if(opening.current)observer.observe(opening.current);
  return()=>observer.disconnect();
 },[!!story]);
 useLayoutEffect(()=>{
  const element=trail.current;if(!element||!story)return;
  const update=()=>{
   const bounds=element.getBoundingClientRect();
   const nodes=Array.from(element.querySelectorAll<HTMLElement>('[data-path-node]')).map(node=>{
    const box=node.getBoundingClientRect();return{x:box.left-bounds.left+box.width/2,y:box.top-bounds.top+box.height/2};
   });
   if(nodes.length<2||!bounds.width)return;
   const d=storyPath(nodes);
   setPath(current=>current?.d===d&&current.width===bounds.width&&current.height===bounds.height?current:{d,width:bounds.width,height:bounds.height});
  };
  update();
  if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(update);observer.observe(element);
  sections.current.forEach(section=>{if(section)observer.observe(section);});
  return()=>observer.disconnect();
 },[!!story]);
 return <section className="gather-case-study" aria-label="Gather guided example">
  <div className="case-opening" ref={opening} data-chapter="0">
   <div className="case-opening-copy"><span className="case-example-label"><Icon name="folder" size={13}/>EXAMPLE APP · GATHER</span><span className="story-kicker">JOURNEY LAB IN ACTION</span><h2 tabIndex={-1} data-story-start>One booking change.<br/><em>Two different experiences.</em></h2><p>Follow Journey Lab as it explores a proposed change through Alex and Maya’s perspectives, connects their actions to feedback, and prepares an improvement for review.</p><p className="case-product-context"><strong>The product being explored:</strong> Gather is a fictional meeting-room booking app. Its <strong>Quick booking</strong> update brings room selection to the first screen.</p><div className="case-opening-actions"><Button kind="primary" icon="arrow" disabled={!story} onClick={()=>goToChapter(0)}>Follow the journey</Button><Button icon="play" onClick={onFilm}>Watch the 90-second story</Button></div><div className="case-opening-meta"><span><Icon name="personas" size={14}/>2 AI personas</span><span><Icon name="branch" size={14}/>1 proposed change</span><span><Icon name="film" size={14}/>Recorded evidence</span></div></div>
   <figure className="case-scene"><img src={scene} alt="Illustration of a sunlit meeting room with an oval table, chairs and a projector" loading="lazy" width="1536" height="1024"/><figcaption><span>THE SHARED TASK</span><strong>One room. Twelve people.<br/>A meeting to make happen.</strong><small>Illustrated demo setting</small></figcaption></figure>
  </div>
  <p className="case-route-caption"><Icon name="branch" size={14}/>One change. Six stops. Follow the evidence as the story unfolds.</p>
  <nav className="case-chapter-nav" aria-label="Guided example stops">{chapters.map((chapter,index)=><button key={chapter.id} type="button" aria-current={active===index?'step':undefined} disabled={!story} onClick={()=>goToChapter(index)}><span>0{index+1}</span>{chapter.label}<Icon name="arrow" size={14}/></button>)}</nav>
  {resource.loading&&!story?<div className="story-loading"><span className="loading-orbit"/><p>Opening the recorded Gather journeys…</p></div>:!story?<div className="story-unavailable"><Icon name="info" size={24}/><h3>The recorded comparison is unavailable.</h3><p>{resource.error||'This machine does not contain the selected demo evidence.'}</p><AppLink className="button" to={base+'/impact'} navigate={navigate}>Open change impact<Icon name="arrow" size={14}/></AppLink></div>:<div ref={trail} className="case-journey-trail">
   {path&&<svg className="case-journey-path" viewBox={`0 0 ${path.width} ${path.height}`} aria-hidden="true"><path className="case-path-underlay" d={path.d}/><path className="case-path-line" d={path.d}/></svg>}
   <section className={`case-stop case-stop-1 ${active===0?'is-current':''}`} id="gather-change" data-chapter="0" ref={element=>{sections.current[0]=element;}} aria-labelledby="gather-change-title">
    <TrailMarkers number={1}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">01 / START WITH A PRODUCT CHANGE</span><h3 id="gather-change-title" tabIndex={-1}>Rooms first.<br/>Fewer screens.</h3><p>Gather’s proposed Quick booking flow brings the room choice up front. A promising shortcut. But will it work for everyone?</p></div>
     <div className="case-change-scene"><figure className="case-product-screen"><div className="case-window-label"><i/><span>Gather / Proposed Quick booking</span></div><img src={product} alt="Gather’s proposed room-selection screen, showing Atlas at a $220 room rate and Willow at $235" width="1280" height="914" loading="lazy"/><figcaption>Product screenshot · proposed version</figcaption></figure><aside className="case-scene-note"><span className="case-note-arrow" aria-hidden="true">↙</span><strong>The room comes first.</strong><p>The full price comes later.</p><span>That small gap changes the story.</span></aside></div>
    </div>
   </section>
   <section className={`case-stop case-stop-2 ${active===1?'is-current':''}`} id="gather-people" data-chapter="1" ref={element=>{sections.current[1]=element;}} aria-labelledby="gather-people-title">
    <TrailMarkers number={2}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">02 / ADD THE PEOPLE’S CONTEXT</span><h3 id="gather-people-title" tabIndex={-1}>Same task.<br/>Different limits.</h3><p>A room for 12 people. A projector. Two AI personas with different definitions of a good booking.</p></div>
     <div className="case-personas">{story.personas.map(persona=>{
      const isMaya=persona.id==='gather-coordinator';
      return <article className={'case-persona '+(isMaya?'is-maya':'is-alex')} key={persona.id}>
       <div className="case-persona-top"><span className="case-persona-initial" aria-hidden="true">{isMaya?'M':'A'}</span><div><h4>{isMaya?'Maya':'Alex'}</h4><span>{isMaya?'Office coordinator':'Executive assistant'}</span></div></div>
       <div className="case-persona-budget"><strong>{isMaya?'$250':'$350'}</strong><span>CAD total budget</span></div><h5>{isMaya?'Every dollar counts.':'Keep things moving.'}</h5><p>{isMaya?'Needs the complete price before committing. The total must stay within budget.':'A suitable room within the allowance is enough. A direct route matters.'}</p>
       <details className="case-source-detail"><summary>Read the persona brief<Icon name="down" size={13}/></summary><p>{persona.context||persona.mission||'No context recorded.'}</p>{persona.constraints&&<p>{persona.constraints}</p>}{persona.expectations&&<p>{persona.expectations}</p>}<AppLink to={base+'/personas/'+encodeURIComponent(persona.id)} navigate={navigate}>Open persona<Icon name="arrow" size={13}/></AppLink></details>
      </article>;
     })}</div><p className="case-caption">AI Personas with declared context, not research participants.</p>
    </div>
   </section>
   <section className={`case-stop case-stop-3 ${active===2?'is-current':''}`} id="gather-mismatch" data-chapter="2" ref={element=>{sections.current[2]=element;}} aria-labelledby="gather-mismatch-title">
    <TrailMarkers number={3}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">03 / PROBLEM → FIX · THE PRICE</span><h3 id="gather-mismatch-title" tabIndex={-1}>Same room.<br/>Full price, up front.</h3><p>Atlas costs $280 in both versions. The change is showing the total before Maya chooses it.</p></div>
     {knownFrames?<>
      <div className="case-pair-context"><span>Atlas · room selection</span><span><Icon name="search" size={12}/>Same zoom</span></div>
      <div className="case-focus-pair case-price-focus case-matched-pair" aria-label="Atlas room price, problem and fix at matching zoom">
       <EvidenceFocus image={proposedPrice} size={[1440,1000]} crop={priceCrop} highlight={priceHighlight} tone="problem" label="Problem · proposed flow" alt="Proposed Atlas room-selection price: $220 room rate per hour, without the full booking total" caption="$220 room rate. The $60 in extras appears later." source="Maya’s fresh proposed session · room selection · 2.124s. Atlas’s final total is $280." to={base+'/runs/'+originalReview+'?tab=journey&mode=original&at=2124'} navigate={navigate}/>
       <span className="case-focus-connector" aria-hidden="true"><Icon name="arrow" size={21}/></span>
       <EvidenceFocus image={candidatePrice} size={[1440,1000]} crop={priceCrop} highlight={priceHighlight} tone="resolved" label="Fix · candidate" alt="Candidate Atlas room-selection price: $280 total for your meeting, shown before selection" caption="$280 total. The whole cost is visible now." source="Maya’s candidate session · room selection · 2.128s. Same Atlas booking and total, shown earlier." to={base+'/runs/'+repairedReview+'?tab=journey&mode=original&at=2128'} navigate={navigate}/>
      </div>
      <p className="case-pair-takeaway"><Icon name="check" size={17}/><span>Maya can rule out Atlas’s $280 total against her $250 budget <strong>before entering her details.</strong></span></p>
     </>:<p className="case-caption">The matched room-selection recordings are unavailable. Inspect the source journeys before comparing prices.</p>}

    </div>
   </section>
   <section className={`case-stop case-stop-4 ${active===3?'is-current':''}`} id="gather-difference" data-chapter="3" ref={element=>{sections.current[3]=element;}} aria-labelledby="gather-difference-title">
    <TrailMarkers number={4}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">04 / PROBLEM → FIX · THE MEETING NAME</span><h3 id="gather-difference-title" tabIndex={-1}>{knownCandidateCheck?<>Change the room.<br/>Keep the meeting name.</>:'Inspect the room-change behavior.'}</h3><p>{knownCandidateCheck?'Both screens show the same point: after switching from Atlas to Willow.':'Inspect the recorded room switch and the current candidate’s checks.'}</p></div>
     {knownFrames?<>
      <div className="case-pair-context"><span>Meeting name · after changing rooms</span><span><Icon name="search" size={12}/>Same zoom</span></div>
      <div className="case-focus-pair case-name-focus case-matched-pair" aria-label="Meeting name after changing rooms, problem and fix at matching zoom">
       <EvidenceFocus image={nameCleared} size={[1440,1000]} crop={[168,409,320,105]} tone="problem" label="Problem · proposed flow" alt="Recorded proposed flow after choosing Willow: meeting-name field is empty; e.g. Quarterly planning is placeholder text" caption="The name is erased. Maya has to type it again." source="Maya’s fresh proposed session · after changing to Willow · 29.315s. She previously entered Quarterly planning." to={base+'/runs/'+originalReview+'?tab=journey&mode=original&at=29315'} navigate={navigate}/>
       <span className="case-focus-connector" aria-hidden="true"><Icon name="arrow" size={21}/></span>
       {knownCandidateCheck?<EvidenceFocus image={namePreserved} size={[1360,969]} crop={[128,409,320,105]} tone="resolved" label="Fix · candidate" alt="Scripted candidate check after choosing Willow: Quarterly planning remains in the meeting-name field" caption="The name stays. No repeated entry." source="Scripted browser check on this candidate · the meeting name remained after switching rooms. Separate from Maya’s AI journey." navigate={navigate}/>:<p className="case-caption">The saved room-change check is unavailable for this candidate. Open the current candidate to inspect its evidence.</p>}
      </div><p className="case-caption">Problem: recorded AI journey. Fix: scripted candidate check of the same room switch.</p>
     </>:<p className="case-caption">The original room-change recording is unavailable. Inspect the source journeys for this behavior.</p>}
     <details className="case-source-detail case-path-comparison"><summary>Compare Alex and Maya’s paths<Icon name="down" size={13}/></summary><p>{proposalValid?"Earlier current → proposed comparison. Alex’s quick path works; Maya needs a recovery path.":"Inspect the earlier current → proposed recordings for each persona."}</p>
     <div className="case-journey-lanes">{story.personas.map(persona=>{
      const phase=persona.proposal,isMaya=persona.id==='gather-coordinator',valid=isRecordedGatherStage(persona,'proposal');
      const reaction=list(phase.pair?.after?.experience).find(entry=>isMaya?entry.valence==='negative':entry.valence==='very_positive')?.reaction;
      const moments=isMaya?['Choose Atlas','See $280','Change room','Re-enter name','Confirm']:['Choose Atlas','Accept $280','Confirm'];
      return <article className={'case-journey-lane '+(isMaya?'is-maya':'is-alex')} key={persona.id}>
       <div className="case-lane-heading"><span className="case-persona-initial" aria-hidden="true">{isMaya?'M':'A'}</span><div><h4>{isMaya?'Maya':'Alex'}</h4><p>{valid?(isMaya?'Needs a recovery path':'Fits the budget. Keeps moving.'):'Comparable evidence unavailable'}</p></div>{valid&&<div className="case-action-count"><strong>{phase.before}<span> → </span>{phase.after}</strong><span>actions · current → proposed</span></div>}</div>
       {valid&&<ol className="case-moments" aria-label={(isMaya?'Maya':'Alex')+' key moments in the proposed flow'}>{moments.map((moment,index)=><li key={moment} className={isMaya&&index>0&&index<4?'is-friction':''}><span>{moment}</span></li>)}</ol>}
       <details className="case-source-detail"><summary>See {isMaya?'Maya':'Alex'}’s evidence<Icon name="down" size={13}/></summary>{valid&&<><p>{isMaya?'Maya returns to choose another room. Her meeting name disappears, so she enters it again before completing the booking.':'Alex accepts the $280 total and completes the reservation. The quick path fits the goal of moving on to the next task.'}</p>{typeof reaction==='string'&&reaction&&<blockquote>“{reaction}”<cite>Recorded AI persona reaction</cite></blockquote>}</>}<AppLink to={comparison+'?stage=proposal&persona='+encodeURIComponent(persona.id)} navigate={navigate}>Open paired journeys<Icon name="arrow" size={14}/></AppLink></details>
      </article>;
     })}</div><p className="case-caption">The paths show key moments, not every recorded action. Counts belong to the current → proposed comparison.</p>
     {proposalValid&&<p className="case-insight"><Icon name="experience" size={20}/><span><strong>Both booked. One took a detour.</strong> The completed goal hides Maya’s repeated work.</span></p>}
     </details>
    </div>
   </section>
   <section className={`case-stop case-stop-5 ${active===4?'is-current':''}`} id="gather-repair" data-chapter="4" ref={element=>{sections.current[4]=element;}} aria-labelledby="gather-repair-title">
    <TrailMarkers number={5}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">05 / FROM EVIDENCE TO A CANDIDATE · MUSE CODE</span><h3 id="gather-repair-title" tabIndex={-1}>Two findings.<br/>One reviewable candidate.</h3><p>Journey Lab turns these findings into a focused change. Review the implementation and its checks before deciding what ships.</p></div>
     <ol className="case-candidate-scope"><li><span>01</span><div><strong>Make the full price visible early.</strong><p>Keep room selection first, with all charges included.</p></div></li><li><span>02</span><div><strong>Keep details when the room changes.</strong><p>Changing a choice shouldn’t mean starting over.</p></div></li></ol>
     <div className="case-review-actions"><AppLink className="button primary" to={fixPath} navigate={navigate}>Review the candidate<Icon name="arrow" size={15}/></AppLink><div className="case-review-status"><Icon name="shield" size={14}/><span>Candidate status</span><Badge value={fix?.status||resource.data?.report?.repair?.fixStatus||'unknown'}/></div></div>
    </div>
   </section>
   <section className={`case-stop case-stop-6 ${active===5?'is-current':''}`} id="gather-retest" data-chapter="5" ref={element=>{sections.current[5]=element;}} aria-labelledby="gather-retest-title">
    <TrailMarkers number={6}/>
    <div className="case-stop-content">
     <div className="case-heading"><span className="case-chapter-number">06 / RETEST WITH FRESH, INDEPENDENT SESSIONS</span><h3 id="gather-retest-title" tabIndex={-1}>{knownFrames?<>Same budget.<br/>A different choice.</>:<>Return to the moment<br/>that mattered.</>}</h3><p>{knownFrames?"Revisit Maya’s first booking review. With the full price visible earlier, a different room becomes the clear choice.":"Inspect the fresh proposed and candidate sessions to see whether the improvement meets Maya’s needs."}</p></div>
     {knownFrames?<div className="case-frame-explorer">
      <div className="case-frame-toggle" aria-label="Choose a recorded version"><button type="button" aria-pressed={selectedFrame==='before'} onClick={()=>setSelectedFrame('before')}><span>Proposed flow</span><strong>Atlas · $280</strong><small>$30 over budget</small></button><button type="button" aria-pressed={selectedFrame==='after'} onClick={()=>setSelectedFrame('after')}><span>Muse Code candidate</span><strong>Willow · $245</strong><small>$5 within budget</small></button></div>
      <div className="case-retest-focus" aria-live="polite"><EvidenceFocus image={selectedFrame==='before'?before:after} crop={[788,590,347,162]} highlight={[790,686,340,63]} tone={selectedFrame==='before'?'problem':'resolved'} label="First review · focus on the final total" alt={selectedFrame==='before'?'Recorded Atlas review: $280 total, above Maya’s $250 budget.':'Recorded Willow review: $245 total, within Maya’s $250 budget.'} caption={selectedFrame==='before'?'Over budget → go back and choose again.':'Within budget → continue to confirmation.'} source="Fresh, independent proposed and candidate sessions. Both shown at their first booking review." to={base+'/runs/'+(selectedFrame==='before'?originalReview:repairedReview)+'?tab=journey&mode=original&at='+(selectedFrame==='before'?22597:20156)} navigate={navigate}/><span className="case-same-budget">Same budget in both versions <strong>$250 CAD</strong></span></div>

      <p className="case-caption">Different room choices, not a price reduction. Frames come from the fresh proposed → candidate sessions.</p>
     </div>:<p className="case-insight">The original recorded frames are unavailable. Inspect the source journeys before assessing the candidate.</p>}
     <div className="case-retest-results"><div><span className="case-result-label">MAYA / LESS REPEATED WORK</span><h4>{repairValid?<>{maya?.repair.before}<span> → </span>{maya?.repair.after}<small>recorded actions</small></>:'Retest evidence unavailable'}</h4><p>{repairValid?'Chooses Willow without repeating the meeting name.':'Comparable completed recordings are needed.'}</p></div><div><span className="case-result-label">ALEX / THE QUICK PATH REMAINS</span><h4>{repairValid?'Goal reached in both':'Inspect the fresh journeys'}</h4><p>{repairValid?'Completes the booking in both versions.':'Review the source recordings alongside the candidate.'}</p></div></div>
     <details className="case-source-detail case-retest-method"><summary>How to read this retest<Icon name="down" size={13}/></summary><p>These are fresh, independent proposed → candidate sessions, not a continuation of the earlier current → proposed comparison. Action counts describe these recordings, not a speed or conversion improvement.</p>{repairValid&&<p>Alex’s {alex?.repair.before} → {alex?.repair.after} action difference reflects where the sessions stopped: My reservations versus confirmation.</p>}<AppLink to={comparison+'?stage=repair&persona=gather-coordinator'} navigate={navigate}>Inspect the paired retest<Icon name="arrow" size={14}/></AppLink></details>
    </div>
   </section>
   <footer className="case-ending"><span className="story-kicker">THE JOURNEY LAB LOOP</span><h4>Context → evidence →<br/>a better-informed decision.</h4><p>AI journeys help reveal a trade-off and prepare a candidate.<br/>Human review still decides what ships.</p><div className="case-ending-actions"><AppLink className="button primary" to={comparison+'?stage=repair&persona=gather-coordinator'} navigate={navigate}>Explore the evidence<Icon name="arrow" size={14}/></AppLink><Button onClick={onWorkspace}>App overview</Button><Button kind="ghost" icon="play" onClick={onFilm}>Watch the film</Button></div><p className="case-caption">An AI Persona demonstration, not real-user validation. The candidate remains subject to review.</p></footer>
  </div>}
 </section>;
}
