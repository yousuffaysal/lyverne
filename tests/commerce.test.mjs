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
async function setup(){const DB=await localDatabase(':memory:');const {JWKS,token,uuid}=await identities();const env={DB,ADMIN_EMAIL:'owner@example.test',SUPABASE_URL:SUPABASE,JWKS};return {DB,uuid,env,token,async request(path,method='GET',data,user='customer',custom={}){const headers={'Content-Type':'application/json',Origin:origin,...custom};if(user)headers.Authorization='Bearer '+await token(user);const response=await worker.fetch(new Request(origin+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data)}),env,{});return {status:response.status,data:await response.json()};}};}
const product={name:'Test Tee',color:'Black',description:'A test garment.',category:'SIGNATURE',price:1800,stock:2,sizes:['M','L'],image:'/assets/tee-front.png',back:'',status:'active'};
const order=(pid,key=crypto.randomUUID())=>({items:[{id:pid,size:'M',quantity:1}],address:'Test street, Dhaka 1205',division:'Dhaka',district:'Dhaka',thana:'Dhanmondi',postcode:'1205',phone:'01700000000',requestKey:key});
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


test('complete delivery snapshot persists for customer and admin, independently of profile edits',async()=>{
 const app=await setup();try{
  const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
  const delivery={...order(p.id),phone:'+8801712345678',alternate_phone:'০১৮১২৩৪৫৬৭৮',division:'Dhaka',district:'Gazipur',thana:'Kaliganj',local_area:'Ward 4, Jamalpur Union',address:'House 12, village road, beside the school',delivery_note:'Please call the alternative number if I am unavailable.\nUse the east gate.'};
  const response=await app.request('/api/orders','POST',delivery);assert.equal(response.status,201);
  const oid=response.data.order.id;
  const expected={...delivery,phone:'01712345678',alternate_phone:'01812345678'};
  for(const path of ['/api/orders/'+oid,'/api/admin/orders/'+oid]){
   const read=await app.request(path,'GET',null,path.includes('/admin/')?'owner':'customer');
   for(const field of ['phone','alternate_phone','division','district','thana','local_area','address','postcode','delivery_note'])assert.equal(read.data.order[field],expected[field],field);
  }
  const profile=await app.request('/api/me','PUT',{name:'Updated shopper',...expected,address:'Another house, different road'});
  assert.equal(profile.status,200);
  assert.equal(profile.data.user.alternate_phone,'01812345678');assert.equal(profile.data.user.local_area,expected.local_area);
  assert.equal((await app.request('/api/orders/'+oid)).data.order.address,delivery.address,'order keeps original address');
  const saved=await app.DB.prepare('SELECT * FROM orders WHERE id=?').bind(oid).first();
  assert.equal(saved.delivery_note,delivery.delivery_note);
 }finally{app.DB.close();}
});

test('invalid delivery contact and location data cannot reserve stock or create an order',async()=>{
 const app=await setup();try{
  const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
  for(const patch of [{alternate_phone:'12345'},{alternate_phone:'01700000000'},{division:'Dhaka',district:'Sylhet'},{thana:''},{local_area:'x'.repeat(161)},{delivery_note:'x'.repeat(1001)},{phone:'not a number'}]){
   const response=await app.request('/api/orders','POST',{...order(p.id),...patch});assert.equal(response.status,400,JSON.stringify(patch).slice(0,80));
  }
  assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,2);
  assert.equal((await app.request('/api/orders')).data.orders.length,0);
 }finally{app.DB.close();}
});

test('all five fulfilment stages saved by admin appear on customer list and detail with history',async()=>{
 const app=await setup();try{
  const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
  const created=(await app.request('/api/orders','POST',order(p.id))).data.order;
  assert.equal(created.status,'confirmed');let version=1;
  for(const status of ['packing','shipped','out-for-delivery','delivered']){
   const update=await app.request('/api/admin/orders/'+created.id,'PUT',{status,payment:'paid',version,note:'INTERNAL ONLY'},'owner');assert.equal(update.status,200);version++;
   const detail=(await app.request('/api/orders/'+created.id)).data;
   assert.equal(detail.order.status,status);assert.equal(detail.events.length,version);assert.equal(detail.order.note,undefined);
   assert.ok(detail.events.some(event=>event.status===status));
   assert.equal((await app.request('/api/orders')).data.orders[0].status,status);
   assert.equal((await app.request('/api/admin/overview','GET',null,'owner')).data.orders[0].status,status);
   assert.equal(detail.order.tracking_number,'','no invented courier number');assert.equal(detail.order.delivery_date,'','no invented delivery promise');
  }
  assert.equal((await app.request('/api/admin/orders/'+created.id,'PUT',{status:'packing',payment:'paid',version},'owner')).status,400);
 }finally{app.DB.close();}
});

test('a failed cancellation rolls back stock, status and event history together',async()=>{
 const app=await setup();try{
  const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
  const orderId=(await app.request('/api/orders','POST',order(p.id))).data.order.id;
  const original=app.DB.transaction;
  app.DB.transaction=fn=>original(tx=>fn({...tx,run:async(sql,...args)=>{
   if(sql.startsWith('INSERT INTO order_events'))throw Error('simulated history write failure');
   return tx.run(sql,...args);
  }}));
  assert.equal((await app.request('/api/admin/orders/'+orderId,'PUT',{status:'cancelled',payment:'pending',version:1},'owner')).status,500);
  app.DB.transaction=original;
  const detail=(await app.request('/api/orders/'+orderId)).data;
  assert.equal(detail.order.status,'confirmed');assert.equal(detail.order.version,1);assert.equal(detail.events.length,1);
  assert.equal((await app.request('/api/products','GET',null,null)).data.products[0].stock,1);
 }finally{app.DB.close();}
});

test('invalid form objects and impossible delivery dates are refused without writing',async()=>{
 const app=await setup();try{
  const p=(await app.request('/api/admin/products','POST',product,'owner')).data.product;
  for(const invalid of [null,[],42,'text'])assert.equal((await app.request('/api/orders','POST',invalid)).status,400);
  const placed=(await app.request('/api/orders','POST',order(p.id))).data.order;
  const response=await app.request('/api/admin/orders/'+placed.id,'PUT',{status:'shipped',payment:'pending',version:1,delivery_date:'2026-02-30'},'owner');
  assert.equal(response.status,400);assert.equal((await app.request('/api/orders/'+placed.id)).data.order.version,1);
 }finally{app.DB.close();}
});

test('a labelled gallery persists through product creation, metadata edits and cover changes',async()=>{
 const app=await setup();try{
  const images=[{url:'/assets/tee-front.png',label:'Front'},{url:'/assets/tee-back.png',label:'Back'},{url:'/assets/tee-detail.png',label:'Stitching close-up'}];
  const created=await app.request('/api/admin/products','POST',{...product,images},'owner');assert.equal(created.status,201);const p=created.data.product;
  assert.deepEqual(p.images,images);assert.equal(p.image,images[0].url);assert.equal(p.back,images[1].url);
  assert.equal((await app.request('/api/admin/products/'+p.id,'PUT',{...product,back:p.back,name:'Renamed tee',version:1},'owner')).status,200);
  let saved=(await app.request('/api/products','GET',null,null)).data.products[0];assert.deepEqual(saved.images,images,'legacy metadata update preserves additional photos');
  const reordered=[images[2],images[0]];
  assert.equal((await app.request('/api/admin/products/'+p.id,'PUT',{...product,images:reordered,version:2},'owner')).status,200);
  saved=(await app.request('/api/products','GET',null,null)).data.products[0];assert.deepEqual(saved.images,reordered);assert.equal(saved.image,images[2].url);assert.equal(saved.back,'');
  const page=await worker.fetch(new Request(origin+'/collection/'+p.slug+'/'),app.env,{});
  const html=await page.text();assert.equal(page.status,200);assert.match(html,/Stitching close-up/);assert.match(html,/data-page-view="image-1"/);
  const schema=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match=>JSON.parse(match[1])).find(item=>item['@type']==='Product');
  assert.ok(schema);assert.equal(schema.image.length,2);

 }finally{app.DB.close();}
});

test('gallery validation refuses unsafe URLs, duplicates, unnamed images and excessive images',async()=>{
 const app=await setup();try{
  for(const images of [[],null,[{url:'javascript:alert(1)',label:'Front'}],[{url:'/assets/tee-front.png',label:''}],[{url:'/assets/tee-front.png',label:'x'.repeat(41)}],[{url:'/assets/tee-front.png',label:'Front'},{url:'/assets/tee-front.png',label:'Back'}],Array.from({length:13},(_,i)=>({url:'/media/image-'+i+'.png',label:'Image '+i}))]){
   assert.equal((await app.request('/api/admin/products','POST',{...product,images},'owner')).status,400);
  }
  assert.equal((await app.request('/api/products','GET',null,null)).data.products.length,0);
 }finally{app.DB.close();}
});

test('uploaded front, back and custom images save together and malformed uploads cannot write storage',async()=>{
 const app=await setup();try{
  const stored=new Map();app.env.BUCKET={async put(key,body){stored.set(key,new Uint8Array(body))}};
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64'));
  const upload=async(bytes,user='owner')=>worker.fetch(new Request(origin+'/api/admin/upload',{method:'POST',headers:{Origin:origin,'Content-Type':'image/png',Authorization:'Bearer '+await app.token(user)},body:bytes}),app.env,{});
  const images=[];
  for(const label of ['Front','Back','Sleeve detail']){const response=await upload(png);assert.equal(response.status,201);images.push({url:(await response.json()).url,label});}
  assert.equal(stored.size,3);
  assert.equal((await upload(new TextEncoder().encode('not an image'))).status,400);
  assert.equal((await upload(png,'customer')).status,403);assert.equal(stored.size,3);
  const created=await app.request('/api/admin/products','POST',{...product,images},'owner');assert.equal(created.status,201);assert.deepEqual(created.data.product.images,images);
  const html=await (await worker.fetch(new Request(origin+'/collection/'+created.data.product.slug+'/'),app.env,{})).text();
  for(const item of images){assert.ok(html.includes(item.url));assert.ok(html.includes(item.label));}
 }finally{app.DB.close();}
});
