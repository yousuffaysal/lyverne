// The delivery map: a live picture of where an order is going.
//
// It watches the division, district and upazila fields of a delivery form. Each
// choice flies the map in a level and turns that area orange; once the address
// itself is written, a pin drops on the chosen upazila. The upazila box also
// gains type-ahead from the same data, and choosing a place there fills in the
// district and division above it.
//
// The map never decides anything: the form fields stay the only record, the
// upazila can still be typed freely (a courier reads "Mirpur" whether or not it
// is on the list), and if the map data cannot be loaded the form works exactly
// as it did without it.
//
// The pin marks the middle of the chosen upazila. Nothing here geocodes the
// written address, so it is a "roughly here", not a doorstep.

const SVG='http://www.w3.org/2000/svg';
const MAP_URL='/assets/bd-map.json';
let mapData;
const loadMap=()=>mapData||=fetch(MAP_URL).then(r=>{if(!r.ok)throw new Error('map');return r.json()}).catch(error=>{mapData=null;throw error});
const fold=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const el=(name,attrs={},parent)=>{const node=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent?.append(node);return node};
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export async function attachDeliveryMap(form){
 if(!form||form.dataset.deliveryMap)return;
 const fields=form.querySelector('.delivery-fields'),division=form.elements.division,district=form.elements.district,thana=form.elements.thana;
 if(!fields||!division||!district||!thana)return;
 form.dataset.deliveryMap='1';
 const data=await loadMap();
 if(!form.isConnected)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const upazilasBy={};for(const u of data.upazilas)(upazilasBy[u.p]||=[]).push(u);
 const divisionOf=Object.fromEntries(data.districts.map(d=>[d.n,d.p]));

 // ---------- the panel ----------
 const panel=document.createElement('aside');
 panel.className='bd-map';panel.setAttribute('aria-label','Delivery area map');
 panel.innerHTML=`<div class="bd-map-inner"><div class="bd-map-head"><span class="eyebrow">DELIVERING TO</span><p class="bd-map-trail" aria-live="polite"></p></div><div class="bd-map-stage"><svg viewBox="0 0 ${data.width} ${data.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of Bangladesh"></svg><div class="bd-map-pin" hidden><i></i><svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 43 16 43s15-16.4 15-27.2C31 7.6 24.3 1 16 1z"/><circle cx="16" cy="15.5" r="5.6"/></svg></div><span class="bd-map-hover" hidden></span></div><div class="bd-map-foot"><span class="bd-map-hint"></span><small>${escapeHtml(data.source)}</small></div></div>`;
 const svg=panel.querySelector('.bd-map-stage>svg'),stage=panel.querySelector('.bd-map-stage'),pin=panel.querySelector('.bd-map-pin'),trail=panel.querySelector('.bd-map-trail'),hint=panel.querySelector('.bd-map-hint'),hover=panel.querySelector('.bd-map-hover');
 const land=el('g',{class:'bd-land'},svg),districtLayer=el('g',{class:'bd-districts'},svg),upazilaLayer=el('g',{class:'bd-upazilas'},svg),outline=el('g',{class:'bd-outline'},svg);
 for(const d of data.divisions){el('path',{d:d.d},land);el('path',{d:d.d,'data-division':d.n},outline)}
 for(const d of data.districts)el('path',{d:d.d,'data-district':d.n,'data-division':d.p},districtLayer);

 // Beside the form on a wide screen, inside it (just above the area fields) on
 // a narrow one. The dialog only has room for a column when it can grow.
 const wide=matchMedia('(min-width:1080px)'),host=form.closest('#editor-content');
 const anchor=division.closest('label');
 function place(){
  if(host&&wide.matches){panel.classList.remove('is-inline');host.append(panel)}
  else{panel.classList.add('is-inline');anchor.before(panel)}
  requestAnimationFrame(positionPin);
 }
 place();wide.addEventListener('change',place);

 // ---------- the camera ----------
 const full=[0,0,data.width,data.height];
 let view=[...full],flight=0;
 const setView=v=>{view=v;svg.setAttribute('viewBox',v.map(n=>Math.round(n*10)/10).join(' '));positionPin()};
 function frameFor(b,pad=.16){
  // Padded, and never tighter than a small town: a dot-sized upazila in Dhaka
  // should still show the streets' worth of neighbours around it.
  const w=Math.max(b[2]-b[0],data.width*.045),h=Math.max(b[3]-b[1],data.height*.045),cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;
  const ratio=(stage.clientWidth||4)/(stage.clientHeight||5);
  let fw=w*(1+pad*2),fh=h*(1+pad*2);
  if(fw/fh<ratio)fw=fh*ratio;else fh=fw/ratio;
  return [cx-fw/2,cy-fh/2,fw,fh];
 }
 function flyTo(target,{instant=false}={}){
  cancelAnimationFrame(flight);
  if(instant||reduce.matches||!panel.classList.contains('is-open')){setView(target);return}
  const from=[...view],start=performance.now();
  const c0=[from[0]+from[2]/2,from[1]+from[3]/2],c1=[target[0]+target[2]/2,target[1]+target[3]/2];
  const travel=Math.hypot(c1[0]-c0[0],c1[1]-c0[1]),span=Math.max(from[2],target[2]);
  // A hop between far-apart places pulls back first, the way a map app does,
  // so the eye keeps its bearings; a move within one area just glides.
  const lift=Math.min(.55,travel/span*.5),duration=Math.min(1500,820+travel/span*260);
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  (function step(now){
   const t=Math.min(1,(now-start)/duration),k=ease(t);
   const scale=Math.exp(Math.log(from[2])+(Math.log(target[2])-Math.log(from[2]))*k)*(1+lift*Math.sin(Math.PI*k));
   const cx=c0[0]+(c1[0]-c0[0])*k,cy=c0[1]+(c1[1]-c0[1])*k,h=scale*target[3]/target[2];
   setView([cx-scale/2,cy-h/2,scale,h]);
   if(t<1)flight=requestAnimationFrame(step);
  })(start);
 }

 // ---------- the pin ----------
 let pinAt=null;
 function positionPin(){
  if(!pinAt||pin.hidden)return;
  const matrix=svg.getScreenCTM();if(!matrix)return;
  const box=stage.getBoundingClientRect();
  pin.style.transform=`translate(${(pinAt[0]*matrix.a+matrix.e-box.left).toFixed(1)}px,${(pinAt[1]*matrix.d+matrix.f-box.top).toFixed(1)}px)`;
 }
 function setPin(point){
  const moved=!pinAt||!point||pinAt[0]!==point[0]||pinAt[1]!==point[1];
  pinAt=point;
  if(!point){pin.hidden=true;pin.classList.remove('is-dropped');return}
  if(pin.hidden||moved){
   // Restart the drop: off, a frame's pause, on again.
   pin.hidden=false;pin.classList.remove('is-dropped');positionPin();void pin.offsetWidth;
   // Let the camera get most of the way there first, so the pin lands on a
   // still map rather than chasing a moving one.
   setTimeout(()=>{if(pinAt===point)pin.classList.add('is-dropped')},reduce.matches?0:moved&&panel.classList.contains('is-open')?520:0);
  }
  positionPin();
 }

 // ---------- what the form says ----------
 let shown={division:'',district:'',upazila:null};
 const findUpazila=()=>{const key=fold(thana.value);return key&&(upazilasBy[district.value]||[]).find(u=>fold(u.n)===key)||null};
 const hasAddress=()=>(form.elements.address?.value.trim().length||0)>=8;
 function open(){
  if(panel.classList.contains('is-open'))return;
  panel.classList.add('is-open');
  // The frame is measured from the stage, which has only now been given a size.
  requestAnimationFrame(()=>{setView(frameFor(full,.02));sync({arrive:true})});
 }
 function sync({arrive=false}={}){
  const div=data.divisions.find(d=>d.n===division.value)||null;
  const dist=div&&data.districts.find(d=>d.n===district.value&&d.p===div.n)||null;
  const upa=dist?findUpazila():null;
  if(div&&!panel.classList.contains('is-open')){open();return}
  if(dist?.n!==shown.district){
   upazilaLayer.replaceChildren();
   if(dist)for(const u of upazilasBy[dist.n]||[])el('path',{d:u.d,'data-upazila':u.n},upazilaLayer);
  }
  for(const path of outline.children)path.classList.toggle('is-on',path.dataset.division===div?.n);
  // SVG paints in document order: the chosen shapes go last so their darker
  // outline is not drawn over by a neighbour's.
  const raise=path=>{if(path&&path!==path.parentNode.lastElementChild)path.parentNode.append(path)};
  for(const path of districtLayer.children){
   path.classList.toggle('is-in',!!div&&path.dataset.division===div.n);
   path.classList.toggle('is-on',path.dataset.district===dist?.n);
  }
  for(const path of upazilaLayer.children)path.classList.toggle('is-on',path.dataset.upazila===upa?.n);
  raise(outline.querySelector('.is-on'));raise(districtLayer.querySelector('.is-on'));raise(upazilaLayer.querySelector('.is-on'));
  svg.dataset.level=upa?'upazila':dist?'district':div?'division':'country';
  const changed=arrive||div?.n!==shown.division||dist?.n!==shown.district||upa!==shown.upazila;
  shown={division:div?.n||'',district:dist?.n||'',upazila:upa};
  if(changed){
   // An upazila is framed with a little of its district around it, so the
   // orange patch reads as a place inside somewhere, not a shape on its own.
   const target=upa?frameFor(upa.b,.9):dist?frameFor(dist.b):div?frameFor(div.b,.1):frameFor(full,.02);
   flyTo(target);
  }
  const typed=thana.value.trim();
  trail.innerHTML=['Bangladesh',div?.n,dist?.n,upa?.n||(dist&&typed?typed:'')].filter(Boolean).map((part,i,all)=>`<span${i===all.length-1?' class="is-last"':''}>${i?'<i aria-hidden="true">›</i> ':''}${escapeHtml(part)}</span>`).join(' ');
  const place=upa||(dist&&typed&&hasAddress()?dist:null);
  if(place&&hasAddress()){setPin(place.c);hint.textContent=upa?'Pin shows the centre of '+upa.n+'.':'Pin shows the centre of '+dist.n+' district.'}
  else{setPin(null);hint.textContent=!div?'Choose a division, or tap the map.':!dist?'Now your district.':!upa?'Now your upazila or thana.':'Add your address to drop the pin.'}
 }

 // ---------- picking from the map itself ----------
 const emit=field=>field.dispatchEvent(new Event('change',{bubbles:true}));
 function choose({division:div,district:dist,upazila}){
  if(div&&division.value!==div){division.value=div;emit(division)}
  if(dist&&district.value!==dist){
   if(![...district.options].some(o=>o.value===dist))return sync();
   district.value=dist;emit(district);
  }
  if(upazila!==undefined&&thana.value!==upazila){thana.value=upazila;thana.dispatchEvent(new Event('input',{bubbles:true}))}
  sync();
 }
 const targetOf=event=>{
  const path=event.target.closest?.('path');if(!path)return null;
  if(path.dataset.upazila)return {upazila:path.dataset.upazila,label:path.dataset.upazila};
  const name=path.dataset.district;if(!name)return null;
  // One level at a time: a tap on the country picks the division, a tap inside
  // the chosen division picks the district.
  return divisionOf[name]===division.value?{district:name,upazila:'',label:name}:{division:divisionOf[name],label:divisionOf[name]+' division'};
 };
 svg.addEventListener('click',event=>{const pick=targetOf(event);if(pick){const {label,...values}=pick;choose(values)}});
 svg.addEventListener('pointermove',event=>{
  const pick=event.pointerType==='mouse'?targetOf(event):null;
  hover.hidden=!pick;if(!pick)return;
  const box=stage.getBoundingClientRect();hover.textContent=pick.label;
  hover.style.transform=`translate(${Math.min(event.clientX-box.left+14,box.width-hover.offsetWidth-6)}px,${event.clientY-box.top+16}px)`;
 });
 svg.addEventListener('pointerleave',()=>{hover.hidden=true});

 // ---------- type-ahead on the upazila box ----------
 const label=thana.closest('label');label.classList.add('bd-suggest-wrap');
 const list=document.createElement('ul');list.className='bd-suggest';list.id='bd-suggest-'+Math.random().toString(36).slice(2,8);list.setAttribute('role','listbox');list.hidden=true;
 thana.after(list);
 Object.entries({role:'combobox','aria-autocomplete':'list','aria-expanded':'false','aria-controls':list.id,autocomplete:'off'}).forEach(([k,v])=>thana.setAttribute(k,v));
 let options=[],active=-1;
 function suggestions(){
  const key=fold(thana.value);
  // With a district chosen the list is that district's upazilas; before one is
  // chosen, the whole country is searched and the choice fills the rest in.
  const pool=district.value?(upazilasBy[district.value]||[]):key.length>=2?data.upazilas:[];
  const rank=u=>{const name=fold(u.n);return !key?0:name.startsWith(key)?0:name.includes(key)?1:!district.value&&fold(u.p).startsWith(key)?2:-1};
  return pool.map(u=>[rank(u),u]).filter(([r])=>r>=0).sort((a,b)=>a[0]-b[0]||a[1].n.localeCompare(b[1].n)).slice(0,district.value?60:8).map(([,u])=>u);
 }
 function renderList(){
  options=suggestions();
  // Nothing to offer once the box already holds exactly the one match.
  if(options.length===1&&fold(options[0].n)===fold(thana.value)&&district.value)options=[];
  active=-1;list.hidden=!options.length;thana.setAttribute('aria-expanded',String(!!options.length));thana.removeAttribute('aria-activedescendant');
  list.innerHTML=options.map((u,i)=>`<li role="option" id="${list.id}-${i}" data-index="${i}" aria-selected="false"><strong>${escapeHtml(u.n)}</strong><span>${escapeHtml(u.p)}${divisionOf[u.p]!==u.p?', '+escapeHtml(divisionOf[u.p]):''}</span></li>`).join('');
 }
 function closeList(){list.hidden=true;options=[];active=-1;thana.setAttribute('aria-expanded','false');thana.removeAttribute('aria-activedescendant')}
 function move(step){
  if(!options.length)return;
  active=(active+step+options.length)%options.length;
  [...list.children].forEach((li,i)=>li.setAttribute('aria-selected',String(i===active)));
  list.children[active].scrollIntoView({block:'nearest'});thana.setAttribute('aria-activedescendant',list.children[active].id);
 }
 function take(u){closeList();choose({division:divisionOf[u.p],district:u.p,upazila:u.n})}
 thana.addEventListener('focus',()=>{open();renderList()});
 thana.addEventListener('input',()=>{renderList();sync()});
 thana.addEventListener('blur',()=>setTimeout(closeList,120));
 thana.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(list.hidden)renderList();move(event.key==='ArrowDown'?1:-1)}
  else if(event.key==='Enter'&&!list.hidden&&active>=0){event.preventDefault();take(options[active])}
  else if(event.key==='Escape'&&!list.hidden){event.stopPropagation();event.preventDefault();closeList()}
 });
 // pointerdown, not click: the box must not lose focus (and close the list)
 // before the choice registers.
 list.addEventListener('pointerdown',event=>{const li=event.target.closest('li');if(li){event.preventDefault();take(options[Number(li.dataset.index)])}});

 // ---------- wiring ----------
 // Queued behind the page's own change handler, which rebuilds the district
 // list when the division changes; the map should read the settled form.
 form.addEventListener('change',event=>{if([division,district,thana].includes(event.target))queueMicrotask(sync)});
 form.addEventListener('input',event=>{if(event.target===form.elements.address)sync()});
 for(const field of [division,district])field.addEventListener('focus',open);
 new ResizeObserver(()=>{if(panel.classList.contains('is-open')){const s=shown,div=data.divisions.find(d=>d.n===s.division),dist=data.districts.find(d=>d.n===s.district);flyTo(s.upazila?frameFor(s.upazila.b,.9):dist?frameFor(dist.b):div?frameFor(div.b,.1):frameFor(full,.02),{instant:true})}}).observe(stage);
 stage.closest('dialog')?.addEventListener('scroll',positionPin,{passive:true});
 sync();
}
