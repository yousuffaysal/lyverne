const cursor=document.querySelector('.catalog-cursor');
const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
document.querySelectorAll('.catalog-product').forEach(card=>{
 card.addEventListener('pointerenter',e=>{if(finePointer.matches&&!reduced.matches){cursor.classList.add('is-visible');cursor.style.transform=`translate(${e.clientX+15}px,${e.clientY+16}px)`}});
 card.addEventListener('pointermove',e=>{if(finePointer.matches&&!reduced.matches)cursor.style.transform=`translate(${Math.min(e.clientX+15,innerWidth-130)}px,${Math.min(e.clientY+16,innerHeight-45)}px)`});
 card.addEventListener('pointerleave',()=>cursor.classList.remove('is-visible'));
 card.addEventListener('click',()=>cursor.classList.remove('is-visible'));
});
document.querySelector('[data-preview-info]')?.addEventListener('click',()=>document.getElementById('launch-dialog').showModal());
