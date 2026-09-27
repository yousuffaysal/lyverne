const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function showPromotion(campaign,{preview=false}={}){
 if(document.querySelector('#opening-promotion'))return;
 const dialog=document.createElement('dialog');dialog.id='opening-promotion';dialog.className='opening-promotion';dialog.setAttribute('aria-labelledby','promotion-title');
 const offer=campaign.offer,amount=offer?(offer.kind==='percent'?`${offer.value}% OFF`:`৳${offer.value.toLocaleString('en-US')} OFF`):'THE FIRST EDITION';
 const destination=['/collection/','/studio/'].includes(campaign.destination)?campaign.destination:'/collection/';
 dialog.innerHTML=`<button type="button" class="promotion-close" aria-label="Close promotion">×</button><div class="promotion-art"><img src="/assets/tee-front.webp" alt="The black Lyverne Signature Tee"><span class="promotion-seal">${escape(amount)}</span><img class="promotion-wordmark" src="/assets/lyverne-navbar.png" alt="LYVERNE"></div><div class="promotion-copy"><p class="promotion-eyebrow">${preview?'ADMIN PREVIEW':'A LITTLE SOMETHING FOR YOU'}</p><h2 id="promotion-title">${escape(campaign.title)}</h2><p>${escape(campaign.text)}</p>${campaign.code?`<div class="promotion-code"><span>YOUR CODE</span><strong>${escape(campaign.code)}</strong></div>${offer?`<p class="promotion-terms">${offer.minimum?`Minimum merchandise subtotal ৳${offer.minimum.toLocaleString('en-US')}. `:''}${offer.ends?`Ends ${escape(new Date(offer.ends).toLocaleDateString('en-GB'))}. `:''}One code per order. Subject to availability.</p>`:''}`:''}<a class="promotion-cta" href="${destination}">${escape(campaign.button)} <span aria-hidden="true">↗</span></a><button type="button" class="promotion-dismiss">Just looking around</button></div>`;
 const previous=document.activeElement;
 const close=()=>dialog.close();dialog.querySelector('.promotion-close').onclick=close;dialog.querySelector('.promotion-dismiss').onclick=close;
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 dialog.querySelector('a').addEventListener('click',event=>{if(preview)event.preventDefault();else if(campaign.code)try{localStorage.setItem('lyverne-promo-code',campaign.code);}catch{}close();});
 dialog.addEventListener('close',()=>{if(!preview)try{sessionStorage.setItem(`lyverne-promotion-${campaign.version}`,'seen');}catch{}dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});
 document.body.append(dialog);dialog.showModal();
}
async function init(){
 if(!['/','/collection/'].includes(location.pathname)||location.hash)return;
 try{
  const response=await fetch('/api/storefront/promotion');if(!response.ok)return;
  const {campaign}=await response.json();if(!campaign?.enabled)return;
  try{if(sessionStorage.getItem(`lyverne-promotion-${campaign.version}`))return;}catch{}
  let attempts=0;
  const show=()=>{if(document.hidden||document.querySelector('dialog[open]')||document.documentElement.classList.contains('is-loading')){if(++attempts<20)setTimeout(show,1000);return;}showPromotion(campaign);};
  setTimeout(show,1800);
 }catch{/* Shopping stays usable when an optional promotion cannot load. */}
}
init();
