import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AppLink,Modal} from './App';
import {Icon} from './icons';
import './dashboard-feature-panel.css';

type Props={base:string;projectId:string;navigate:(path:string)=>void;hasGather:boolean};
const features=[
 {
  id:'journeys',name:'Journeys',icon:'runs',
  image:new URL('./assets/dashboard-features/journeys.jpg',import.meta.url).href,
  alt:'Journey Lab journey history showing recorded Gather sessions for Alex and Maya',
  headline:'Every perspective has a story to explore.',
  description:'Find the journeys behind your feedback, then open their recordings, observations, and persona context.',
  path:'/runs',collection:'/runs'
 },
 {
  id:'personas',name:'Personas',icon:'personas',
  image:new URL('./assets/dashboard-features/personas.jpg',import.meta.url).href,
  alt:'Journey Lab persona profile showing Maya’s identity, point of view, personal goal, and live preview',
  headline:'Understand the perspective behind the feedback.',
  description:'Bring goals, expectations, knowledge, and constraints into the scenarios your personas explore.',
  path:'/personas/gather-coordinator',collection:'/personas'
 },
 {
  id:'emotions',name:'Emotional Arc',icon:'experience',
  image:new URL('./assets/dashboard-features/emotions.jpg',import.meta.url).href,
  alt:'Maya’s emotional arc in Gather’s review-booking experience, with the selected negative reaction at 0:22',
  headline:'Follow the moments that shape the experience.',
  description:'Explore a persona’s evolving reactions and return to the recorded moment behind each one.',
  path:'/experience?feedback=feedback%3A%5B%22ea312038-a7e1-4169-a661-32ffb884503b%22%2C%22signal%22%2C4%5D',collection:'/experience'
 },
 {
  id:'impact',name:'Change Impact',icon:'branch',
  image:new URL('./assets/dashboard-features/impact.jpg',import.meta.url).href,
  alt:'Journey Lab Change Impact screen with paired Gather recordings and persona comparisons',
  headline:'See how a change reshapes the journey.',
  description:'Compare experiences side by side, keeping each persona’s goals, reactions, and context in view.',
  path:'/impact/3c976cd2-5a9a-4c58-aef7-a40e4948f5e3?stage=repair&persona=gather-coordinator',collection:'/impact'
 }
];

export function DashboardFeaturePanel({base,projectId,navigate,hasGather}:Props){
 const [{selected,previous},setSlides]=useState({selected:0,previous:-1}),[expanded,setExpanded]=useState(false);
 const [cycle,setCycle]=useState(0),[announcement,setAnnouncement]=useState('');
 const [hoverPaused,setHoverPaused]=useState(false),[focusPaused,setFocusPaused]=useState(false);
 const [visible,setVisible]=useState(false),[pageHidden,setPageHidden]=useState(()=>document.hidden);
 const panel=useRef<HTMLElement>(null);
 const [paused,setPaused]=useState(false),[reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const scene=useRef<HTMLDivElement>(null),selector=useRef<HTMLDivElement>(null),screen=useRef<HTMLButtonElement>(null),labels=useRef<(HTMLButtonElement|null)[]>([]);
 const [connector,setConnector]=useState<{path:string;width:number;height:number;x:number;y:number}|null>(null);
 useEffect(()=>{const preference=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReducedMotion(preference.matches);update();preference.addEventListener('change',update);return()=>preference.removeEventListener('change',update);},[]);
 useEffect(()=>{
  const update=()=>setPageHidden(document.hidden);
  document.addEventListener('visibilitychange',update);
  return()=>document.removeEventListener('visibilitychange',update);
 },[]);
 useEffect(()=>{
  const element=panel.current;if(!element)return;
  if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting&&entry.intersectionRatio>=.25),{threshold:[0,.25]});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 const motionPaused=paused||reducedMotion||expanded||hoverPaused||focusPaused||pageHidden||!visible;
 useEffect(()=>{
  if(motionPaused)return;
  const timer=window.setTimeout(()=>setSlides(current=>({selected:(current.selected+1)%features.length,previous:current.selected})),6500);
  return()=>window.clearTimeout(timer);
 },[selected,cycle,motionPaused]);
 function selectFeature(index:number){
  setSlides(current=>({selected:index,previous:current.selected===index?current.previous:current.selected}));
  setCycle(value=>value+1);
  setAnnouncement('Showing '+features[index].name+' preview');
 }
 function togglePlayback(){
  if(paused){
   // Explicit play overrides the current interaction; the next hover or focus pauses again.
   setPaused(false);setHoverPaused(false);setFocusPaused(false);setCycle(value=>value+1);
  }else setPaused(true);
 }
 useLayoutEffect(()=>{
  const stage=scene.current,controls=selector.current,preview=screen.current,label=labels.current[selected];
  if(!stage||!controls||!preview||!label)return;
  const update=()=>{
   const bounds=stage.getBoundingClientRect(),controlBounds=controls.getBoundingClientRect(),image=preview.getBoundingClientRect(),button=label.getBoundingClientRect();
   const centerX=button.left-bounds.left+button.width/2;
   const position=Math.max(0,Math.min(1,(button.left+button.width/2-image.left)/image.width));
   const endX=image.left-bounds.left+image.width*(.15+.7*position),endY=image.top+10-bounds.top;
   if(button.bottom<controlBounds.bottom-10){
    // Route around later control rows rather than appearing to connect their buttons.
    const left=centerX<bounds.width/2,laneX=left?2:Math.max(2,bounds.width-2);
    const x=Math.max(2,Math.min(bounds.width-2,(left?button.left+2:button.right-2)-bounds.left));
    const y=button.top-bounds.top+button.height/2,turnY=Math.min(endY-12,controlBounds.bottom-bounds.top+10);
    const turn=Math.max(4,Math.min(12,(turnY-y)/3));
    setConnector({width:bounds.width,height:bounds.height,x,y,path:`M ${x} ${y} C ${laneX} ${y}, ${laneX} ${y+turn}, ${laneX} ${y+turn*2} L ${laneX} ${turnY} C ${laneX} ${endY-6}, ${endX} ${endY-22}, ${endX} ${endY}`});
    return;
   }
   const x=centerX,y=button.bottom-3-bounds.top;
   const bend=Math.max(12,(endY-y)*.55);
   setConnector({width:bounds.width,height:bounds.height,x,y,path:`M ${x} ${y} C ${x} ${y+bend}, ${endX} ${endY-bend}, ${endX} ${endY}`});
  };
  update();
  const observer=new ResizeObserver(update);observer.observe(stage);observer.observe(controls);observer.observe(preview);observer.observe(label);
  return()=>observer.disconnect();
 },[selected]);
 const feature=features[selected],gather=projectId==='gather';
 const destination=gather?base+feature.path:base+feature.collection;
 const linkText=gather?'Open '+feature.name:feature.id==='emotions'?'Explore experience':'Open '+feature.name;
 return <aside ref={panel} className="dashboard-feature-panel" aria-label="Product features" data-feature={feature.id} data-motion={motionPaused?'paused':'playing'} onPointerEnter={event=>{if(event.pointerType==='mouse')setHoverPaused(true);}} onPointerLeave={()=>setHoverPaused(false)} onFocusCapture={()=>setFocusPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocusPaused(false);}}>
  <div ref={scene} className="feature-visual-stage" data-motion={motionPaused?'paused':'playing'}>
   <span className="feature-aurora-field" aria-hidden="true"><span className="feature-aurora"><i/><i/><i/></span></span>
   <span className="feature-stage-orbit" aria-hidden="true"/>
   {connector&&<svg className="feature-active-connector" viewBox={`0 0 ${connector.width} ${connector.height}`} aria-hidden="true"><path className="feature-connector-halo" d={connector.path}/><path key={feature.id} className="feature-connector-line" d={connector.path} pathLength="1"/><circle cx={connector.x} cy={connector.y} r="3.5"/></svg>}
   <div ref={selector} className="feature-floating-selector" role="group" aria-label="Choose a feature preview">{features.map((item,index)=><button type="button" ref={element=>{labels.current[index]=element;}} className={'feature-orbit-label feature-orbit-'+item.id} key={item.id} aria-pressed={selected===index} aria-controls="dashboard-feature-content" onClick={()=>selectFeature(index)}><Icon name={item.icon} size={17}/><span>{item.name}</span><span className="feature-active-dot" aria-hidden="true"/></button>)}<button type="button" className="feature-motion-control" disabled={reducedMotion} onClick={togglePlayback} title={reducedMotion?'Motion reduced':paused?'Play preview rotation':'Pause preview rotation'} aria-label={reducedMotion?'Motion reduced by your accessibility preference':paused?'Play preview rotation':'Pause preview rotation'}><Icon name={reducedMotion?'check':paused?'play':'pause'} size={13}/></button></div>
   <div id="dashboard-feature-content" className="feature-panel-caption"><h4>{feature.headline}</h4><p>{feature.description}</p><div className="feature-panel-actions"><AppLink to={destination} navigate={navigate}>{linkText}<Icon name="arrow" size={14}/></AppLink>{!gather&&hasGather&&<AppLink className="feature-panel-example-link" to={'/projects/gather'+feature.path} navigate={navigate}>View Gather example<Icon name="external" size={12}/></AppLink>}</div></div>
   <button ref={screen} type="button" className="feature-panel-screen" onClick={()=>setExpanded(true)} aria-label={'View screen: '+feature.name}>
    <span className="feature-window-bar" aria-hidden="true"><span className="feature-window-dots"><i/><i/><i/></span><span>Journey Lab / {feature.name}</span><Icon name={feature.icon} size={12}/></span>
    <span className="feature-preview-slides">{features.map((item,index)=><img key={item.id} className="feature-preview-image" data-feature={item.id} data-state={index===selected?'active':index===previous?'exiting':'idle'} src={item.image} alt={index===selected?item.alt:''} aria-hidden={index===selected?undefined:true} loading="eager" decoding="async"/>)}</span><span className="feature-panel-zoom"><Icon name="expand" size={13}/>View screen</span>
   </button>
  </div>
  <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  {expanded&&<Modal wide title={feature.name+' · Gather example'} onClose={()=>setExpanded(false)}><div className="feature-screen-dialog"><img data-feature={feature.id} src={feature.image} alt={feature.alt}/><div><p>{feature.description}</p><AppLink className="button" to={gather||hasGather?'/projects/gather'+feature.path:destination} navigate={navigate}>{gather||hasGather?'Open this screen':linkText}<Icon name="arrow" size={14}/></AppLink></div></div></Modal>}
 </aside>;
}
