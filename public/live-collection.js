import {priceMarkup} from './commerce.js';
import {arrangeCollection} from './collection-layout.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const card=product=>`<article class="catalog-card"><a class="catalog-product" href="/collection/${e(product.slug||product.id)}/" data-pid="${e(product.id)}" aria-label="View ${e(product.name)} in ${e(product.color)}"><span class="catalog-image"><img class="catalog-front" src="${e(product.image)}" alt="${e(product.name)}" width="1254" height="1254" loading="lazy"><span class="catalog-reverse ${product.back?'':'catalog-closeup'}"><img src="${e(product.back||product.image)}" alt="" width="1254" height="1254" loading="lazy"></span><span class="catalog-view">VIEW PIECE ↗︎</span></span><span class="catalog-meta"><span class="catalog-title">${e(product.name)}</span><span class="catalog-price">${priceMarkup(product,{compact:true})}</span><span class="catalog-color">${e(product.color)}</span><span class="catalog-category">${e(product.category)}</span></span></a></article>`;
export function renderLiveCollection(data){
 if(!data||!document.querySelector('.catalog-products'))return;
 const container=document.querySelector('#collection-grid');
 if(!container)return;
 if(!data.products.length){
  for(const item of container.querySelectorAll('.catalog-card')){const id=item.querySelector('[data-pid],[data-product-id]')?.dataset;const pid=id?.pid||id?.productId;if((data.managedIds||[]).includes(pid))item.remove();}
  return;
 }
 const groups=arrangeCollection(data.products,data.collectionLayout).filter(group=>group.products.length);
 container.innerHTML=groups.map((group,index)=>`<div class="catalog-chapter${index?' collection-chapter-spaced':''}"><h2>${e(group.title.toUpperCase())}</h2><p>${group.products.length} ${group.products.length===1?'PIECE':'PIECES'}</p></div><section class="catalog-products" ${index===0?'id="collection"':''} data-collection-section="${group.key}" aria-label="${e(group.title)}">${group.products.map(card).join('')}</section>`).join('');
 const note=document.querySelector('.catalog-preview-note');
 if(note)note.textContent='PUBLISHED PIECES ARE AVAILABLE TO REQUEST. PAYMENT AND DELIVERY ARE CONFIRMED BY LYVERNE. GENERATED MOCKUPS MAY VARY FROM THE FINAL GARMENT.';
}
