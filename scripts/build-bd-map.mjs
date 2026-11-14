// Builds public/assets/bd-map.json -- the map the delivery form draws.
//
//   node scripts/build-bd-map.mjs <dir with ADM2.geojson and ADM3.geojson>
//
// Source: geoBoundaries gbOpen BGD ADM2/ADM3 (simplified), which republishes
// the Bangladesh Bureau of Statistics / OCHA boundaries under CC BY 3.0 IGO.
// https://github.com/wmgeolab/geoBoundaries/tree/main/releaseData/gbOpen/BGD
//
// Only the upazila layer is drawn from the source. Districts and divisions are
// dissolved out of it, so a district's outline is exactly the outer edge of
// its upazilas and nothing gapes when the map zooms from one level to the next.
// District and division names follow server/bangladesh.mjs, which is the list
// orders are validated against.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {DIVISIONS} from '../server/bangladesh.mjs';

const dir=process.argv[2];
if(!dir){console.error('usage: node scripts/build-bd-map.mjs <dir with ADM2.geojson and ADM3.geojson>');process.exit(1)}
const load=name=>JSON.parse(readFileSync(path.join(dir,name),'utf8')).features;
const DISTRICT_ALIAS={Barisal:'Barishal',Bogra:'Bogura',Brahamanbaria:'Brahmanbaria',Chittagong:'Chattogram',Comilla:'Cumilla',Jessore:'Jashore',Maulvibazar:'Moulvibazar',Nawabganj:'Chapai Nawabganj',Netrakona:'Netrokona'};
const divisionOf=Object.fromEntries(Object.entries(DIVISIONS).flatMap(([division,list])=>list.map(d=>[d,division])));
const polygons=g=>g.type==='MultiPolygon'?g.coordinates:[g.coordinates];
const inRing=(x,y,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside}return inside};
const ringArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2};
const containsLonLat=(g,x,y)=>polygons(g).some(p=>inRing(x,y,p[0])&&!p.slice(1).some(hole=>inRing(x,y,hole)));

// A point that is certainly inside a set of rings (even-odd): the centroid of
// the largest ring if it lands inside, otherwise the middle of the widest run
// of the shape along the centroid's row.
function innerPoint(rings){
 const inside=(x,y)=>rings.reduce((n,r)=>n+(inRing(x,y,r)?1:0),0)%2===1;
 const ring=rings.reduce((a,b)=>Math.abs(ringArea(b))>Math.abs(ringArea(a))?b:a);
 let a=0,cx=0,cy=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const f=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=f;cx+=(ring[j][0]+ring[i][0])*f;cy+=(ring[j][1]+ring[i][1])*f}
 cx/=3*a;cy/=3*a;
 if(inside(cx,cy))return [cx,cy];
 cy=Math.floor(cy)+.5;
 const xs=[];for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>cy)!==(yj>cy))xs.push((xj-xi)*(cy-yi)/(yj-yi)+xi)}
 xs.sort((p,q)=>p-q);let best=[cx,0];for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>best[1])best=[(xs[i]+xs[i+1])/2,xs[i+1]-xs[i]];
 return [best[0],cy];
}

const districts=load('ADM2.geojson').map(f=>({name:DISTRICT_ALIAS[f.properties.shapeName]||f.properties.shapeName,geometry:f.geometry}));
for(const d of districts)if(!divisionOf[d.name])throw new Error('Unknown district in source: '+d.name);
if(new Set(districts.map(d=>d.name)).size!==64)throw new Error('Expected 64 districts');
const source=load('ADM3.geojson');

// Equirectangular about the country's middle latitude, snapped to a whole-number
// grid. Snapping is what thins the outlines, and because it depends on nothing
// but the point itself, two upazilas that share a border still share it after.
let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
for(const f of source)for(const p of polygons(f.geometry))for(const [x,y] of p[0]){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y)}
const k=Math.cos((south+north)/2*Math.PI/180),SCALE=Number(process.env.BD_MAP_SCALE||800),PAD=30;
const project=([lon,lat])=>[Math.round((lon-west)*k*SCALE)+PAD,Math.round((north-lat)*SCALE)+PAD];
function snapRing(ring){
 let pts=[];for(const c of ring){const p=project(c),q=pts[pts.length-1];if(!q||q[0]!==p[0]||q[1]!==p[1])pts.push(p)}
 if(pts.length>1&&pts[0][0]===pts[pts.length-1][0]&&pts[0][1]===pts[pts.length-1][1])pts.pop();
 return pts.length>=3&&ringArea(pts)!==0?pts:null;
}

const upazilas=source.map(f=>{
 const lonLat=polygons(f.geometry).reduce((a,b)=>Math.abs(ringArea(b[0]))>Math.abs(ringArea(a[0]))?b:a);
 const [x,y]=innerPoint(lonLat);
 const home=districts.find(d=>containsLonLat(d.geometry,x,y));
 if(!home)throw new Error('No district contains '+f.properties.shapeName);
 const rings=polygons(f.geometry).flatMap(p=>p.map(snapRing)).filter(Boolean);
 return {name:f.properties.shapeName.replace(/\s+/g,' ').trim(),district:home.name,division:divisionOf[home.name],rings};
});

// Thin the outlines without unstitching neighbours. Rings are cut into arcs at
// the points where three or more borders meet, and each arc is simplified on
// its own (Douglas-Peucker). Two upazilas that share an arc therefore drop
// exactly the same points from it. TOLERANCE is in map units.
const TOLERANCE=Number(process.env.BD_MAP_TOLERANCE||2.2);
{
 const id=p=>p[0]*100000+p[1],neighbours=new Map();
 const link=(a,b)=>{let set=neighbours.get(a);if(!set)neighbours.set(a,set=new Set());set.add(b)};
 for(const u of upazilas)for(const r of u.rings)for(let i=0;i<r.length;i++){const a=id(r[i]),b=id(r[(i+1)%r.length]);link(a,b);link(b,a)}
 const junction=p=>neighbours.get(id(p)).size!==2;
 function reduce(line){
  // Always worked in one direction, so both owners of an arc get one answer.
  const flip=id(line[0])>id(line[line.length-1])||(id(line[0])===id(line[line.length-1])&&line.length>2&&id(line[1])>id(line[line.length-2]));
  const pts=flip?[...line].reverse():line,keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
  const stack=[[0,pts.length-1]];
  while(stack.length){
   const [a,b]=stack.pop();if(b-a<2)continue;
   const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;let worst=-1,at=-1;
   for(let i=a+1;i<b;i++){
    const px=pts[i][0]-ax,py=pts[i][1]-ay;let d;
    if(!len)d=px*px+py*py;else{const t=Math.max(0,Math.min(1,(px*dx+py*dy)/len)),ex=px-t*dx,ey=py-t*dy;d=ex*ex+ey*ey}
    if(d>worst){worst=d;at=i}
   }
   if(worst>TOLERANCE*TOLERANCE){keep[at]=1;stack.push([a,at],[at,b])}
  }
  const out=pts.filter((_,i)=>keep[i]);return flip?out.reverse():out;
 }
 function simplify(ring){
  const cuts=[];for(let i=0;i<ring.length;i++)if(junction(ring[i]))cuts.push(i);
  let out=[];
  if(!cuts.length){
   // A lone island: pin its lowest-id point and the point farthest from it.
   let s=0;for(let i=1;i<ring.length;i++)if(id(ring[i])<id(ring[s]))s=i;
   const r=[...ring.slice(s),...ring.slice(0,s)];let far=1,best=-1;
   for(let i=1;i<r.length;i++){const d=(r[i][0]-r[0][0])**2+(r[i][1]-r[0][1])**2;if(d>best){best=d;far=i}}
   out=[...reduce(r.slice(0,far+1)).slice(0,-1),...reduce([...r.slice(far),r[0]]).slice(0,-1)];
  }else for(let c=0;c<cuts.length;c++){
   const a=cuts[c],b=cuts[(c+1)%cuts.length],arc=[];
   for(let i=a;;i=(i+1)%ring.length){arc.push(ring[i]);if(i===b&&arc.length>1)break}
   out.push(...reduce(arc).slice(0,-1));
  }
  return out.length>=3&&ringArea(out)!==0?out:ring;
 }
 for(const u of upazilas)u.rings=u.rings.map(simplify);
}

// Dissolve: an edge two members walk in opposite directions is interior and
// cancels; what is left is the outline, chained back into rings.
function dissolve(members){
 const edges=new Map(),key=(a,b)=>a[0]+','+a[1]+'>'+b[0]+','+b[1];
 for(const m of members)for(const ring of m.rings){
  const r=ringArea(ring)<0?ring:[...ring].reverse();
  for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],back=key(b,a);if(edges.has(back))edges.delete(back);else edges.set(key(a,b),[a,b])}
 }
 const from=new Map();for(const e of edges.values()){const s=e[0][0]+','+e[0][1];if(!from.has(s))from.set(s,[]);from.get(s).push(e)}
 const rings=[];
 for(const start of edges.values()){
  if(start.used)continue;const ring=[];let e=start;
  while(e&&!e.used){e.used=true;ring.push(e[0]);e=(from.get(e[1][0]+','+e[1][1])||[]).find(n=>!n.used)}
  if(ring.length>=3)rings.push(ring);
 }
 // Slivers where the source's neighbours did not quite agree are not coastline.
 const biggest=Math.max(...rings.map(r=>Math.abs(ringArea(r))));
 return rings.filter(r=>Math.abs(ringArea(r))>Math.max(6,biggest*.00002));
}
// Points on a straight run add nothing to the drawing.
const tidy=ring=>ring.filter((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0])});
function shape(rings){
 let d='',x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,points=0;
 for(const raw of rings){
  const pts=tidy(raw);if(pts.length<3)continue;points+=pts.length;
  d+='M'+pts[0][0]+' '+pts[0][1]+'l';
  for(let i=1;i<pts.length;i++){const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1];d+=(i>1&&dx>=0?' ':'')+dx+(dy>=0?' ':'')+dy}
  d+='z';
  for(const [x,y] of pts){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 }
 total+=points;
 return {d,b:[x0,y0,x1,y1],c:innerPoint(rings).map(Math.round)};
}
let total=0;
const group=(list,field)=>Object.entries(Object.groupBy(list,u=>u[field]));
const byName=(a,b)=>a.n.localeCompare(b.n);
const out={
 width:Math.round((east-west)*k*SCALE)+PAD*2,height:Math.round((north-south)*SCALE)+PAD*2,
 source:'Boundaries: Bangladesh Bureau of Statistics / OCHA via geoBoundaries, CC BY 3.0 IGO',
 divisions:group(upazilas,'division').map(([n,members])=>({n,...shape(dissolve(members))})).sort(byName),
 districts:group(upazilas,'district').map(([n,members])=>({n,p:divisionOf[n],...shape(dissolve(members))})).sort(byName),
 upazilas:upazilas.map(u=>({n:u.name,p:u.district,...shape(u.rings)})).sort((a,b)=>a.p.localeCompare(b.p)||byName(a,b)),
};
if(out.divisions.length!==8||out.districts.length!==64)throw new Error('Dissolve produced '+out.divisions.length+' divisions and '+out.districts.length+' districts');
const file=path.resolve('public/assets/bd-map.json');
writeFileSync(file,JSON.stringify(out));
console.log(`${file}: ${out.divisions.length} divisions, ${out.districts.length} districts, ${out.upazilas.length} upazilas, ${total} points, ${Math.round(readFileSync(file).length/1024)} KB, ${out.width}x${out.height}`);
console.log('rings per division:',out.divisions.map(d=>d.n+' '+(d.d.match(/M/g)||[]).length).join(', '));
