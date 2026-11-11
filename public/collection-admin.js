import {arrangeCollection,COLLECTION_TITLES} from './collection-layout.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow=direction=>`<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${direction==='up'?'m6 14 6-6 6 6':'m6 10 6 6 6-6'}"/></svg>`;
export function collectionLayoutEditor(products,layout){
 const groups=arrangeCollection(products.filter(product=>product.status==='active'),layout);
 return `<form id="collection-layout-form" data-version="${layout.version}"><p class="small muted">Choose which collection appears first. Within each section, arrange pieces from left to right, then onto the next row.</p><label class="collection-first">First section<select name="first_section">${groups.map(group=>`<option value="${group.key}" ${layout.sections[0]===group.key?'selected':''}>${e(group.title)}</option>`).join('')}</select></label><div class="collection-layout-sections">${groups.map(group=>`<section class="collection-order-section" data-layout-section="${group.key}"><header><h3>${e(group.title)}</h3><span class="small muted">${group.products.length} pieces</span></header><ol data-collection-list="${group.key}">${group.products.map((product,index)=>`<li data-collection-product="${e(product.id)}"><span class="collection-position">${String(index+1).padStart(2,'0')}</span><img src="${e(product.image)}" alt="" width="48" height="48"><div><strong>${e(product.name)}</strong><small>${e(product.color)}</small></div><div class="collection-order-controls"><button type="button" data-collection-move="up" aria-label="Move ${e(product.name)} earlier" ${index===0?'disabled':''}>${arrow('up')}</button><button type="button" data-collection-move="down" aria-label="Move ${e(product.name)} later" ${index===group.products.length-1?'disabled':''}>${arrow('down')}</button></div></li>`).join('')}</ol>${!group.products.length?'<p class="small muted">Publish a product in this collection to arrange it here.</p>':''}</section>`).join('')}</div><p class="small muted">Only published products are shown. New pieces appear at the end until you arrange them. Homepage positions are managed separately.</p><p class="error" role="alert"></p><div class="actions"><button type="button" class="btn ghost" data-action="close-editor">Cancel</button><button type="submit" class="btn orange">Save collection layout</button></div></form>`;
}
export function moveCollectionProduct(button){
 const row=button.closest('[data-collection-product]');
 if(button.dataset.collectionMove==='up'&&row.previousElementSibling)row.previousElementSibling.before(row);
 if(button.dataset.collectionMove==='down'&&row.nextElementSibling)row.nextElementSibling.after(row);
 [...row.parentElement.children].forEach((item,index,items)=>{
  item.querySelector('.collection-position').textContent=String(index+1).padStart(2,'0');
  item.querySelector('[data-collection-move=up]').disabled=index===0;
  item.querySelector('[data-collection-move=down]').disabled=index===items.length-1;
 });
}
export function previewCollectionSections(select){
 const form=select.form,sections=form.querySelector('.collection-layout-sections');
 sections.prepend(form.querySelector(`[data-layout-section="${select.value}"]`));
}
export function readCollectionLayoutForm(form){
 const first=form.elements.first_section.value;
 return {version:Number(form.dataset.version),sections:[first,first==='graphic'?'signature':'graphic'],products:Object.fromEntries([...form.querySelectorAll('[data-collection-list]')].map(list=>[list.dataset.collectionList,[...list.querySelectorAll('[data-collection-product]')].map(row=>row.dataset.collectionProduct)]))};
}
