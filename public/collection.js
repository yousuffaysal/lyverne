const cursor=document.querySelector('.catalog-cursor');
const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
// Delegation also covers cards reordered or replaced after live data loads.
document.addEventListener('pointerover',event=>{
 const card=event.target.closest('.catalog-product');
 if(card&&cursor&&finePointer.matches&&!reduced.matches){cursor.classList.add('is-visible');cursor.style.transform=`translate(${event.clientX+15}px,${event.clientY+16}px)`;}
});
document.addEventListener('pointermove',event=>{
 if(event.target.closest('.catalog-product')&&cursor&&finePointer.matches&&!reduced.matches)cursor.style.transform=`translate(${Math.min(event.clientX+15,innerWidth-130)}px,${Math.min(event.clientY+16,innerHeight-45)}px)`;
});
document.addEventListener('pointerout',event=>{const card=event.target.closest('.catalog-product');if(card&&!card.contains(event.relatedTarget))cursor?.classList.remove('is-visible');});
document.addEventListener('click',event=>{if(event.target.closest('.catalog-product'))cursor?.classList.remove('is-visible');});
document.querySelector('[data-preview-info]')?.addEventListener('click',()=>document.getElementById('launch-dialog').showModal());
