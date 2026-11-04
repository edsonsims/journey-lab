import type {ImpactLandscape,LandscapePoint} from './impact-emotional-landscape.ts';

type PlaybackBounds={durationMs:number|null|undefined;available?:boolean;selectedPointId?:string};
const validMs=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;

/** Find the latest recorded observation at the actual source-video clock.
 * Observation progress is not time, so scan timestamps rather than source order.
 * A timed but unrated observation stays current instead of borrowing an older
 * rating. Explicit inspector selections (including untimed ones) are separate
 * from this playback highlight and must not be assigned a fabricated timestamp.
 */
export function findImpactPlaybackPoint(landscape:ImpactLandscape,clockMs:number|null|undefined,{durationMs,available=true,selectedPointId}:PlaybackBounds):LandscapePoint|null{
 if(!available||landscape.missing||landscape.excluded||!validMs(clockMs)||!validMs(durationMs)||clockMs>durationMs)return null;
 // Equal-time observations share a frame; preserve the user’s exact choice
 // until the clock moves. The half-millisecond tolerance only absorbs float
 // conversion noise and cannot move a point outside recording bounds.
 const selected=selectedPointId?landscape.points.find(point=>point.id===selectedPointId):undefined;
 if(selected&&validMs(selected.ms)&&selected.ms<=durationMs&&Math.abs(selected.ms-clockMs)<=.5)return selected;
 let current:LandscapePoint|null=null;
 for(const point of landscape.points){
  if(!validMs(point.ms)||point.ms>clockMs)continue;
  if(!current||point.ms>current.ms!||point.ms===current.ms&&point.index>current.index)current=point;
 }
 return current;
}
