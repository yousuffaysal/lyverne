import * as descriptionAdmin from '../public/product-description-admin.js';
import * as pricingAdmin from '../public/product-pricing-admin.js';
import * as collectionAdmin from '../public/collection-admin.js';
import * as media from '../public/product-media-admin.js';
// Execute the actual workspace controller with an isolated DOM and API boundary.
// This checks tabs and polling without signing into a live customer account.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as commerce from '../public/commerce.js';
import * as promotions from '../public/promotions-admin.js';
import * as team from '../public/team-admin.js';
import {authMotion} from '../public/auth-motion.js';
import {DIVISIONS} from '../server/bangladesh.mjs';
const source=(await readFile(new URL('../public/workspace.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\nboot\(\);\s*$/,'');
const product={id:'tee',name:'Everyday tee',color:'Black',description:'Cotton',category:'SIGNATURE',price:1200,stock:8,sizes:['M'],image:'/assets/tee-front.png',status:'active',version:1};
const order={id:'LY-ONE',customer_id:'shopper',customer_name:'Shopper',status:'packing',payment:'paid',total:1200,created_at:new Date().toISOString(),items:[{...product,size:'M',quantity:1}],address:'House 4, village road',phone:'01712345678',alternate_phone:'01812345678',division:'Dhaka',district:'Dhaka',thana:'Savar',local_area:'Ward 4',delivery_note:'Call at the gate',version:2};
function workspace({admin=true,hash=''}={}){
 const requests=[],nodes=new Map(),handlers={},timers=[];
 const node=()=>({innerHTML:'',textContent:'',open:false,classList:{add(){},remove(){}},addEventListener(){},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false}});
 const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)};
 const user={id:'shopper',name:'Shopper',email:'shopper@example.test',admin,chief:admin,wishlist:'[]'};
 const data={
  '/api/config':{ai:false,uploads:false},'/api/me':{user},'/api/regions':{divisions:DIVISIONS},'/api/products':{products:[product]},'/api/orders':{orders:[order]},'/api/orders/LY-ONE':{order,events:[{status:'packing',message:'Packed',created_at:order.created_at}]},
  '/api/admin/overview':{products:[product],orders:[order],customers:[user],activity:[],connections:{}},'/api/admin/promotions':{promotions:[],campaign:promotions.blankCampaign},
  '/api/admin/users':{users:[user],you:{chief:true}},'/api/admin/tasks':{tasks:[],team:[user]},'/api/admin/custom-orders':{enquiries:[],labels:{}},'/api/admin/orders/LY-ONE':{order,events:[]},'/api/admin/collection-layout':{layout:{sections:['graphic','signature'],products:{graphic:[],signature:[]},version:0},products:[product]}
 };
 const context=vm.createContext({...commerce,...promotions,...team,...media,...collectionAdmin,...pricingAdmin,...descriptionAdmin,originals:[product],money:n=>'BDT '+n,authMotion,auth:{getToken:async()=> 'test',consumeRedirect:()=>null},Response,URLSearchParams,Blob,crypto:{randomUUID:()=> 'test'},Date,
  document:{body:{dataset:{page:admin?'admin':'dashboard'}},hidden:false,activeElement:{matches:()=>false},querySelector:get,querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn},
  location:{hash,search:'',pathname:admin?'/admin/':'/dashboard/'},history:{replaceState(){}},window:{addEventListener:(name,fn)=>handlers['window:'+name]=fn,scrollTo(){}},addEventListener(){},scrollY:0,
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){},fetch:async path=>{requests.push(path);if(!data[path])throw Error('Unexpected API '+path);return new Response(JSON.stringify(data[path]),{status:200})}
 });
 vm.runInContext(source,context);
 return {context,get,data,requests,timers,run:code=>vm.runInContext(code,context)};
}

test('all operational admin tabs render populated data and messaging has no entry point',async()=>{
 const app=workspace();await app.run('bootInner()');
 const tabs=app.run('adminTabs.map(tab=>tab[0])');
 for(const tab of tabs){await app.run(`navigate('${tab}')`);assert.match(app.get('#workspace').innerHTML,/<h1>/,tab);}
 assert.ok(!tabs.includes('chat'));
 await app.run("navigate('chat')");assert.equal(app.run('state.view'),'overview');
 assert.ok(!app.requests.includes('/api/admin/messages'));
 assert.match(app.get('#workspace').innerHTML,/account-logout/,'mobile admin has logout');
});

test('direct links load the people, work board and team-order data before rendering',async()=>{
 for(const [tab,endpoint] of [['team','/api/admin/users'],['tasks','/api/admin/tasks'],['custom','/api/admin/custom-orders']]){
  const app=workspace({hash:'#'+tab});await app.run('bootInner()');assert.ok(app.requests.includes(endpoint),tab);assert.equal(app.run('state.view'),tab);
 }
});

test('admin order editor offers all five stages and the complete delivery snapshot',async()=>{
 const app=workspace();await app.run('bootInner()');await app.run("orderEditor('LY-ONE')");
 const html=app.get('#editor-content').innerHTML;
 for(const stage of commerce.statuses)assert.ok(html.includes(`name="status" value="${stage}"`),stage);
 for(const value of [order.phone,order.alternate_phone,order.local_area,order.delivery_note,order.thana,order.district])assert.ok(html.includes(value),value);
 assert.match(html,/Internal note/);assert.match(html,/CUSTOMER’S DELIVERY NOTE/);
});

test('checkout and saved-address form include structured delivery and optional contact fields',async()=>{
 const app=workspace({admin:false});await app.run('bootInner()');
 const html=app.run('deliveryFields(state.user)');
 for(const name of ['phone','alternate_phone','division','district','thana','address','postcode','delivery_note'])assert.ok(html.includes(`name="${name}"`),name);
 // Locality is written into the address itself, and the shop only delivers within Bangladesh.
 assert.ok(!html.includes('name="local_area"')&&!/Country/.test(html));
 assert.ok(!app.run('profileView()').includes('name="delivery_note"'),'delivery note belongs to the order');
});

test('automatic customer refresh updates every order, discovers new orders, and preserves the selected journey',async()=>{
 const app=workspace({admin:false});await app.run('bootInner()');
 const next={...order,id:'LY-TWO',status:'confirmed'};
 app.data['/api/orders']={orders:[next,{...order,status:'out-for-delivery'}]};
 app.data['/api/orders/LY-ONE']={order:{...order,status:'out-for-delivery'},events:[{status:'out-for-delivery',message:'With the courier'}]};
 await app.run('refreshTracking()');
 assert.equal(app.run('state.orders.length'),2);assert.equal(app.run('state.selectedOrder'),'LY-ONE');
 assert.equal(app.run("state.orders.find(order=>order.id==='LY-ONE').status"),'out-for-delivery');
 assert.ok(app.timers.some(timer=>timer.ms===5000));
 app.requests.length=0;app.get('#editor').open=true;await app.run('refreshTracking()');assert.equal(app.requests.length,0,'editing is not interrupted by polling');
});

test('product management opens saved collection ordering controls',async()=>{
 const app=workspace();await app.run('bootInner()');await app.run("navigate('products')");
 assert.match(app.get('#workspace').innerHTML,/Arrange collection/);
 await app.run("action('edit-collection-layout')");
 const html=app.get('#editor-content').innerHTML;
 assert.match(html,/name="first_section"/);assert.match(html,/data-collection-product="tee"/);assert.match(html,/data-collection-move="up"/);assert.match(html,/Save collection layout/);
});
