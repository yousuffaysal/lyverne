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
// Product photos arrived straight from the design tool: 1254px+ PNGs of 3.6 to
// 5.2 MB each, so a phone on mobile data spent 3-4 seconds per tee and the
// collection page weighed ~30 MB. Every image is now resized to at most
// 1600px and re-encoded in the admin's browser before it is uploaded.
const MAX_EDGE=1600,MAX_SOURCE=25*1024*1024,MAX_UPLOAD=5*1024*1024;
function isOpaque(ctx,width,height){
 const data=ctx.getImageData(0,0,width,height).data;
 for(let i=3;i<data.length;i+=16)if(data[i]<250)return false;
 return true;
}
export async function optimizeImage(file){
 let bitmap;
 try{bitmap=await createImageBitmap(file);}catch{return file;}
 const scale=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height));
 const width=Math.round(bitmap.width*scale),height=Math.round(bitmap.height*scale);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
 const encode=(type,quality)=>new Promise(resolve=>canvas.toBlob(resolve,type,quality));
 // WebP keeps transparency at a fraction of PNG's size. Safari cannot encode
 // it, so there an opaque photo becomes JPEG and a cut-out stays PNG.
 let out=await encode('image/webp',.86);
 if(!out||out.type!=='image/webp')out=isOpaque(ctx,width,height)?await encode('image/jpeg',.86):await encode('image/png');
 return out&&out.size<file.size?out:file;
}
async function uploadOptimized(file,api){
 const ready=await optimizeImage(file);
 if(ready.size>MAX_UPLOAD)throw Error('this image is still over 5 MB after compression. Export it smaller and try again.');
 return api('/api/admin/upload',{method:'POST',body:ready});
}
// Re-encodes every photo already in the store. Each product is saved with its
// current version, so an edit made meanwhile is never overwritten.
export async function optimizeStoredImages(products,api,progress=()=>{}){
 let images=0,saved=0,before=0,after=0;const failures=[];
 const targets=products.filter(product=>product.status!=='archived');
 for(const [index,product] of targets.entries()){
  progress(`Checking ${index+1} of ${targets.length}: ${product.name}`);
  let changed=false;
  const gallery=[];
  for(const image of product.images||[]){
   if(!/^\/media\/[a-z0-9-]+\.(png|jpeg|webp)$/i.test(image.url)){gallery.push(image);continue;}
   try{
    const original=await (await fetch(image.url)).blob();
    if(original.size<400*1024){gallery.push(image);continue;}
    const ready=await optimizeImage(original);
    if(ready===original||ready.size>MAX_UPLOAD){gallery.push(image);continue;}
    const result=await api('/api/admin/upload',{method:'POST',body:ready});
    gallery.push({...image,url:result.url});changed=true;images++;before+=original.size;after+=ready.size;
   }catch(error){gallery.push(image);failures.push(`${product.name}: ${error.message}`);}
  }
  if(!changed)continue;
  try{await api('/api/admin/products/'+product.id,{method:'PUT',body:JSON.stringify({...product,images:gallery,version:product.version})});saved++;}
  catch(error){failures.push(`${product.name}: ${error.message}`);}
 }
 return {images,saved,before,after,failures};
}
export async function uploadProductImages(input,api){
 const form=input.closest('form'),files=[...input.files],feedback=form.querySelector('[data-media-feedback]');
 if(!files.length||form.dataset.uploading)return;
 if(readProductImages(form).length+files.length>MAX_PRODUCT_IMAGES)throw Error(`Use up to ${MAX_PRODUCT_IMAGES} images per product.`);
 for(const file of files){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(`${file.name}: choose PNG, JPG or WebP.`);
  if(file.size>MAX_SOURCE)throw Error(`${file.name}: choose an image under 25 MB.`);
 }
 form.dataset.uploading='true';input.disabled=true;
 const save=form.querySelector('[type=submit]');if(save)save.disabled=true;
 const failures=[];let uploaded=0;
 try{
  for(const [index,file] of files.entries()){
   feedback.textContent=`Uploading ${index+1} of ${files.length}: ${file.name}`;
   try{const result=await uploadOptimized(file,api);addProductImage(form,{url:result.url,label:fileLabel(file.name)});uploaded++;}
   catch(error){failures.push(file.name+': '+error.message);}
  }
  feedback.textContent=`${uploaded} image${uploaded===1?'':'s'} uploaded. Set their names, then save the product.`;
  if(failures.length){feedback.textContent=`${uploaded} uploaded; ${failures.length} failed. ${failures.join(' ')}`;throw Error(feedback.textContent);}
 }finally{
  delete form.dataset.uploading;input.disabled=false;input.value='';if(save)save.disabled=false;
 }
}
