type Position={x:number;y:number};
const finitePosition=(point:Position)=>Number.isFinite(point.x)&&Number.isFinite(point.y);

/** Resolve nearby dots by distance instead of SVG paint order. Exact or near
 * ties are returned together so the UI can ask which recording was intended. */
export function resolveImpactArcHit<T extends Position>(points:T[],position:Position,radius=18,tieTolerance=2):T[]{
 if(!finitePosition(position)||!Number.isFinite(radius)||radius<0||!Number.isFinite(tieTolerance)||tieTolerance<0)return [];
 const candidates=points.flatMap(point=>{
  if(!finitePosition(point))return [];
  const distance=Math.hypot(point.x-position.x,point.y-position.y);
  return distance<=radius?[{point,distance}]:[];
 });
 if(!candidates.length)return [];
 const nearest=Math.min(...candidates.map(candidate=>candidate.distance));
 return candidates.filter(candidate=>candidate.distance<=nearest+tieTolerance).map(candidate=>candidate.point);
}
