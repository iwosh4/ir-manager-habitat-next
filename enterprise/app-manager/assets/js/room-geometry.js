export const bounds = i => i.rotation % 180 === 0 ? {w:i.w,d:i.d} : {w:i.d,d:i.w};

export function overlaps(a,b) {
  if (a.id === b.id) return false;
  const az=a.elevation||0,bz=b.elevation||0;
  if (az >= bz+b.h || bz >= az+a.h) return false;
  const ab=bounds(a),bb=bounds(b);
  return a.x+1< b.x+bb.w && a.x+ab.w-1>b.x && a.y+1<b.y+bb.d && a.y+ab.d-1>b.y;
}

export function attachWall(i,room) {
  if (!i.wall) return;
  i.rotation={north:0,east:90,south:180,west:270}[i.wall] ?? i.rotation;
  const b=bounds(i);
  if (i.wall==='north') i.y=0;
  if (i.wall==='south') i.y=room.d-b.d;
  if (i.wall==='west') i.x=0;
  if (i.wall==='east') i.x=room.w-b.w;
  i.x=Math.max(0,Math.min(room.w-b.w,i.x));
  i.y=Math.max(0,Math.min(room.d-b.d,i.y));
}

/** Partition wall into non-overlapping rectangles outside window/door openings. */
export function wallPanels(length,height,openings) {
  const cuts=[0,length];
  for(const o of openings) cuts.push(Math.max(0,Math.min(length,o.x)),Math.max(0,Math.min(length,o.x+o.w)));
  const xs=[...new Set(cuts)].sort((a,b)=>a-b),result=[];
  for(let n=0;n<xs.length-1;n++) {
    const x=xs[n],w=xs[n+1]-x;if(w<=0)continue;
    const intervals=openings.filter(o=>o.x< x+w && o.x+o.w>x).map(o=>[Math.max(0,o.z),Math.min(height,o.z+o.h)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
    let z=0;
    for(const [a,b] of intervals) {if(a>z)result.push({x,z,w,h:a-z});z=Math.max(z,b);}
    if(z<height)result.push({x,z,w,h:height-z});
  }
  return result;
}
