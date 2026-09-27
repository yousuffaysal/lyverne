import test from 'node:test';
import assert from 'node:assert/strict';
import {localDatabase} from '../scripts/local-database.mjs';
import worker from '../server/worker.mjs';
import {analytics,productInput} from '../server/domain.mjs';
import {SignJWT,exportJWK,generateKeyPair,createLocalJWKSet} from 'jose';
const origin='https://lyverne.test';
const SUPABASE='https://test-project.supabase.co';
// Tests sign genuine ES256 tokens with a throwaway key pair and hand the Worker
// the matching key set, so they exercise the same jwtVerify path production
// uses. A token signed by any other key still fails, so this is not a bypass.
async function identities(){
 const {publicKey,privateKey}=await generateKeyPair('ES256',{extractable:true});
 const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='ES256';
 const uuid=name=>`00000000-0000-4000-8000-${[...name].reduce((h,c)=>h+c.charCodeAt(0).toString(16),'').padEnd(12,'0').slice(0,12)}`;
 const token=name=>new SignJWT({email:name==='owner'?'owner@example.test':name+'@example.test',user_metadata:{full_name:name}}).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(SUPABASE+'/auth/v1').setAudience('authenticated').setSubject(uuid(name)).setIssuedAt().setExpirationTime('1h').sign(privateKey);
 return {JWKS:createLocalJWKSet({keys:[jwk]}),token,uuid};
}
async function setup(){const DB=await localDatabase(':memory:');const {JWKS,token,uuid}=await identities();const env={DB,ADMIN_EMAIL:'owner@example.test',SUPABASE_URL:SUPABASE,JWKS};return {DB,uuid,async request(path,method='GET',data,user='customer',custom={}){const headers={'Content-Type':'application/json',Origin:origin,...custom};if(user)headers.Authorization='Bearer '+await token(user);const response=await worker.fetch(new Request(origin+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data)}),env,{});return {status:response.status,data:await response.json()};}};}
const product={name:'Test Tee',color:'Black',description:'A test garment.',category:'SIGNATURE',price:1800,stock:2,sizes:['M','L'],image:'/assets/tee-front.png',back:'',status:'active'};
const order=(pid,key=crypto.randomUUID())=>({items:[{id:pid,size:'M',quantity:1}],address:'Test street, Dhaka 1205',phone:'01700000000',requestKey:key});
test('anonymous and customer requests cannot use admin endpoints; cross-origin mutations rejected',async()=>{const app=await setup();try{assert.equal((await app.request('/api/admin/overview','GET',null,null)).status,401);assert.equal((await app.request('/api/admin/overview')).status,403);assert.equal((await app.request('/api/admin/products','POST',product,'owner',{Origin:'https://untrusted.test'})).status,403);assert.equal((await app.request('/api/admin/products','POST',product,'customer')).status,403);}finally{app.DB.close();}});
test('product CRUD persists, validates fields, rejects stale edits, and hides drafts and archived records',async()=>{const app=await setup();try{const created=await app.request('/api/admin/products','POST',product,'owner');assert.equal(created.status,201);const p=created.data.product;assert.equal((await app.request('/api/products','GET',null,null)).data.products.length,1);assert.equal((await app.request('/api/admin/products/'+p.id,'PUT',{...product,name:'Edited Tee',version:1},'owner')).status,200);assert.equal((await app.request('/api/admin/products/'+p.id,'PUT',{...product,version:1},'owner')).status,409);assert.equal((await app.request('/api/admin/products/'+p.id,'DELETE',{version:2},'owner')).status,200);assert.equal((await app.request('/api/products','GET',null,null)).data.products.length,0);assert.equal((await app.request('/api/admin/products/'+p.id,'PUT',{...product,version:3},'owner')).status,200);assert.equal((await app.request('/api/admin/products','POST',{...product,price:-4},'owner')).status,400);assert.equal((await app.request('/api/admin/products','POST',{...product,image:'javascript:alert(1)'},'owner')).status,400);}finally{app.DB.close();}});
test('order creation calculates price server-side, reserves stock, deduplicates retry and prevents overselling',async()=>{const app=await setup();try{const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;const b=order(p.id);b.total=1;b.items[0].price=1;const a=await app.request('/api/orders','POST',b);assert.equal(a.status,201);assert.equal(a.data.order.total,1800);assert.equal((await app.request('/api/orders','POST',b)).data.order.id,a.data.order.id);assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,1);assert.equal((await app.request('/api/orders','POST',order(p.id),'second')).status,201);assert.equal((await app.request('/api/orders','POST',order(p.id),'third')).status,409);assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,0);}finally{app.DB.close();}});
test('customers only see their orders; updates create history; cancellation restores stock exactly once',async()=>{const app=await setup();try{const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;const o=(await app.request('/api/orders','POST',order(p.id))).data.order;assert.equal((await app.request('/api/orders/'+o.id,'GET',null,'other')).status,404);assert.deepEqual((await app.request('/api/orders','GET',null,'other')).data.orders,[]);const update={status:'packing',payment:'paid',version:1,note:'Owner-only note',message:'Your tee is packed.'};assert.equal((await app.request('/api/admin/orders/'+o.id,'PUT',update,'owner')).status,200);const detail=(await app.request('/api/orders/'+o.id)).data;assert.equal(detail.order.status,'packing');assert.equal(detail.events.length,2);assert.equal(detail.order.note,undefined);// The owner may jump straight to any stage -- the previous one-step-at-a-time
 // rule left only three options in a five-stage flow. Terminal states still hold.
 assert.equal((await app.request('/api/admin/orders/'+o.id,'PUT',{...update,status:'out-for-delivery',version:2},'owner')).status,200,'skipping ahead is allowed');
 assert.equal((await app.request('/api/admin/orders/'+o.id,'PUT',{...update,status:'cancelled',version:3},'owner')).status,200);
 assert.equal((await app.request('/api/admin/orders/'+o.id,'PUT',{...update,status:'cancelled',version:3},'owner')).status,409,'a stale version is refused');
 assert.equal((await app.request('/api/admin/orders/'+o.id,'PUT',{...update,status:'packing',version:4},'owner')).status,400,'a cancelled order cannot be reopened');assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,2);}finally{app.DB.close();}});
test('concurrent requests cannot reserve the same final item',async()=>{const app=await setup();try{const p=(await app.request('/api/admin/products','POST',{...product,stock:1},'owner')).data.product;const results=await Promise.all([app.request('/api/orders','POST',order(p.id),'first'),app.request('/api/orders','POST',order(p.id),'second')]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,0);}finally{app.DB.close();}});
test('profile and saved pieces persist separately per customer; AI fallback is explicitly labelled',async()=>{const app=await setup();try{assert.equal((await app.request('/api/me','PUT',{name:'A new name',address:'A saved address',city:'Dhaka',phone:'01700000000'})).status,200);await app.request('/api/wishlist','PUT',{items:['graphic-paper']});const me=(await app.request('/api/me')).data.user;assert.equal(me.name,'A new name');assert.equal(me.address,'A saved address');assert.equal(me.wishlist,'["graphic-paper"]');assert.equal((await app.request('/api/me','GET',null,'other')).data.user.wishlist,'[]');const reply=await app.request('/api/admin/assistant','POST',{prompt:'How is my store doing?'},'owner');assert.equal(reply.data.mode,'insights');assert.match(reply.data.answer,/No open orders/);}finally{app.DB.close();}});
test('analytics excludes unpaid, refunded and cancelled orders from revenue',()=>{const now=Date.now(),created_at=new Date(now).toISOString(),base={created_at,items:[],total:1800,status:'confirmed',payment:'paid'};const m=analytics([base,{...base,payment:'pending'},{...base,payment:'refunded'},{...base,status:'cancelled'}],[],30,now);assert.equal(m.revenue,1800);assert.equal(m.average,1800);assert.equal(m.count,4);assert.throws(()=>productInput({...product,status:'active',price:null}));});

// Regression: the owner's internal note must never reach the customer.
// createOrder has two exit paths and the idempotent-replay one returned the
// raw row, so re-posting a known requestKey after the owner added a note
// handed that note to the customer.
test('an order replay does not leak the owner note or the request key',async()=>{const app=await setup();try{
 const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
 const key=crypto.randomUUID()+'-replay';
 const first=await app.request('/api/orders','POST',{...order(p.id,key)});
 assert.equal(first.status,201);
 assert.equal('note' in first.data.order,false,'a fresh order must not carry note');
 assert.equal('request_key' in first.data.order,false,'a fresh order must not carry request_key');
 const oid=first.data.order.id;
 const secret='INTERNAL: flag as risk, ship COD only';
 assert.equal((await app.request('/api/admin/orders/'+oid,'PUT',{status:'packing',payment:'paid',version:1,note:secret},'owner')).status,200);
 const replay=await app.request('/api/orders','POST',{...order(p.id,key)});
 assert.equal(replay.data.order.id,oid,'the replay must be idempotent');
 assert.equal('note' in replay.data.order,false,'the replay must not leak the internal note');
 assert.equal('request_key' in replay.data.order,false);
 assert.ok(!JSON.stringify(replay.data).includes(secret));
}finally{app.DB.close();}});

// The AI product-copy endpoint returns these fields and productMeta() reads
// them, but nothing persisted them, so every generated override was discarded.
test('owner-set SEO overrides are saved and returned',async()=>{const app=await setup();try{
 const created=await app.request('/api/admin/products','POST',{...product,seo_title:'Custom SEO title',seo_description:'Custom SEO description'},'owner');
 assert.equal(created.status,201);
 const saved=await app.DB.prepare('SELECT seo_title,seo_description FROM products WHERE id=?').bind(created.data.product.id).first();
 assert.equal(saved.seo_title,'Custom SEO title');
 assert.equal(saved.seo_description,'Custom SEO description');
 assert.equal((await app.request('/api/admin/products/'+created.data.product.id,'PUT',{...product,version:1,seo_title:'Edited title',seo_description:'Edited description'},'owner')).status,200);
 const after=await app.DB.prepare('SELECT seo_title FROM products WHERE id=?').bind(created.data.product.id).first();
 assert.equal(after.seo_title,'Edited title');
}finally{app.DB.close();}});

// Stock and promo guards must be enforced by the statement that writes, not by
// a snapshot read. Postgres at READ COMMITTED oversells otherwise; SQLite
// serialises so this test cannot prove the race, only that the guard is applied.
test('a reservation against stale stock or a stale version is refused',async()=>{const app=await setup();try{
 const p=(await app.request('/api/admin/products','POST',{...product,stock:1},'owner')).data.product;
 assert.equal((await app.request('/api/orders','POST',order(p.id),'first')).status,201);
 assert.equal((await app.request('/api/orders','POST',order(p.id),'second')).status,409,'no second unit exists');
 const stock=(await app.request('/api/products','GET',null,null)).data.products[0].stock;
 assert.equal(stock,0,'stock must never go negative');
}finally{app.DB.close();}});
