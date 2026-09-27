const root=document.documentElement;
const loader=document.querySelector('.page-loader');
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const stack=[...document.querySelectorAll('.loader-stack img')];
const count=document.querySelector('.loader-count');
let fromInternal=false;
try{fromInternal=sessionStorage.getItem('lyverne-page-transition')==='1';sessionStorage.removeItem('lyverne-page-transition')}catch{}
function reveal(){root.classList.remove('is-loading');root.classList.add('page-ready');loader?.setAttribute('aria-hidden','true')}
// The stacked-photo counter is the arrival sequence for a first visit only.
// Moving between pages already has the orange curtain, and playing both meant
// every navigation ran two loaders back to back. Arriving from an internal
// link reveals immediately, so the curtain is the whole transition.
if(loader&&!reduced&&!fromInternal){
 const start=performance.now();let loaded=0,shown=-1,progress=0,finishing=false;
 const assets=[...new Set([...document.querySelectorAll('[data-eager-image]')].map(i=>i.src).concat(['/assets/lyverne-navbar.png']))];
 const total=assets.length+1;
 const ready=()=>loaded++;
 assets.forEach(src=>{const img=new Image();img.onload=ready;img.onerror=ready;img.src=src});
 document.fonts.ready.then(ready,ready);
 const duration=2100;
 function tick(now){
  if(finishing)return;
  const elapsed=now-start;
  const actual=loaded/total;
  const timeline=Math.min(elapsed/duration,1);
  progress=Math.max(progress,Math.min(actual,timeline)*100);
  // Never leave the visitor behind a loading curtain if an asset stalls.
  if(elapsed>5000)progress=100;
  if(count)count.textContent=String(Math.floor(progress)).padStart(3,'0');
  const frame=Math.floor(elapsed/(duration/stack.length));
  if(frame!==shown&&frame<stack.length){shown=frame;stack[frame]?.classList.add('is-shown')}
  if(elapsed>duration*.55)loader.classList.add('brand-reveal');
  if(progress>=100){finishing=true;if(count)count.textContent='100';loader.classList.add('is-finishing');root.classList.add('page-ready');setTimeout(reveal,900);return}
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);
}else reveal();
// Arriving from an internal link: the curtain is still conceptually covering
// the screen, so play it out upward instead of letting it disappear.
if(fromInternal&&!reduced){
 const curtain=document.querySelector('.page-curtain');
 if(curtain){
  curtain.style.transition='none';
  curtain.classList.add('is-covering');
  void curtain.offsetHeight; // commit the covering state before animating
  curtain.style.transition='';
  requestAnimationFrame(()=>{
   curtain.classList.add('is-lifting');
   const done=()=>{curtain.classList.remove('is-covering','is-lifting');curtain.removeEventListener('transitionend',done);};
   curtain.addEventListener('transitionend',done);
   setTimeout(done,900); // in case the transition never fires
  });
 }
}
window.addEventListener('pageshow',event=>{if(event.persisted){reveal();document.body.classList.remove('is-leaving');document.querySelector('.page-curtain')?.classList.remove('is-covering')}});
document.addEventListener('click',event=>{
 const a=event.target.closest('a[href]');
 if(!a||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
 const url=new URL(a.href,location.href);
 if(url.origin!==location.origin||url.pathname===location.pathname||!['/','/collection/','/studio/','/login/','/signup/','/dashboard/','/admin/'].includes(url.pathname))return;
 if(reduced)return;
 event.preventDefault();const curtain=document.querySelector('.page-curtain');if(!curtain){location.href=url.href;return}
 if(document.body.classList.contains('is-leaving'))return;
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 document.body.classList.add('is-leaving');curtain.classList.add('is-covering');
 try{sessionStorage.setItem('lyverne-page-transition','1')}catch{}
 setTimeout(()=>location.assign(url.href),560);
});
