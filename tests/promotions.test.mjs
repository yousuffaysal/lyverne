import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';
import {localDatabase} from '../scripts/local-database.mjs';
import {analytics,promotionAnalytics,promotionStatus} from '../server/domain.mjs';
import {SignJWT,exportJWK,generateKeyPair,createLocalJWKSet} from 'jose';
const origin='https://lyverne.test';
const SUPABASE='https://test-project.supabase.co';
// See tests/commerce.test.mjs: genuine ES256 tokens against a local key set,
// so the real verification path runs rather than a test-only shortcut.
async function identities(){
 const {publicKey,privateKey}=await generateKeyPair('ES256',{extractable:true});
 const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='ES256';
 const uuid=name=>`00000000-0000-4000-8000-${[...name].reduce((h,c)=>h+c.charCodeAt(0).toString(16),'').padEnd(12,'0').slice(0,12)}`;
 const token=name=>new SignJWT({email:name+'@example.test',user_metadata:{full_name:name}}).setProtectedHeader({alg:'ES256',kid:'test-key'}).setIssuer(SUPABASE+'/auth/v1').setAudience('authenticated').setSubject(uuid(name)).setIssuedAt().setExpirationTime('1h').sign(privateKey);
 return {JWKS:createLocalJWKSet({keys:[jwk]}),token,uuid};
}
async function setup(){const DB=await localDatabase(':memory:');const {JWKS,token,uuid}=await identities();const env={DB,ADMIN_EMAIL:'owner@example.test',SUPABASE_URL:SUPABASE,JWKS};return {DB,uuid,async request(path,method='GET',payload,user='owner'){const headers={Origin:origin,'Content-Type':'application/json'};if(user)headers.Authorization='Bearer '+await token(user);const response=await worker.fetch(new Request(origin+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(payload)}),env,{});return {status:response.status,...await response.json()};}};}
const product={name:'Promo test tee',color:'Black',description:'A test garment.',category:'SIGNATURE',price:1800,stock:20,sizes:['M'],image:'/assets/tee-front.png',back:'',status:'active'};
const offer={code:'WELCOME10',kind:'percent',value:10,minimum:0,limit:100,starts:'',ends:'',active:true};
const cart=pid=>({items:[{id:pid,quantity:1,size:'M'}],promoCode:'WELCOME10'});
const order=pid=>({...cart(pid),requestKey:crypto.randomUUID(),address:'Test address, Dhaka 1205',division:'Dhaka',district:'Dhaka',thana:'Dhanmondi',postcode:'1205',phone:'01700000000',discount:9999,total:1});
const create=async app=>{const p=(await app.request('/api/admin/products','POST',product)).product;await app.request('/api/admin/promotions','POST',offer);return p;};
test('promo management requires owner authorization; codes validate and stale updates are rejected',async()=>{const a=await setup();try{assert.equal((await a.request('/api/admin/promotions','POST',offer,'customer')).status,403);assert.equal((await a.request('/api/admin/promotions','GET',null,null)).status,401);assert.equal((await a.request('/api/admin/promotions','POST',{...offer,value:101})).status,400);assert.equal((await a.request('/api/admin/promotions','POST',offer)).status,201);assert.equal((await a.request('/api/admin/promotions','POST',offer)).status,409);const p=(await a.request('/api/admin/promotions')).promotions[0];assert.equal((await a.request('/api/admin/promotions/'+p.id,'PUT',{...offer,version:1,active:false})).status,200);assert.equal((await a.request('/api/admin/promotions/'+p.id,'PUT',{...offer,version:1})).status,409);}finally{a.DB.close();}});
test('discounts are priced on the server and idempotent retries consume one use',async()=>{const a=await setup();try{const p=await create(a);const quote=await a.request('/api/checkout/quote','POST',cart(p.id),'customer');assert.equal(quote.quote.total,1620);assert.equal(quote.quote.discount,180);const b=order(p.id),r=await a.request('/api/orders','POST',b,'customer');assert.equal(r.order.subtotal,1800);assert.equal(r.order.total,1620);assert.equal(r.order.discount,180);assert.equal(r.order.promo_code,'WELCOME10');assert.equal((await a.request('/api/orders','POST',b,'customer')).order.id,r.order.id);assert.equal((await a.request('/api/admin/promotions')).promotions[0].used,1);assert.equal((await a.request('/api/products')).products[0].stock,19);}finally{a.DB.close();}});
test('expired, future, inactive, minimum-spend and exhausted codes cannot be used',async()=>{const a=await setup();try{const p=await create(a),promo=(await a.request('/api/admin/promotions')).promotions[0];const variants=[{active:false},{starts:'2099-01-01T00:00:00Z'},{ends:'2000-01-01T00:00:00Z'},{minimum:2000}];let version=1;for(const v of variants){await a.request('/api/admin/promotions/'+promo.id,'PUT',{...offer,...v,version:version++});assert.equal((await a.request('/api/checkout/quote','POST',cart(p.id),'customer')).status,400);}await a.request('/api/admin/promotions/'+promo.id,'PUT',{...offer,limit:1,version});await a.request('/api/orders','POST',order(p.id),'customer');assert.equal((await a.request('/api/orders','POST',order(p.id),'other')).status,400);assert.equal((await a.request('/api/checkout/quote','POST',{...cart(p.id),promoCode:'UNKNOWN'},'customer')).status,400);}finally{a.DB.close();}});
test('the final available redemption cannot be consumed by two simultaneous orders',async()=>{const a=await setup();try{const p=(await a.request('/api/admin/products','POST',product)).product,q=(await a.request('/api/admin/products','POST',product)).product;await a.request('/api/admin/promotions','POST',{...offer,limit:1});const replies=await Promise.all([a.request('/api/orders','POST',order(p.id),'first'),a.request('/api/orders','POST',order(q.id),'second')]);
 // Exactly one order may take the last redemption. The refusal may arrive as
 // 400 (the quote sees used>=limit) or 409 (the quote passed but the batch
 // guard caught it), depending on how the two requests interleave; both are
 // correct, and the invariants asserted below are what actually matter.
 const statuses=replies.map(r=>r.status).sort();
 assert.equal(statuses.filter(s=>s===201).length,1,'exactly one order should succeed');
 assert.ok(statuses.some(s=>s===400||s===409),'the other order must be refused');assert.equal((await a.request('/api/admin/promotions')).promotions[0].used,1);const stock=(await a.request('/api/products')).products.reduce((sum,p)=>sum+p.stock,0);assert.equal(stock,39);}finally{a.DB.close();}});
test('fixed discounts are capped at subtotal; cancellation does not reopen redemptions',async()=>{const a=await setup();try{const p=(await a.request('/api/admin/products','POST',product)).product;await a.request('/api/admin/promotions','POST',{...offer,kind:'fixed',value:5000});const r=(await a.request('/api/orders','POST',order(p.id),'customer')).order;assert.equal(r.total,0);assert.equal(r.discount,1800);await a.request('/api/admin/orders/'+r.id,'PUT',{status:'cancelled',version:1,payment:'pending'});assert.equal((await a.request('/api/admin/promotions')).promotions[0].used,1);assert.equal((await a.request('/api/products')).products[0].stock,20);}finally{a.DB.close();}});
test('popup settings persist, reject unsafe destinations, and hide unavailable linked offers',async()=>{const a=await setup();try{const defaults=(await a.request('/api/admin/promotions')).campaign;assert.equal((await a.request('/api/storefront/promotion','GET',null,null)).campaign.enabled,true);assert.equal((await a.request('/api/admin/campaign','PUT',{...defaults,destination:'https://evil.test'})).status,400);await a.request('/api/admin/promotions','POST',offer);assert.equal((await a.request('/api/admin/campaign','PUT',{...defaults,code:'WELCOME10'})).status,200);const publicData=(await a.request('/api/storefront/promotion','GET',null,null)).campaign;assert.equal(publicData.offer.value,10);assert.equal(publicData.offer.used,undefined);assert.equal((await a.request('/api/admin/campaign','PUT',defaults)).status,409);const p=(await a.request('/api/admin/promotions')).promotions[0];await a.request('/api/admin/promotions/'+p.id,'PUT',{...offer,active:false,version:1});assert.equal((await a.request('/api/storefront/promotion','GET',null,null)).campaign,null);}finally{a.DB.close();}});
test('discounted product revenue sums to the actual paid order total',()=>{const o={created_at:new Date().toISOString(),status:'confirmed',payment:'paid',subtotal:300,discount:31,total:269,items:[{id:'one',name:'One',price:100,quantity:1},{id:'two',name:'Two',price:100,quantity:2}]};const m=analytics([o],[]);assert.equal(m.revenue,269);assert.equal(m.top.reduce((sum,p)=>sum+p.revenue,0),269);});

test('promotion reporting reconciles paid, unpaid, cancelled and refunded orders without inferring ad clicks',()=>{
 const now=Date.parse('2026-09-26T12:00:00Z'),make=(id,patch={})=>({id,promo_code:'WELCOME10',created_at:'2026-09-25T12:00:00Z',total:1620,discount:180,status:'confirmed',payment:'paid',...patch});
 const orders=[make('paid'),make('pending',{payment:'pending'}),make('cancelled',{status:'cancelled'}),make('refunded',{payment:'refunded'}),make('other',{promo_code:'LYVERNE200',total:1600,discount:200}),make('no-code',{promo_code:''}),make('old',{created_at:'2026-07-01T00:00:00Z'}),make('future',{created_at:'2027-01-01T00:00:00Z'})];
 const report=promotionAnalytics(orders,30,now);
 assert.deepEqual(report.byCode.WELCOME10,{orders:4,paidOrders:1,pendingOrders:1,cancelledOrders:1,refundedOrders:1,revenue:1620,discounts:360});
 assert.equal(report.summary.orders,5);assert.equal(report.summary.revenue,3220);assert.equal(report.summary.discounts,560);
 assert.equal(report.orders.filter(o=>o.promo_code==='WELCOME10').length,report.byCode.WELCOME10.orders);
 assert.equal(promotionAnalytics(orders,'all',now).summary.orders,6);
 assert.equal(promotionAnalytics([],30,now).summary.revenue,0);
 assert.equal(orders[0].id,'paid');
});
test('offer status reflects activation, schedule, expiry and lifetime limits at their boundaries',()=>{
 const now=Date.parse('2026-09-26T12:00:00Z'),p={active:1,starts:'',ends:'',usage_limit:10,used:0};
 assert.equal(promotionStatus(p,now),'running');
 assert.equal(promotionStatus({...p,active:0},now),'inactive');
 assert.equal(promotionStatus({...p,starts:new Date(now+1).toISOString()},now),'scheduled');
 assert.equal(promotionStatus({...p,starts:new Date(now).toISOString()},now),'running');
 assert.equal(promotionStatus({...p,ends:new Date(now).toISOString()},now),'expired');
 assert.equal(promotionStatus({...p,used:10},now),'exhausted');
 assert.equal(promotionStatus({...p,used:10,usage_limit:null},now),'running');
});
test('promo performance uses persisted order discounts after offer edits and payment/cancellation changes',async()=>{
 const a=await setup();try{
  const p=await create(a),saved=(await a.request('/api/orders','POST',order(p.id),'customer')).order;
  const promo=(await a.request('/api/admin/promotions')).promotions[0];
  await a.request('/api/admin/promotions/'+promo.id,'PUT',{...offer,value:25,version:promo.version});
  await a.request('/api/admin/orders/'+saved.id,'PUT',{status:'confirmed',payment:'paid',version:1});
  let records=(await a.request('/api/admin/overview')).orders,report=promotionAnalytics(records);
  assert.equal(report.byCode.WELCOME10.orders,1);assert.equal(report.byCode.WELCOME10.revenue,1620);assert.equal(report.byCode.WELCOME10.discounts,180);
  await a.request('/api/admin/orders/'+saved.id,'PUT',{status:'cancelled',payment:'refunded',version:2});
  records=(await a.request('/api/admin/overview')).orders;report=promotionAnalytics(records);
  assert.equal(report.byCode.WELCOME10.orders,1);assert.equal(report.byCode.WELCOME10.revenue,0);assert.equal(report.byCode.WELCOME10.discounts,0);
  assert.equal((await a.request('/api/admin/promotions')).promotions[0].used,1);
 }finally{a.DB.close();}
});
