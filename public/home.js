import {signatureProducts as products} from './catalog.js';
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let paused=document.body.classList.contains('motion-paused')||reduced.matches;
document.body.classList.add('home-motion');
const observe=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-inview',entry.isIntersecting)),{threshold:.18});
document.querySelectorAll('.hand-note,.circled-word,.orbit-heading').forEach(el=>observe.observe(el));
document.querySelectorAll('main .oval-link').forEach(link=>{
 link.classList.add('drawn-cta');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('cta-sketch');svg.setAttribute('viewBox','0 0 220 76');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M127 64C67 72 5 59 4 36 2 12 64 2 115 4 166 4 213 14 216 36 219 61 120 72 45 73');path.setAttribute('pathLength','1');svg.append(path);link.append(svg);observe.observe(link);
});
const heroArrow=document.querySelector('.hero-note svg');
if(heroArrow){heroArrow.classList.add('draw-arrow');heroArrow.querySelector('path').setAttribute('pathLength','1');observe.observe(heroArrow.parentElement)}
const orbit=document.querySelector('.signature-orbit');
const shirt=document.querySelector('.orbit-shirt');
const badges=[...document.querySelectorAll('.orbit-badge')];
const photos=[...document.querySelectorAll('.collage-photo')];
const darkSections=[...document.querySelectorAll('[data-nav-theme="dark"]')];
let pending=false;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function updateScroll(){
 pending=false;
 document.body.classList.toggle('on-dark',darkSections.some(section=>{const r=section.getBoundingClientRect();const cap=section.querySelector(':scope > .scallop-edge')?.getBoundingClientRect().height||0;const start=section.classList.contains('lyverne-footer')?r.top+cap:r.top-cap;return start<=52&&r.bottom>52}));
 if(paused||reduced.matches)return;
 const r=orbit.getBoundingClientRect();
 const progress=clamp((innerHeight-r.top)/(r.height+innerHeight),0,1);
 const travel=(progress-.5);
 shirt.style.setProperty('--shirt-turn',`${-7+progress*14}deg`);
 badges.forEach((badge,i)=>{const direction=i%2===0?1:-1;const tilt=parseFloat(getComputedStyle(badge).getPropertyValue('--tilt'))||0;badge.style.setProperty('--badge-y',`${travel*(innerWidth<=650?75:180)*direction}px`);badge.style.setProperty('--badge-turn',`${tilt+travel*55*direction}deg`)});
 photos.forEach((photo,i)=>{const bounds=photo.parentElement.getBoundingClientRect();const amount=clamp((innerHeight/2-bounds.top)/innerHeight,-1,1);photo.style.setProperty('--photo-y',`${amount*(i===1?-25:i===2?18:32)}px`)});
}
function requestUpdate(){if(!pending){pending=true;requestAnimationFrame(updateScroll)}}
window.addEventListener('scroll',requestUpdate,{passive:true});window.addEventListener('resize',requestUpdate,{passive:true});
window.addEventListener('lyverne-motion',e=>{paused=e.detail.paused;requestUpdate()});
reduced.addEventListener('change',()=>{paused=reduced.matches;requestUpdate()});
updateScroll();
// The color carousel is manual: nothing advances while a visitor is choosing.
const carousel=document.querySelector('.box-carousel');
const image=carousel.querySelector('.carousel-product-image');
const label=carousel.querySelector('.carousel-name');
const shop=carousel.querySelector('.carousel-shop');
const dots=[...carousel.querySelectorAll('[data-slide]')];
let current=0,swapTimer;
function showSlide(index,direction=1){
 current=(index+products.length)%products.length;
 const product=products[current];
 clearTimeout(swapTimer);
 carousel.style.setProperty('--direction',direction);carousel.classList.add('is-switching');
 dots.forEach((dot,i)=>dot.setAttribute('aria-pressed',String(i===current)));
 // Update the selectable product immediately, then animate its matching image.
 shop.dataset.productId=product.id;shop.setAttribute('aria-label',`View selected color: ${product.color}`);
 label.textContent=`THE SIGNATURE TEE / ${product.color.toUpperCase()}`;
 carousel.querySelector('.carousel-count').textContent=`${String(current+1).padStart(2,'0')} / 04`;
 swapTimer=setTimeout(()=>{image.src=product.image;image.alt=`${product.color} Signature Tee`;carousel.classList.remove('is-switching')},reduced.matches||paused?0:220);
}
carousel.querySelector('.carousel-prev').addEventListener('click',()=>showSlide(current-1,-1));
carousel.querySelector('.carousel-next').addEventListener('click',()=>showSlide(current+1,1));
dots.forEach(dot=>dot.addEventListener('click',()=>showSlide(Number(dot.dataset.slide),Number(dot.dataset.slide)>current?1:-1)));
carousel.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();showSlide(current+(e.key==='ArrowRight'?1:-1),e.key==='ArrowRight'?1:-1)}});
let touchStart=null;
carousel.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchStart={x:e.clientX,y:e.clientY}},{passive:true});
carousel.addEventListener('pointerup',e=>{if(!touchStart)return;const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)showSlide(current+(dx<0?1:-1),dx<0?1:-1)},{passive:true});
carousel.addEventListener('pointercancel',()=>touchStart=null);
