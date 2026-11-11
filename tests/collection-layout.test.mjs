import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangeCollection} from '../server/collection-layout.mjs';
import {moveCollectionProduct,readCollectionLayoutForm} from '../public/collection-admin.js';

test('collection sorting keeps section order, appends unlisted products and does not mutate inputs',()=>{
 const products=[{id:'s-new',category:'SIGNATURE'},{id:'g',category:'GRAPHIC EDITION'},{id:'s-old',category:'SIGNATURE'}];
 const groups=arrangeCollection(products,{sections:['signature','graphic'],products:{signature:['s-old'],graphic:[]}});
 assert.deepEqual(groups.map(group=>group.key),['signature','graphic']);assert.deepEqual(groups[0].products.map(product=>product.id),['s-old','s-new']);
 assert.deepEqual(products.map(product=>product.id),['s-new','g','s-old']);
});

test('admin move controls update serial numbers and the saved order payload',()=>{
 const children=[];
 const detach=row=>children.splice(children.indexOf(row),1);
 const list={dataset:{collectionList:'signature'},children,querySelectorAll:()=>children};
 for(const id of ['first','second','third']){
  const controls=new Map(),row={dataset:{collectionProduct:id},parentElement:list,
   querySelector(selector){if(!controls.has(selector))controls.set(selector,{});return controls.get(selector)},
   get previousElementSibling(){return children[children.indexOf(row)-1]},get nextElementSibling(){return children[children.indexOf(row)+1]},
   before(other){detach(other);children.splice(children.indexOf(row),0,other)},after(other){detach(other);children.splice(children.indexOf(row)+1,0,other)}
  };children.push(row);
 }
 const second=children[1];
 moveCollectionProduct({dataset:{collectionMove:'up'},closest:()=>second});
 assert.deepEqual(children.map(row=>row.dataset.collectionProduct),['second','first','third']);
 assert.equal(children[0].querySelector('.collection-position').textContent,'01');assert.equal(children[0].querySelector('[data-collection-move=up]').disabled,true);
 moveCollectionProduct({dataset:{collectionMove:'down'},closest:()=>second});
 assert.deepEqual(children.map(row=>row.dataset.collectionProduct),['first','second','third']);
 const graphic={dataset:{collectionList:'graphic'},querySelectorAll:()=>[]};
 const form={dataset:{version:'3'},elements:{first_section:{value:'signature'}},querySelectorAll:()=>[list,graphic]};
 assert.deepEqual(readCollectionLayoutForm(form),{version:3,sections:['signature','graphic'],products:{signature:['first','second','third'],graphic:[]}});
});
