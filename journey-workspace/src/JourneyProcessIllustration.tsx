import type {ReactNode} from 'react';
import './journey-process-illustration.css';

export type JourneyProcessKind='persona'|'mission'|'journey'|'improvement';

function Window({x,y,width,height,children}:{x:number;y:number;width:number;height:number;children?:ReactNode}){
 return <g>
  <rect className="jpi-shadow" x={x} y={y+5} width={width} height={height} rx="12"/>
  <rect className="jpi-window" x={x} y={y} width={width} height={height} rx="12"/>
  <path className="jpi-divider" d={`M${x} ${y+25}h${width}`}/>
  {[12,21,30].map(offset=><circle className="jpi-window-dot" key={offset} cx={x+offset} cy={y+13} r="2.5"/>)}
  {children}
 </g>;
}
function Check({x,y}:{x:number;y:number}){
 return <g transform={`translate(${x} ${y})`}><circle className="jpi-success-fill" r="11"/><path className="jpi-success-stroke" d="m-5 0 3.5 3.5L5-4"/></g>;
}
function Persona(){
 return <>
  <path className="jpi-connector" d="M151 120h22m0-78v156m0-156h17m-17 52h17m-17 52h17m-17 52h17"/>
  <g transform="translate(-9 17) scale(.85)">
  <rect className="jpi-shadow" x="38" y="34" width="150" height="178" rx="15"/>
  <rect className="jpi-window" x="38" y="29" width="150" height="178" rx="15"/>
  <rect className="jpi-tint" x="51" y="42" width="124" height="102" rx="10"/>
  <circle className="jpi-avatar-halo" cx="113" cy="91" r="37"/>
  <path className="jpi-avatar-shirt" d="M77 140c1-22 15-32 36-32s35 10 36 32"/>
  <path className="jpi-avatar-skin" d="M105 105h16v14c-5 5-11 5-16 0Z"/>
  <ellipse className="jpi-avatar-skin" cx="113" cy="88" rx="21" ry="25"/>
  <path className="jpi-avatar-hair" d="M91 91c-8-26 5-37 24-35 21 1 26 21 18 39l-4-17c-13 3-20-2-25-7-1 9-5 15-13 20Z"/>
  <path className="jpi-face" d="M106 89h.2m13-.2h.2m-11 9q5 4 10 0"/>
  <text className="jpi-title" x="113" y="165" textAnchor="middle">A point of view</text>
  <rect className="jpi-muted-fill" x="76" y="177" width="74" height="4" rx="2"/>
  </g>
  {[{y:20,title:'Motivation',detail:'What matters to me',icon:'motivation'},{y:72,title:'Context',detail:'My situation and experience',icon:'context'},{y:124,title:'Expectations',detail:'How I expect things to work',icon:'expectations'},{y:176,title:'Constraints',detail:'Time, access, and resources',icon:'constraints'}].map(item=><g key={item.title}>
   <rect className="jpi-window" x="190" y={item.y} width="214" height="44" rx="10"/>
   <circle className="jpi-tint" cx="207" cy={item.y+22} r="11"/>
   {item.icon==='motivation'?<path className="jpi-accent-stroke" d={`M207 ${item.y+28}l-6-6c-4-5 3-9 6-4 3-5 10-1 6 4Z`}/>:item.icon==='context'?<path className="jpi-accent-stroke" d={`M202 ${item.y+17}h10v8h-5l-4 3v-3h-1Z`}/>:item.icon==='expectations'?<path className="jpi-accent-stroke" d={`m201 ${item.y+22} 4 4 8-8`}/>:<path className="jpi-accent-stroke" d={`M202 ${item.y+16}v12m10-12v12m-8-6h6`}/>}
   <text className="jpi-label" x="227" y={item.y+18}>{item.title}</text>
   <text className="jpi-small" x="227" y={item.y+33}>{item.detail}</text>
  </g>)}
 </>;
}
function Mission(){
 return <>
  <rect className="jpi-shadow" x="65" y="35" width="290" height="191" rx="14"/>
  <rect className="jpi-window" x="65" y="30" width="290" height="191" rx="14"/>
  <rect className="jpi-accent-fill" x="155" y="23" width="110" height="25" rx="8"/>
  <text className="jpi-step-number" x="210" y="40" textAnchor="middle">The mission</text>
  {[{y:70,title:'Objective',detail:'What to achieve'},{y:122,title:'Scope',detail:'Where to explore'},{y:174,title:'Success',detail:'What good looks like'}].map((item,index)=><g key={item.title}>
   <rect className="jpi-tint" x="84" y={item.y-11} width="252" height="44" rx="8"/>
   <circle className="jpi-step-dot" cx="106" cy={item.y+10} r="13"/>
   {index===0?<g className="jpi-code"><circle cx="106" cy={item.y+10} r="7"/><circle cx="106" cy={item.y+10} r="2"/></g>:index===1?<path className="jpi-code" d={`M100 ${item.y+4}h12v12h-12Z`}/>:<path className="jpi-code" d={`m100 ${item.y+10} 4 4 8-8`}/>}
   <text className="jpi-label" x="132" y={item.y+5}>{item.title}</text>
   <text className="jpi-small" x="132" y={item.y+21}>{item.detail}</text>
  </g>)}
 </>;
}

function PersonaAvatar({x,y,scale=1}:{x:number;y:number;scale?:number}){
 return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-59 -94)`}>
  <circle className="jpi-avatar-halo" cx="59" cy="94" r="36"/>
  <path className="jpi-avatar-shirt" d="M28 122c2-20 13-28 31-28s29 8 31 28"/>
  <ellipse className="jpi-avatar-skin" cx="59" cy="83" rx="18" ry="22"/>
  <path className="jpi-avatar-hair" d="M41 86c-7-23 4-33 20-31 19 1 23 18 16 34l-4-15c-11 3-17-2-21-6-1 8-4 13-11 18Z"/>
  <path className="jpi-face" d="M53 84h.2m11-.2h.2m-10 8q5 4 10 0"/>
 </g>;
}

function Journey(){
 return <>
  <PersonaAvatar x={59} y={94}/>
  <text className="jpi-title" x="59" y="148" textAnchor="middle">AI Persona</text>
  <text className="jpi-small" x="59" y="164" textAnchor="middle">Uses the UI</text>
  <path className="jpi-connector" d="M99 103h33m-7-6 7 6-7 6"/>
  <Window x={143} y={24} width={257} height={166}>
   <rect className="jpi-rec-tint" x="303" y="30" width="85" height="15" rx="7.5"/>
   <circle className="jpi-rec-dot" cx="314" cy="37.5" r="2.5"/>
   <text className="jpi-rec-text" x="323" y="41">LIVE APP</text>
   <text className="jpi-label" x="158" y="70">1. Types into a field</text>
   <rect className="jpi-selected" x="158" y="79" width="226" height="31" rx="6"/>
   <text className="jpi-label" x="169" y="99">Find a meeting room</text>
   <path className="jpi-typing-caret" d="M286 86v17m-3-17h6m-6 17h6"/>
   <text className="jpi-label" x="158" y="133">2. Clicks a button</text>
   <rect className="jpi-accent-fill" x="158" y="142" width="154" height="31" rx="6"/>
   <text className="jpi-step-number" x="227" y="162" textAnchor="middle">Search rooms</text>
   <circle className="jpi-click-ring" cx="296" cy="157" r="15"/>
   <path className="jpi-accent-stroke" d="M296 135v-5m22 27h5m-11-16 4-4"/>
   <path className="jpi-cursor" d="m296 153 5 29 7-9 10-3Z"/>
  </Window>
  <rect className="jpi-tint" x="58" y="204" width="342" height="27" rx="13.5"/>
  <circle className="jpi-rec-dot" cx="77" cy="217.5" r="3.5"/>
  <text className="jpi-label" x="91" y="221">Actions + reactions recorded</text>
 </>;
}
function Improvement(){
 return <>
  <text className="jpi-label" x="88" y="22" textAnchor="middle">Before</text>
  <text className="jpi-label" x="332" y="22" textAnchor="middle">After</text>
  <Window x={20} y={30} width={136} height={112}>
   <rect className="jpi-muted-fill" x="34" y="68" width="67" height="5" rx="2.5"/>
   <rect className="jpi-tint" x="34" y="82" width="108" height="24" rx="5"/>
   <rect className="jpi-muted-fill" x="43" y="91" width="53" height="5" rx="2.5"/>
   <rect className="jpi-muted-fill" x="34" y="118" width="65" height="5" rx="2.5"/>
   <circle className="jpi-reaction-tint" cx="128" cy="121" r="11"/>
   <path className="jpi-reaction-stroke" d="M128 115v7m0 4v.1"/>
  </Window>
  <Window x={264} y={30} width={136} height={112}>
   <rect className="jpi-muted-fill" x="278" y="68" width="67" height="5" rx="2.5"/>
   <rect className="jpi-success-tint" x="278" y="82" width="108" height="24" rx="5"/>
   <rect className="jpi-success-fill" x="287" y="91" width="76" height="5" rx="2.5"/>
   <rect className="jpi-muted-fill" x="278" y="118" width="65" height="5" rx="2.5"/>
   <Check x={372} y={121}/>
  </Window>
  <text className="jpi-label" x="210" y="54" textAnchor="middle">Muse Code</text>
  <path className="jpi-connector" d="M162 87h21m54 0h21m-6-5 6 5-6 5"/>
  <rect className="jpi-accent-fill" x="188" y="65" width="44" height="44" rx="12"/>
  <path className="jpi-code" d="m202 80-6 7 6 7m16-14 6 7-6 7m-10 4 5-22"/>
  <text className="jpi-small" x="210" y="127" textAnchor="middle">Improves app</text>
  <path className="jpi-retest" d="M210 173v-17H88v-8m-5 5 5-5 5 5m117 3h122v-8m-5 5 5-5 5 5"/>
  <rect className="jpi-window" x="22" y="173" width="376" height="60" rx="12"/>
  <PersonaAvatar x={58} y={201} scale={.6}/>
  <text className="jpi-label" x="91" y="197">Same AI Persona · same mission</text>
  <text className="jpi-small" x="91" y="216">Runs again · compare before & after</text>
 </>;
}

const scenes={persona:Persona,mission:Mission,journey:Journey,improvement:Improvement};

/** Concept diagrams, not screenshots or recorded journey results. */
export function JourneyProcessIllustration({kind}:{kind:JourneyProcessKind}){
 const Scene=scenes[kind];
 return <div className={'journey-process-illustration jpi-'+kind} aria-hidden="true">
  <svg viewBox="0 0 420 240" fill="none" focusable="false">
   <ellipse className="jpi-backdrop" cx="210" cy="124" rx="185" ry="100"/>
   <Scene/>
  </svg>
 </div>;
}
