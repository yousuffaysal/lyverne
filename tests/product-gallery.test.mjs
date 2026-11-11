import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {productPage} from '../server/render.mjs';

const source=(await readFile(new URL('../public/product-page.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
const element=(dataset={})=>({dataset,attributes:{},events:{},focused:false,setAttribute(name,value){this.attributes[name]=value},addEventListener(name,fn){this.events[name]=fn},focus(){this.focused=true}});
function galleryController(){
 const classes=new Set(),gallery={classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)}}};
 const tabs=['Front','Back','Sleeve detail'].map((label,index)=>({...element({pageView:'image-'+index}),label}));
 tabs[0].attributes['aria-pressed']='true';
 const shots=tabs.map((tab,index)=>({dataset:{view:tab.dataset.pageView},active:index===0,toggleAttribute(_,active){this.active=active}}));
 const rail=element(),open=element(),close=element();rail.querySelector=()=>tabs.find(tab=>tab.attributes['aria-pressed']==='true');
 const mobile={matches:true,addEventListener(_,fn){this.change=fn}};
 const document={querySelector:selector=>({'.product-page-gallery':gallery,'#product-image-rail':rail,'[data-gallery-open]':open,'[data-gallery-close]':close}[selector]||null),querySelectorAll:selector=>({'.product-page-shot':shots,'.product-page-gallery [data-page-view]':tabs}[selector]||[])};
 vm.runInNewContext(source,{document,window:{matchMedia:()=>mobile}});
 return {classes,rail,open,close,tabs,shots,mobile};
}

test('mobile image rail closes to an edge control, reopens, and preserves the selected image',()=>{
 const app=galleryController();
 assert.equal(app.rail.inert,false);assert.equal(app.open.attributes['aria-expanded'],'true');
 app.tabs[1].events.click();assert.deepEqual(app.shots.map(shot=>shot.active),[false,true,false]);
 app.close.events.click();assert.equal(app.classes.has('rail-collapsed'),true);assert.equal(app.rail.inert,true);assert.equal(app.open.attributes['aria-expanded'],'false');assert.equal(app.open.focused,true);
 app.open.events.click();assert.equal(app.rail.inert,false);assert.equal(app.classes.has('rail-collapsed'),false);assert.equal(app.tabs[1].focused,true);assert.deepEqual(app.shots.map(shot=>shot.active),[false,true,false]);
 let prevented=false;app.rail.events.keydown({key:'Escape',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(app.rail.inert,true);
 app.mobile.matches=false;app.mobile.change();assert.equal(app.rail.inert,false,'desktop controls remain available after resizing');
 app.mobile.matches=true;app.mobile.change();assert.equal(app.rail.inert,true,'mobile collapsed preference is retained');
});

test('product gallery renders every uploaded view inside the collapsible image rail',()=>{
 const images=Array.from({length:12},(_,index)=>({url:'/media/photo-'+index+'.png',label:index===0?'Front':'View '+index}));
 const html=productPage({origin:'https://lyverne.test',product:{id:'tee',slug:'tee',name:'Everyday Tee',color:'Black',category:'SIGNATURE',description:'A relaxed tee.',sizes:['M'],stock:5,price:1800,image:images[0].url,images}});
 assert.match(html,/<aside class="gallery-rail" id="product-image-rail"/);assert.match(html,/data-gallery-close/);assert.match(html,/data-gallery-open/);
 const rail=html.match(/<aside class="gallery-rail"[\s\S]*?<\/aside>/)[0];
 assert.equal((rail.match(/data-page-view=/g)||[]).length,12);assert.ok(rail.includes('View 11'));
 assert.equal((html.match(/class="product-page-shot/g)||[]).length,12);
});
