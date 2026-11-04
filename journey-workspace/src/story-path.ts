export type StoryPoint = {x:number;y:number};

/**
 * Join a measured, top-to-bottom itinerary with broad, vertically tangent bends.
 * The control points stay inside each pair's bounds, so the trail cannot swing
 * into neighboring content or run upward. Invalid and non-increasing anchors
 * are ignored without changing the supplied story order.
 */
export function storyPath(points:readonly StoryPoint[]):string {
 let previous:StoryPoint|undefined;
 const commands:string[]=[];
 for(const point of points){
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
  if(!previous){
   commands.push(`M ${point.x} ${point.y}`);
  }else{
   if(point.y<=previous.y)continue;
   if(point.x===previous.x){
    commands.push(`L ${point.x} ${point.y}`);
   }else{
    // Half first to keep the midpoint finite even for very large coordinates.
    const middle=previous.y/2+point.y/2;
    commands.push(`C ${previous.x} ${middle}, ${point.x} ${middle}, ${point.x} ${point.y}`);
   }
  }
  previous=point;
 }
 return commands.join(' ');
}
