import {useEffect,useId,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {MouseEvent,PointerEvent} from 'react';
import {Icon} from './icons';
import type {Row} from './lib';
import {clock} from './lib';
import {findImpactPlaybackPoint} from './impact-playback-highlight';
import {resolveImpactArcHit} from './impact-arc-hit-target';
import {ImpactReactionList} from './ImpactReactionList';
import {buildImpactLandscapeComparison,landscapeComparisonLayers} from './impact-emotional-landscape';
import type {LandscapeSide,LandscapePoint,ImpactLandscape} from './impact-emotional-landscape';
import './impact-emotional-landscape.css';

export type ImpactMomentSelection={personaId:string;side:LandscapeSide;point:LandscapePoint};
type PlaybackSide={ms:number;durationMs:number|null;available:boolean};
export type ImpactPlaybackPosition={scope:string;personaId:string;before:PlaybackSide;after:PlaybackSide;inspection?:{side:LandscapeSide;pointId:string}};
type Props={pairs:Row[];selectedId?:string;onSelect:(personaId:string)=>void;onMomentSelect?:(selection:ImpactMomentSelection)=>void;playbackPosition?:ImpactPlaybackPosition;labels:{before:string;after:string};isExample?:boolean;compact?:boolean};
const sides:LandscapeSide[]=['before','after'];
const levels=[{value:2,label:'Very positive',tone:'excellent'},{value:1,label:'Positive',tone:'positive'},{value:0,label:'Neutral',tone:'neutral'},{value:-1,label:'Negative',tone:'negative'},{value:-2,label:'Very negative',tone:'very-negative'}];
const pointText=(point:LandscapePoint)=>String(point.entry.reaction||point.entry.personaComment||point.entry.observation||'No observation text provided.');
const versionName=(side:LandscapeSide)=>side==='before'?'Before':'After';

export function ImpactEmotionalLandscape({pairs,selectedId,onSelect,onMomentSelect,playbackPosition,labels,isExample=false,compact=false}:Props){
 const [mode,setMode]=useState<'layers'|'overlay'>('overlay');
 const [focus,setFocus]=useState<Record<string,number>>({});
 const chartContainer=useRef<HTMLDivElement>(null);
 const [availableWidth,setAvailableWidth]=useState(860);
 const [hoveredKeys,setHoveredKeys]=useState<string[]>([]),[choiceKeys,setChoiceKeys]=useState<string[]>([]);
 const choicePanel=useRef<HTMLDivElement>(null),chartSvg=useRef<SVGSVGElement>(null);
 const activation=useRef<{personaId?:string;handled:boolean}>({handled:false});
 const headingId=useId(),descriptionId=useId(),bandClipId=useId();
 const items=useMemo(()=>buildImpactLandscapeComparison(pairs),[pairs]);
 const layers=useMemo(()=>landscapeComparisonLayers(items,selectedId),[items,selectedId]);
 const selected=layers.at(-1)?.item;
 useEffect(()=>{setHoveredKeys([]);setChoiceKeys([]);},[selected?.id,mode]);
 useEffect(()=>{if(choiceKeys.length)choicePanel.current?.querySelector<HTMLButtonElement>('.iel-overlap-option')?.focus({preventScroll:true});},[choiceKeys]);
 useEffect(()=>{
  const container=chartContainer.current;
  if(!compact||!container)return;
  const measure=()=>setAvailableWidth(Math.max(330,Math.round(container.clientWidth)));
  measure();
  const observer=new ResizeObserver(measure);observer.observe(container);
  return()=>observer.disconnect();
 },[compact,!!selected]);
 const focusIndex=(item:ImpactLandscape,side:LandscapeSide)=>{
  const initial=item.points.findIndex(point=>point.value!==null&&point.value<0);
  return Math.min(Math.max(0,focus[`${item.id}:${side}`]??(initial>=0?initial:0)),Math.max(0,item.points.length-1));
 };
 // Initialize evidence once per persona activation, using its remembered focus.
 // Polling and callback identity changes must not restart video playback/seeking.
 useEffect(()=>{
  if(!selected){activation.current={handled:false};return;}
  if(activation.current.personaId!==selected.id)activation.current={personaId:selected.id,handled:false};
  if(activation.current.handled||!onMomentSelect)return;
  const side:LandscapeSide=selected.after.points.length?'after':'before';
  const version=selected[side],point=version.points[focusIndex(version,side)];
  if(!point)return;
  activation.current.handled=true;
  onMomentSelect({personaId:selected.id,side,point});
 },[selected,onMomentSelect,focus]);
 if(!selected)return null;
 const position=playbackPosition?.personaId===selected.id?playbackPosition:undefined;
 const followsPlayback=compact&&!isExample&&!!onMomentSelect;
 const displayedPoint=(version:ImpactLandscape,side:LandscapeSide)=>{
  if(!followsPlayback||version.id!==selected.id)return version.points[focusIndex(version,side)]||null;
  const current=position?.[side],inspection=position?.inspection?.side===side?position.inspection:undefined;
  if(inspection&&!current?.available)return version.points.find(point=>point.id===inspection.pointId)||null;
  return current?findImpactPlaybackPoint(version,current.ms,{...current,selectedPointId:inspection?.pointId}):null;
 };
 const emptyPointText=(side:LandscapeSide)=>selected[side].excluded?`Excluded: ${selected[side].excluded}.`:!position||position[side].available&&position[side].durationMs===null?'Loading recording…':position[side].available?'No reaction recorded at this time.':'No corresponding recording moment.';
 const choosePoint=(id:string,side:LandscapeSide,index:number)=>{
  const point=items.find(item=>item.id===id)?.[side].points[index];
  if(!point)return;
  // An explicit background point takes precedence over activation's default.
  activation.current={personaId:id,handled:true};
  if(id!==selected.id)onSelect(id);
  setFocus(current=>({...current,[`${id}:${side}`]:index}));
  onMomentSelect?.({personaId:id,side,point});
 };
 const allGaps=items.some(item=>sides.some(side=>item[side].unrated+item[side].untimed>0));
 const depthStep=layers.length>1?Math.min(compact?9:15,(compact?32:56)/(layers.length-1)):0;
 const maxDepth=mode==='layers'?(layers.length-1)*depthStep:0;
 // Compact charts use actual container pixels, so the plot fills the videos'
 // width without scaling text or leaving a centered, letterboxed SVG.
 const chartWidth=compact?availableWidth:860,rowHeight=compact?18:37;
 const bandLeft=compact?86:99,bandTop=compact?6+maxDepth:85.5;
 const bandHeight=rowHeight*5,centerY=bandTop+bandHeight/2;
 const pointLeft=bandLeft+(compact?10:12),pointRight=compact?chartWidth-26-maxDepth*1.2:761;
 const bandWidth=pointRight-pointLeft+(compact?20:24);
 const axisY=compact?bandTop+bandHeight+14:295;
 const chartTop=compact?0:bandTop-maxDepth-10,chartHeight=compact?axisY+6:303-chartTop;
 const x=(point:LandscapePoint)=>pointLeft+point.progress*(pointRight-pointLeft);
 const y=(point:LandscapePoint)=>centerY-(point.value??0)*rowHeight;
 const hitPoints=sides.flatMap(side=>selected[side].plotted.map(point=>({key:`${side}:${point.id}`,side,point,x:x(point),y:y(point)})));
 const plotHits=(event:MouseEvent<SVGSVGElement>|PointerEvent<SVGSVGElement>)=>{
  const matrix=event.currentTarget.getScreenCTM();
  if(!matrix)return [];
  const cursor=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  // Resolve in screen pixels so the target remains generous at every chart size.
  if(cursor.x<bandLeft-8||cursor.x>bandLeft+bandWidth+8||cursor.y<bandTop-14||cursor.y>bandTop+bandHeight+14)return [];
  return resolveImpactArcHit(hitPoints.map(hit=>{const pixel=new DOMPoint(hit.x,hit.y).matrixTransform(matrix);return {...hit,x:pixel.x,y:pixel.y};}),{x:event.clientX,y:event.clientY});
 };
 const clickPlot=(event:MouseEvent<SVGSVGElement>)=>{
  const dot=(event.target as Element).closest('.iel-dot'),layer=dot?.closest('.iel-layer'),series=dot?.closest('.iel-series');
  const fallback=()=>{if(dot&&layer&&series)choosePoint(layer.getAttribute('data-persona-id')!,series.getAttribute('data-side') as LandscapeSide,Number(dot.getAttribute('data-index')));};
  if(event.detail===0){fallback();return;}
  const hits=plotHits(event);
  if(hits.length===1){setChoiceKeys([]);choosePoint(selected.id,hits[0].side,hits[0].point.index);}
  else if(hits.length>1)setChoiceKeys(hits.map(hit=>hit.key));
  else{setChoiceKeys([]);fallback();}
 };
 const hoverHits=hitPoints.filter(hit=>hoveredKeys.includes(hit.key)),choices=hitPoints.filter(hit=>choiceKeys.includes(hit.key));
 const versionLegend=<div className="iel-version-legend" role="group" aria-label={`${selected.name}’s compared versions`}>{sides.map(side=><span key={side} className={`iel-version-${side}`}><i aria-hidden="true"/><small>{versionName(side)}</small><strong>{labels[side]}</strong></span>)}</div>;
 return <section className={`iel${compact?' iel-compact':''}`} aria-labelledby={headingId}>
  <header className="iel-heading"><div>{!compact&&<span className="iel-kicker">ALL PERSPECTIVES, ONE VIEW</span>}<h2 id={headingId}>{compact?'Did it feel better?':<>Emotional arcs<span>.</span></>}{compact&&<small>All perspectives</small>}</h2>{!compact&&<p><strong>{selected.name}’s before and after</strong> together. {mode==='layers'?'Other perspectives fade into the background.':'Everyone shares the same baseline.'}</p>}</div>
   {compact&&versionLegend}<div className="iel-controls"><div className="iel-mode" role="group" aria-label="Emotional arc presentation"><button type="button" aria-pressed={mode==='layers'} onClick={()=>setMode('layers')}><Icon name="copy" size={13}/>Layers</button><button type="button" aria-pressed={mode==='overlay'} onClick={()=>setMode('overlay')}><Icon name="activity" size={13}/>Overlay</button></div></div>
  </header>
  {!compact&&versionLegend}
  {compact&&<h3 className="iel-subheading">Emotional Arc</h3>}
  <div className={`iel-scene iel-scene-${mode}`}>
   <div className="iel-chart-scroll" ref={chartContainer}><svg ref={chartSvg} tabIndex={-1} className="iel-chart" viewBox={`0 ${chartTop} ${chartWidth} ${chartHeight}`} style={compact?{width:chartWidth,height:chartHeight}:undefined} role="group" aria-labelledby={headingId} aria-describedby={descriptionId} onClick={clickPlot} onPointerMove={event=>{const keys=plotHits(event).map(hit=>hit.key);setHoveredKeys(current=>current.join('|')===keys.join('|')?current:keys);}} onPointerLeave={()=>setHoveredKeys([])}>
    <title>{`${selected.name} before and after highlighted among ${items.length} persona emotional arcs. Before: ${labels.before}. After: ${labels.after}.`}</title>
    <desc id={descriptionId}>Both versions of the selected person share the foreground. Dashed slate is before; solid purple is after. Green bands indicate positive reactions, gray neutral, amber negative and pink very negative. Observations follow each journey’s own progress; positions do not match actions or elapsed time. {mode==='layers'?'Other people’s before and after traces are faded on background planes; choose Overlay for a common baseline.':'All traces share the same baseline.'} The before and after observation controls below inspect each journey independently.</desc>
    <defs><clipPath id={bandClipId}><rect x={bandLeft} y={bandTop} width={bandWidth} height={bandHeight} rx={compact?3:8}/></clipPath></defs>
    {mode==='layers'&&layers.filter(layer=>layer.depth>0).map(({item,depth})=><rect key={`plane-${item.id}`} className="iel-plane" x={bandLeft+depth*depthStep*1.2} y={bandTop-depth*depthStep} width={bandWidth} height={bandHeight} rx={compact?3:8}/>)}
    <g className="iel-bands" clipPath={`url(#${bandClipId})`} aria-hidden="true">{levels.map(level=><rect key={level.tone} className={`iel-band iel-band-${level.tone}`} x={bandLeft} y={centerY-level.value*rowHeight-rowHeight/2} width={bandWidth} height={rowHeight}/>)}</g>
    <rect className="iel-plot-hit" x={bandLeft-6} y={Math.max(chartTop,bandTop-12)} width={bandWidth+12} height={bandHeight+24} fill="transparent" aria-hidden="true"/>
    {layers.map(({item,depth})=>{
     const foreground=depth===0,offset=mode==='layers'?depth*depthStep:0;
     return <g key={item.id} className={`iel-layer${foreground?' is-selected':''}`} data-persona-id={item.id} transform={`translate(${offset*1.2},${-offset})`} style={{'--iel-color':item.color} as CSSProperties}>
      {(mode==='layers'||foreground)&&levels.map(level=><line key={level.value} className={`iel-grid${level.value===0?' iel-zero':''}`} x1={pointLeft} x2={pointRight} y1={centerY-level.value*rowHeight} y2={centerY-level.value*rowHeight}/>)}
      {foreground&&levels.map(level=><text className={`iel-level iel-tone-${level.tone}`} key={level.value} x={bandLeft-10} y={centerY+3.5-level.value*rowHeight} textAnchor="end">{level.label}</text>)}
      {sides.map(side=>{const version=item[side],point=displayedPoint(version,side);return <g className={`iel-series iel-${side}`} data-side={side} key={side}>
       {version.segments.map((segment,segmentIndex)=><g key={segmentIndex}>
        {segment.length>1&&<polyline className="iel-trace" points={segment.map(p=>`${x(p)},${y(p)}`).join(' ')} pointerEvents="none"/>}
        {segment.map(p=><g key={p.id} data-index={p.index} className={`iel-dot iel-tone-${p.tone.key}${foreground&&hoveredKeys.includes(`${side}:${p.id}`)?' is-hovered':''}`} role="button" tabIndex={0} aria-pressed={foreground&&point?.id===p.id} aria-label={`${item.name} · ${versionName(side)}: ${labels[side]} · Observation ${p.index+1} · ${p.tone.label} · ${pointText(p)}`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setChoiceKeys([]);choosePoint(item.id,side,p.index);}}}><circle className="iel-dot-hit" cx={x(p)} cy={y(p)} r={foreground?18:10}/><circle className="iel-dot-visible" cx={x(p)} cy={y(p)} r={foreground?(side==='before'?(compact?5:6):(compact?4.5:5)):(compact?1.8:2.3)}/><title>{`${item.name} · ${versionName(side)}: ${labels[side]} · ${p.tone.label} · ${pointText(p)}`}</title></g>)}
       </g>)}
       {foreground&&point&&point.value!==null&&point.ms!==null&&(!followsPlayback||position?.[side].available)&&<g className="iel-current-moment" aria-hidden="true"><line className="iel-current-guide" x1={x(point)} x2={x(point)} y1={bandTop} y2={bandTop+bandHeight}/><circle className="iel-focus-ring" cx={x(point)} cy={y(point)} r={compact?7:9}/></g>}
      </g>;})}
     </g>;
    })}
    <text className="iel-axis" x={pointLeft} y={axisY}>{compact?'Start':'First observation'}</text><text className="iel-axis iel-axis-center" x={(pointLeft+pointRight)/2} y={axisY} textAnchor="middle">{compact?'Observation progress · actions may differ':'Journey progress · not matched actions'}</text><text className="iel-axis" x={pointRight} y={axisY} textAnchor="end">{compact?'End':'Last observation'}</text>
   </svg></div>
   {!!hoverHits.length&&!choices.length&&<div className="iel-point-preview" aria-hidden="true">{hoverHits.length>1?'Overlapping moments · click to choose':`${versionName(hoverHits[0].side)} · ${hoverHits[0].point.tone.label}${isExample?` · Step ${hoverHits[0].point.index+1}`:` · ${clock(hoverHits[0].point.ms)}`}`}</div>}
   {!!choices.length&&<div className="iel-overlap-menu" ref={choicePanel} role="dialog" aria-label="Choose an overlapping moment" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setChoiceKeys([]);chartSvg.current?.focus({preventScroll:true});}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setChoiceKeys([]);}}>
    <header><strong>Choose a moment</strong><button type="button" aria-label="Close moment choices" onClick={()=>{setChoiceKeys([]);chartSvg.current?.focus({preventScroll:true});}}><Icon name="close" size={13}/></button></header>
    {choices.map(hit=><button type="button" className={`iel-overlap-option iel-${hit.side}`} key={hit.key} onClick={()=>{choosePoint(selected.id,hit.side,hit.point.index);setChoiceKeys([]);chartSvg.current?.focus({preventScroll:true});}}><span><strong>{versionName(hit.side)}</strong><span>{hit.point.tone.label}</span><time>{isExample?`Step ${hit.point.index+1}`:clock(hit.point.ms)}</time></span><small>{pointText(hit.point)}</small></button>)}
   </div>}
   {!selected.before.plotted.length&&!selected.after.plotted.length&&<div className="iel-chart-empty"><strong>{selected.name}</strong><span>No plottable reactions for either version. Select another perspective to explore its arcs.</span></div>}
  </div>
  {!compact&&<div className="iel-personas" role="group" aria-label="Highlight a persona emotional arc">{items.map(item=>{const unavailable=sides.every(side=>!item[side].plotted.length),excluded=sides.every(side=>!!item[side].excluded),partial=sides.some(side=>item[side].partial||item[side].missing||item[side].excluded),warning=item.after.warning||item.before.warning;return <button type="button" key={item.id} aria-pressed={item.id===selected.id} onClick={()=>onSelect(item.id)} style={{'--iel-color':item.color} as CSSProperties} title={`${item.name}${item.role?` · ${item.role}`:''} · Before: ${item.before.status} · After: ${item.after.status}`}><i/><strong>{item.name}</strong><span>{excluded?'Excluded':unavailable?'No arcs':warning||(partial?'Partial':`${item.before.plotted.length} → ${item.after.plotted.length} moments`)}</span>{item.id===selected.id&&<Icon name="check" size={12}/>}</button>;})}</div>}
  {compact?<ImpactReactionList before={selected.before} after={selected.after} labels={labels} currentIds={{before:displayedPoint(selected.before,'before')?.id,after:displayedPoint(selected.after,'after')?.id}} playbackTimes={{before:position?.before.available&&position.before.durationMs!=null?position.before.ms:undefined,after:position?.after.available&&position.after.durationMs!=null?position.after.ms:undefined}} isExample={isExample} onSelect={(side,index)=>{setChoiceKeys([]);choosePoint(selected.id,side,index);}}/>:<div className="iel-inspectors">{sides.map(side=>{
   const version=selected[side],point=displayedPoint(version,side),index=point?.index??-1,current=position?.[side];
   const videoTime=followsPlayback&&current?.available&&current.durationMs!=null?current.ms:null;
   const reaction=point?pointText(point):followsPlayback?emptyPointText(side):version.excluded?'This evidence is excluded from the emotional comparison.':'This version has no reactions to display for this persona.';
   return <div key={side} className={`iel-inspector iel-${side}${videoTime!==null?' is-current':''}`} role="group" aria-label={`${versionName(side)} observation`}>
    <div className="iel-inspector-copy" aria-live={followsPlayback?'off':'polite'}>
     <header className="iel-inspector-version"><small>{versionName(side)}</small><strong>{labels[side]}</strong>{videoTime!==null&&<time className="iel-playback-time" aria-label={`${versionName(side)} recording at ${clock(videoTime)}`}>At {clock(videoTime)}</time>}{onMomentSelect&&point&&<button className="iel-inspect-moment" type="button" aria-label={`Inspect ${side} moment`} onClick={()=>choosePoint(selected.id,side,index)}>Inspect moment<Icon name="arrow" size={12}/></button>}</header>
     <div><span className={`iel-observation-tone iel-tone-${point?.tone.key||'unrated'}`}>{point?point.tone.label:followsPlayback?'No current reaction':version.status}</span><span>{point?`Observation ${index+1} of ${version.points.length}`:''}</span>{point&&point.ms===null&&<span className="iel-gap-label">Untimed</span>}{version.partial&&<span className="iel-gap-label">Partial journey</span>}{version.warning&&<span className="iel-gap-label">{version.warning}</span>}</div>
     {compact&&point?<details className="iel-reaction-detail" key={point.id}><summary title={`${point.ms!==null?`Observed at ${clock(point.ms)} · `:''}${reaction}`}><span>{reaction}</span><Icon name="down" size={10}/></summary></details>:<p className={compact?'iel-reaction-empty':undefined}>{reaction}</p>}
    </div>
    <div className="iel-step-controls"><button type="button" aria-label={`Previous ${side} observation`} disabled={!point||index===0} onClick={()=>choosePoint(selected.id,side,index-1)}><Icon name="back" size={15}/></button><button type="button" aria-label={`Next ${side} observation`} disabled={!version.points.length||index>=version.points.length-1} onClick={()=>choosePoint(selected.id,side,index+1)}><Icon name="arrow" size={15}/></button></div>
   </div>;
  })}</div>}
  {onMomentSelect&&!compact&&<p className="iel-interaction-note">{isExample?`Select a moment to inspect its details ${compact?'above':'below'}.`:`Select a moment to seek the recordings ${compact?'above':'below'}.`}</p>}
  <footer className="iel-note"><span>{isExample?'Authored scenario reactions':'Synthetic persona reactions'} · Bands show reaction tone.</span><span>{compact?(isExample?'Select a moment to inspect its details.':'Select a moment to seek both recordings.'):`Each version follows its own journey. ${mode==='layers'?'Depth separates people.':'All traces share a baseline.'}`}{allGaps?' Unrated or untimed observations leave gaps.':''}</span></footer>
 </section>;
}
