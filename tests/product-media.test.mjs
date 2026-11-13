import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadProductImages,readProductImages,changeProductImage,productMediaEditor} from '../public/product-media-admin.js';

// Minimal DOM boundary: the real uploader controls its rows and upload states.
function editor(){
 const rows=[],save={disabled:false},feedback={textContent:''},count={textContent:''};
 const detach=row=>{const index=rows.indexOf(row);if(index>=0)rows.splice(index,1)};
 const list={prepend(row){detach(row);rows.unshift(row)},insertAdjacentHTML(_,html){
  const label={value:html.match(/data-image-label[^>]*value="([^"]*)"/)[1]},controls=new Map();
  const row={dataset:{url:html.match(/data-url="([^"]*)"/)[1]},parentElement:list,
   toggleAttribute(){},querySelector(selector){if(selector==='[data-image-label]')return label;if(!controls.has(selector))controls.set(selector,{});return controls.get(selector)},remove(){detach(row)},
   before(other){detach(other);rows.splice(rows.indexOf(row),0,other)},after(other){detach(other);rows.splice(rows.indexOf(row)+1,0,other)},
   get previousElementSibling(){return rows[rows.indexOf(row)-1]},get nextElementSibling(){return rows[rows.indexOf(row)+1]}
  };rows.push(row);
 }};
 const form={dataset:{},querySelectorAll:()=>rows,querySelector:selector=>({'.product-media-list':list,'[type=submit]':save,'[data-media-feedback]':feedback,'[data-media-count]':count}[selector])};
 const input={files:[],value:'chosen',disabled:false,closest:()=>form};
 const file=name=>({name,type:'image/png',size:100});
 return {form,input,file,rows,save,feedback,count};
}

test('multi-file uploads retain successful images when one fails and unlock saving afterward',async()=>{
 const app=editor();app.input.files=['front.png','back.png','sleeve-detail.png'].map(app.file);
 let count=0;
 await assert.rejects(uploadProductImages(app.input,async(path,{body})=>{
  assert.equal(path,'/api/admin/upload');assert.equal(app.save.disabled,true);assert.equal(app.form.dataset.uploading,'true');
  count++;if(body.name==='back.png')throw Error('Connection failed');return {url:'/media/image-'+count+'.png'};
 }),/2 uploaded; 1 failed/);
 assert.equal(count,3);assert.deepEqual(readProductImages(app.form),[{url:'/media/image-1.png',label:'Front'},{url:'/media/image-3.png',label:'Sleeve detail'}]);
 assert.match(app.feedback.textContent,/back.png/);assert.equal(app.save.disabled,false);assert.equal(app.input.disabled,false);assert.equal(app.form.dataset.uploading,undefined);
 // Retrying only the failed file preserves already-uploaded views.
 app.input.files=[app.file('back.png')];await uploadProductImages(app.input,async()=>({url:'/media/back.png'}));
 assert.deepEqual(readProductImages(app.form).map(image=>image.label),['Front','Sleeve detail','Back']);
 // Choosing a cover and removing a view changes the payload order.
 const button=(action,row)=>({dataset:{mediaAction:action},closest:selector=>selector==='form'?app.form:row});
 changeProductImage(button('cover',app.rows[2]));assert.equal(readProductImages(app.form)[0].label,'Back');
 changeProductImage(button('remove',app.rows[2]));assert.equal(readProductImages(app.form).length,2);
 app.rows[1].querySelector('[data-image-label]').value='Custom neckline';assert.equal(readProductImages(app.form)[1].label,'Custom neckline');
});

test('invalid types and oversized files fail before any image is uploaded',async()=>{
 const app=editor();let calls=0;const api=async()=>{calls++;return {url:'/media/unused.png'}};
 app.input.files=[{name:'file.svg',type:'image/svg+xml',size:100}];await assert.rejects(uploadProductImages(app.input,api),/PNG, JPG or WebP/);
 app.input.files=[{name:'huge.png',type:'image/png',size:26*1024*1024}];await assert.rejects(uploadProductImages(app.input,api),/under 25 MB/);
 // Large sources are accepted and compressed first; one that cannot be brought
 // under the server's 5 MB limit is refused without being sent.
 app.input.files=[{name:'large.png',type:'image/png',size:6*1024*1024}];await assert.rejects(uploadProductImages(app.input,api),/over 5 MB after compression/);
 assert.equal(calls,0);assert.equal(app.save.disabled,false);
});

test('image editor exposes multiple selection and safely displays custom image names',()=>{
 const html=productMediaEditor([{url:'/media/photo.png',label:'Front " <detail>'}]);
 assert.match(html,/type="file" multiple/);assert.match(html,/Front &quot; &lt;detail&gt;/);assert.match(html,/Use as cover/);
});
