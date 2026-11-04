import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Row} from './lib';
import {Icon} from './icons';
import {deviceDetails,recordedDevice,recordedNetwork} from './device-context';
import './device-settings.css';

export function DeviceBadge({run,device,network,compact=false}:{run?:Row;device?:Row;network?:Row;compact?:boolean}){
 const resolved=device||(run?recordedDevice(run):{name:'Device not selected'}),connection=network||(run?recordedNetwork(run):undefined);
 const details=deviceDetails(resolved,connection,run),id=useId(),button=useRef<HTMLButtonElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),[open,setOpen]=useState(false),[pinned,setPinned]=useState(false),[position,setPosition]=useState({left:0,top:0,maxHeight:420});
 const cancelClose=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 const show=()=>{cancelClose();const rect=button.current?.getBoundingClientRect();if(rect){const top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-430));setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-338)),top,maxHeight:window.innerHeight-top-12});}setOpen(true);};
 const close=()=>{cancelClose();setOpen(false);setPinned(false);};
 const leave=()=>{if(!pinned){cancelClose();timer.current=setTimeout(()=>setOpen(false),160);}};
 useEffect(()=>()=>cancelClose(),[]);
 return <span className={`device-badge-wrap ${compact?'compact':''}`} onMouseEnter={show} onMouseLeave={leave}>
  <button ref={button} type="button" className="device-badge" aria-label={`Device details: ${resolved.name}`} aria-describedby={open?id:undefined} aria-expanded={open} onFocus={show} onBlur={close} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}}} onClick={event=>{event.preventDefault();event.stopPropagation();if(pinned)close();else{show();setPinned(true);}}}><Icon name="devices" size={13}/><span>{resolved.name}</span>{resolved.version&&<small>v{resolved.version}</small>}</button>
  {open&&createPortal(<div id={id} role="tooltip" className="device-tooltip" onMouseEnter={cancelClose} onMouseLeave={leave} style={position}><strong>{resolved.name}</strong><dl>{details.filter(item=>item.label!=='Device').map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><p>{run?'Configuration retained with this journey. Input used reflects recorded actions.':'Device capabilities applied to new journeys. The persona or task may restrict input.'}</p></div>,document.body)}
 </span>;
}
