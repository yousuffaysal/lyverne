import {MAX_PRODUCT_IMAGES} from './commerce.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function productImageRow(image){return `<li class="product-media-row" data-product-image data-url="${e(image.url)}"><img src="${e(image.url)}" alt="" width="72" height="86"><div class="product-media-name"><label>Image name<input data-image-label list="product-image-labels" value="${e(image.label)}" maxlength="40" required placeholder="Front, Back, Detail…"></label><span data-cover-label class="small muted"></span></div><div class="product-media-actions"><button type="button" class="text-btn" data-media-action="cover">Use as cover</button><div><button type="button" data-media-action="up" aria-label="Move image earlier">↑</button><button type="button" data-media-action="down" aria-label="Move image later">↓</button><button type="button" class="text-btn danger" data-media-action="remove">Remove</button></div></div></li>`;}
export function productMediaEditor(images){return `<section class="full product-media-editor" aria-labelledby="product-media-heading"><div class="panel-head"><div><h3 id="product-media-heading">Product images</h3><p class="small muted">The first image is the cover. Give every view a name.</p></div><span data-media-count class="small muted">${images.length} / ${MAX_PRODUCT_IMAGES}</span></div><datalist id="product-image-labels"><option value="Front"><option value="Back"><option value="Side"><option value="Detail"><option value="Fabric"><option value="Other"></datalist><ol class="product-media-list">${images.map(productImageRow).join('')}</ol><label class="product-media-upload">Upload images<input id="product-upload" type="file" multiple accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WebP · up to 5 MB each · ${MAX_PRODUCT_IMAGES} images per product</small></label><p class="small" data-media-feedback role="status"></p></section>`;}
export function readProductImages(form){return [...form.querySelectorAll('[data-product-image]')].map(row=>({url:row.dataset.url,label:row.querySelector('[data-image-label]').value.trim()}));}
export function updateProductMedia(form){
 const rows=[...form.querySelectorAll('[data-product-image]')];
 rows.forEach((row,index)=>{
  row.toggleAttribute('data-cover',index===0);
  row.querySelector('[data-cover-label]').textContent=index===0?'Cover image':'Gallery image '+(index+1);
  row.querySelector('[data-media-action=cover]').hidden=index===0;
  row.querySelector('[data-media-action=up]').disabled=index===0;
  row.querySelector('[data-media-action=down]').disabled=index===rows.length-1;
 });
 form.querySelector('[data-media-count]').textContent=rows.length+' / '+MAX_PRODUCT_IMAGES;
}
export function addProductImage(form,image){
 const current=readProductImages(form);
 if(current.some(item=>item.url===image.url))throw Error('That image is already in this product.');
 if(current.length>=MAX_PRODUCT_IMAGES)throw Error(`Use up to ${MAX_PRODUCT_IMAGES} images per product.`);
 form.querySelector('.product-media-list').insertAdjacentHTML('beforeend',productImageRow(image));updateProductMedia(form);
}
export function changeProductImage(button){
 const form=button.closest('form');if(form.dataset.uploading)return;
 const row=button.closest('[data-product-image]');
 const action=button.dataset.mediaAction;
 if(action==='remove')row.remove();
 if(action==='cover')row.parentElement.prepend(row);
 if(action==='up'&&row.previousElementSibling)row.previousElementSibling.before(row);
 if(action==='down'&&row.nextElementSibling)row.nextElementSibling.after(row);
 updateProductMedia(form);
}
const fileLabel=name=>{
 const label=name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim().slice(0,40);
 return label?label.charAt(0).toUpperCase()+label.slice(1):'Other';
};
export async function uploadProductImages(input,api){
 const form=input.closest('form'),files=[...input.files],feedback=form.querySelector('[data-media-feedback]');
 if(!files.length||form.dataset.uploading)return;
 if(readProductImages(form).length+files.length>MAX_PRODUCT_IMAGES)throw Error(`Use up to ${MAX_PRODUCT_IMAGES} images per product.`);
 for(const file of files){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(`${file.name}: choose PNG, JPG or WebP.`);
  if(file.size>5*1024*1024)throw Error(`${file.name}: choose an image under 5 MB.`);
 }
 form.dataset.uploading='true';input.disabled=true;
 const save=form.querySelector('[type=submit]');if(save)save.disabled=true;
 const failures=[];let uploaded=0;
 try{
  for(const [index,file] of files.entries()){
   feedback.textContent=`Uploading ${index+1} of ${files.length}: ${file.name}`;
   try{const result=await api('/api/admin/upload',{method:'POST',body:file});addProductImage(form,{url:result.url,label:fileLabel(file.name)});uploaded++;}
   catch(error){failures.push(file.name+': '+error.message);}
  }
  feedback.textContent=`${uploaded} image${uploaded===1?'':'s'} uploaded. Set their names, then save the product.`;
  if(failures.length){feedback.textContent=`${uploaded} uploaded; ${failures.length} failed. ${failures.join(' ')}`;throw Error(feedback.textContent);}
 }finally{
  delete form.dataset.uploading;input.disabled=false;input.value='';if(save)save.disabled=false;
 }
}
