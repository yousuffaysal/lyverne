import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {SIZE_MEASUREMENTS,sizeGuide} from '../server/size-guide.mjs';
import {productPage} from '../server/render.mjs';

test('the product size guide contains the exact supplied garment measurements',()=>{
 assert.deepEqual(SIZE_MEASUREMENTS,[{size:'M',chest:42,width:21,length:28},{size:'L',chest:44,width:22,length:29},{size:'XL',chest:46,width:23,length:30}]);
 const html=productPage({origin:'https://lyverne.test',product:{id:'tee',slug:'tee',name:'Everyday Tee',color:'Black',category:'SIGNATURE',description:'A relaxed tee.',sizes:['M','L','XL'],stock:5,price:1800,image:'/assets/tee-front.png'}});
 assert.match(html,/href="#size-guide"/);assert.match(html,/id="size-guide"/);assert.match(html,/Chest width/);assert.match(html,/Full round/);
 assert.equal((sizeGuide().match(/data-measure-inches=/g)||[]).length,9);
});

test('unit switching is reversible and selected size highlights the matching guide row',async()=>{
 const control=(dataset)=>({dataset,attributes:{},events:{},setAttribute(name,value){this.attributes[name]=value},addEventListener(name,fn){this.events[name]=fn}});
 const units=['in','cm'].map(sizeUnit=>control({sizeUnit}));
 const cells=SIZE_MEASUREMENTS.flatMap(row=>[row.chest,row.width,row.length]).map(value=>({dataset:{measureInches:String(value)},textContent:String(value)}));
 const rows=SIZE_MEASUREMENTS.map(row=>({dataset:{guideSize:row.size},selected:false,toggleAttribute(_,value){this.selected=value}}));
 const caption={textContent:'Garment measurements in inches'},tableCaption={textContent:''};
 const guide={querySelectorAll:selector=>({'[data-size-unit]':units,'[data-measure-inches]':cells,'[data-guide-size]':rows}[selector]||[]),querySelector:selector=>selector==='[data-guide-caption]'?caption:tableCaption};
 const sizes=['M','L','XL'].map(size=>control({size})),add=control({addProduct:'tee'}),error={textContent:''};
 const document={querySelector:selector=>({'#size-guide':guide,'.product-page-info .add-to-bag':add,'.product-page-info .size-error':error}[selector]||null),querySelectorAll:selector=>selector==='.product-page-info [data-size]'?sizes:[]};
 const source=(await readFile(new URL('../public/product-page.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{document});
 units[1].events.click();assert.deepEqual(cells.slice(0,3).map(cell=>cell.textContent),['106.7','53.3','71.1']);assert.match(caption.textContent,/centimetres/);assert.equal(units[1].attributes['aria-pressed'],'true');
 units[0].events.click();assert.deepEqual(cells.slice(0,3).map(cell=>cell.textContent),['42','21','28']);assert.match(caption.textContent,/inches/);
 sizes[1].events.click();assert.deepEqual(rows.map(row=>row.selected),[false,true,false]);
 sizes[2].events.click();assert.deepEqual(rows.map(row=>row.selected),[false,false,true]);
});
