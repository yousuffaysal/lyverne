import {couponInput,campaignInput,readCampaign,publicCampaign,quoteOrder} from './promotions.mjs';
import {products as originalProducts} from './catalog.js';
import {Problem,str,productInput,productSlug,decodeProduct,decodeOrder,analytics,insights,allowedStatus,statusLabels} from './domain.mjs';
import {verifyRequest,isChief,isStaff} from './auth.mjs';
import {siteOrigin,robots,sitemap,metaTags,jsonLd,collectionSchema,organisation,website,esc} from './seo.mjs';
import {productPage,productNotFound,catalogGrid,GRID_START,GRID_END} from './render.mjs';
import {createStorage} from './storage.mjs';
import {createDatabase} from './db.mjs';
import {webAssets} from './web-assets.js';
import {analyst,productCopy,shopper,shopperCatalogue,stylist,aiConfigured} from './ai.mjs';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',...headers}});
// Defence in depth for the server-rendered pages. Escaping is the control that
// prevents XSS; these headers are what stop a future slip in it from becoming
// exploitable, and frame-ancestors blocks clickjacking of the account pages.
const SECURITY_HEADERS={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'geolocation=(), microphone=(), camera=(), interest-cohort=()'};
const html2=(markup,status=200,headers={})=>new Response(markup,{status,headers:{'Content-Type':'text/html; charset=utf-8',...SECURITY_HEADERS,...headers}});
const customerOrder=o=>{const {note,request_key,...safe}=decodeOrder(o);return safe;};
const id=()=>crypto.randomUUID();const now=()=>new Date().toISOString();
const row=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
// Object storage: an injected binding (R2, or the local preview stub) wins;
// otherwise fall back to Supabase Storage. Cached so each request does not
// rebuild the client.
// Database: an injected binding wins (tests and the local preview supply one);
// otherwise open a connection from DATABASE_URL.
//
// It must be per request, never cached across them. Workers ties every I/O
// object to the request that created it: reusing a pooled socket on a later
// request throws "Cannot perform I/O on behalf of a different request", which
// shows up as roughly half of all requests failing once an isolate is warm.
// The connection is closed in the fetch handler's finally block.
function dbOf(env){
 if(env.DB)return env.DB;
 return env.DATABASE_URL?createDatabase(env.DATABASE_URL):null;
}
const buckets=new Map();
function bucketOf(env){
 if(env.BUCKET)return env.BUCKET;
 const key=env.SUPABASE_URL||'';
 if(!buckets.has(key))buckets.set(key,createStorage(env));
 return buckets.get(key);
}
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
function activity(db,user,action,target){return db.prepare('INSERT INTO activity(id,actor,action,target,created_at) VALUES(?,?,?,?,?)').bind(id(),user.id,action,target,now());}
// Slugs are public URLs, so they must be unique and, once issued, permanent:
// renaming a product must not break its indexed page or inbound links.
async function uniqueSlug(db,base){
 if(!await row(db,'SELECT id FROM products WHERE slug=?',base))return base;
 for(let n=2;n<=50;n++){const candidate=`${base}-${n}`;if(!await row(db,'SELECT id FROM products WHERE slug=?',candidate))return candidate;}
 return `${base}-${id().slice(0,8)}`;
}
async function body(req){if(Number(req.headers.get('content-length'))>30000)throw new Problem('This request is too large.',413);const text=await req.text();if(text.length>30000)throw new Problem('This request is too large.',413);try{return JSON.parse(text);}catch{throw new Problem('Send a valid form.');}}
function sameOrigin(req){const origin=req.headers.get('origin');if(origin!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')throw new Problem('Refresh this page and try again.',403);}
// Identity comes from a Supabase JWT verified against the project's public key.
// The previous implementation trusted oai-authenticated-user-* headers, which
// only the OpenAI Sites dispatcher could set; off that platform any client can
// send them, so reading identity from headers would let anyone become any user.
async function identity(req,env){
 const claims=await verifyRequest(req,env);
 if(!claims)return null;
 // ADMIN_EMAIL is the root of trust for ownership and is mirrored onto the row
 // on every sign-in, so changing the env var promotes or demotes on next login
 // and the column can never drift away from it.
 const chiefEmail=!!env.ADMIN_EMAIL&&claims.email===env.ADMIN_EMAIL.trim().toLowerCase();
 // Read first and write only when something actually differs. The previous
 // version upserted on every authenticated request, including plain reads,
 // which turned each page view into a database write.
 let record=await row(env.DB,'SELECT * FROM customers WHERE id=?',claims.id);
 // An appointed admin must keep their role across sign-ins. Deriving the role
 // purely from ADMIN_EMAIL would silently demote every admin the chief added.
 const role=chiefEmail?'chief':(record&&record.role==='admin'?'admin':'customer');
 if(!record||record.email!==claims.email||record.role!==role){
  await env.DB.prepare('INSERT INTO customers(id,email,name,role,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,role=excluded.role').bind(claims.id,claims.email,str(claims.name,100),role,now()).run();
  record=await row(env.DB,'SELECT * FROM customers WHERE id=?',claims.id);
 }
 // A blocked account is refused everywhere, including the storefront, rather
 // than being quietly treated as a signed-out visitor.
 if(record.blocked)throw new Problem('This account has been blocked. Contact Lyverne if you think that is wrong.',403);
 const chief=isChief(claims,record.role,env.ADMIN_EMAIL);
 return {...record,chief,admin:chief||isStaff(record.role)};
}
async function createOrder(db,user,b){
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>20)throw new Problem('Choose at least one product.');
 if(!/^[a-z0-9-]{20,80}$/i.test(b.requestKey||''))throw new Problem('Refresh the order form and try again.');
 const existing=await row(db,'SELECT * FROM orders WHERE customer_id=? AND request_key=?',user.id,b.requestKey);if(existing)return decodeOrder(existing);
 const address=str(b.address,1000),phone=str(b.phone,40);if(address.length<10||phone.length<6)throw new Problem('Add a delivery address and phone number.');
 const quote=await quoteOrder(db,b.items,b.promoCode);
 const {items,quantities,subtotal,discount,total,promo_code,coupon}=quote,oid='LY-'+id().slice(0,8).toUpperCase(),date=now();
 // Every guard lives in the WHERE clause of the statement that performs the
 // write, and is verified by that statement's own row count. Reserving stock
 // before inserting the order means the row lock -- not a snapshot read -- is
 // what decides who gets the last unit, and throwing inside the transaction
 // rolls the whole attempt back. See server/db.mjs transaction() for why.
 const conflict=()=>new Problem('Stock or the offer changed while you were ordering. Please review your bag and code.',409);
 await db.transaction(async tx=>{
  for(const [pid,qty] of quantities){
   const version=items.find(i=>i.id===pid).version;
   const reserved=await tx.run("UPDATE products SET stock=stock-?,version=version+1,updated_at=? WHERE id=? AND version=? AND stock>=? AND status='active'",qty,date,pid,version,qty);
   if(!reserved.meta.changes)throw conflict();
  }
  if(coupon){
   const claimed=await tx.run("UPDATE promotions SET used=used+1 WHERE id=? AND version=? AND active=1 AND (usage_limit IS NULL OR used<usage_limit) AND (starts='' OR starts<=?) AND (ends='' OR ends>?)",coupon.id,coupon.version,date,date);
   if(!claimed.meta.changes)throw conflict();
  }
  await tx.run('INSERT INTO orders(id,customer_id,items,subtotal,discount,promo_code,total,status,payment,address,phone,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',oid,user.id,JSON.stringify(items),subtotal,discount,promo_code,total,'confirmed','pending',address,phone,b.requestKey,date,date);
  await tx.run('INSERT INTO order_events(id,order_id,status,message,created_at) VALUES(?,?,?,?,?)',id(),oid,'confirmed','Order request received. Payment and delivery will be confirmed by Lyverne.',date);
 });
 return decodeOrder(await row(db,'SELECT * FROM orders WHERE id=?',oid));
}
async function api(req,env){
 const url=new URL(req.url),path=url.pathname,method=req.method;
 if(!['GET','HEAD'].includes(method))sameOrigin(req);
 // The publishable key is public by design: it identifies the project to the
 // browser SDK and grants nothing on its own, because RLS denies it everything
 // but active products. Serving it here avoids baking it into the build.
 if(path==='/api/config')return json({auth:'supabase',supabaseUrl:env.SUPABASE_URL||'',supabaseKey:env.SUPABASE_PUBLISHABLE_KEY||'',ai:!!env.AI_API_KEY,uploads:!!bucketOf(env)});
 if(!env.DB)throw new Problem('The store database is temporarily unavailable. Please try again shortly.',503);
 if(path==='/api/products'&&method==='GET')return json({products:(await all(env.DB,"SELECT * FROM products WHERE status='active' ORDER BY created_at DESC")).map(decodeProduct),managedIds:(await all(env.DB,'SELECT id FROM products')).map(p=>p.id)});
 if(path==='/api/storefront/promotion'&&method==='GET')return json({campaign:await publicCampaign(env.DB)});
 if(path==='/api/stylist'&&method==='POST'){
  // Public and deliberately unconnected to the catalogue: this answers "what
  // should I wear", not "what should I buy". It reads no store data at all.
  if(!aiConfigured(env))throw new Problem('The stylist is not available right now.',503);
  return json({look:await stylist(env,{question:(await body(req)).question})});
 }
 if(path==='/api/assistant'&&method==='POST'){
  // Public, so it is rate-limited by request size and given only the public
  // catalogue. See shopperCatalogue in server/ai.mjs for the exact whitelist.
  if(!aiConfigured(env))throw new Problem('The shop assistant is not available right now.',503);
  const b=await body(req);
  const products=shopperCatalogue((await all(env.DB,"SELECT * FROM products WHERE status='active'")).map(decodeProduct));
  return json({answer:await shopper(env,{question:b.question,products})});
 }
 const user=await identity(req,env);
 if(path==='/api/me'&&method==='GET')return json({user});
 if(!user)throw new Problem('Please sign in to continue.',401);
 if(path==='/api/me'&&method==='PUT'){
  const b=await body(req),name=str(b.name,100);if(!name)throw new Problem('Enter your name.');
  await env.DB.prepare('UPDATE customers SET name=?,phone=?,address=?,city=?,postcode=? WHERE id=?').bind(name,str(b.phone,40),str(b.address,700),str(b.city,100),str(b.postcode,20),user.id).run();return json({user:{...await row(env.DB,'SELECT * FROM customers WHERE id=?',user.id),admin:user.admin}});
 }
 if(path==='/api/wishlist'&&method==='PUT'){
  const b=await body(req);if(!Array.isArray(b.items)||b.items.length>30)throw new Problem('Save up to 30 pieces.');const items=[...new Set(b.items.filter(x=>typeof x==='string'&&/^[a-z0-9-]{1,60}$/i.test(x)))];await env.DB.prepare('UPDATE customers SET wishlist=? WHERE id=?').bind(JSON.stringify(items),user.id).run();return json({items});
 }
 if(path==='/api/checkout/quote'&&method==='POST'){const b=await body(req),q=await quoteOrder(env.DB,b.items,b.promoCode);const {coupon,quantities,...quote}=q;return json({quote});}
 if(path==='/api/orders'&&method==='GET')return json({orders:(await all(env.DB,'SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC',user.id)).map(customerOrder)});
 // Filter here rather than inside createOrder: that function has two exit
 // paths (fresh insert and idempotent replay) and the replay one returned the
 // raw row, handing the customer the owner's internal note on the order.
 if(path==='/api/orders'&&method==='POST')return json({order:customerOrder(await createOrder(env.DB,user,await body(req)))},201);
 if(/^\/api\/orders\/[^/]+$/.test(path)&&method==='GET'){
  const order=await row(env.DB,'SELECT * FROM orders WHERE id=? AND customer_id=?',path.split('/').pop(),user.id);if(!order)throw new Problem('Order not found.',404);return json({order:customerOrder(order),events:await all(env.DB,'SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC',order.id)});
 }
 if(path.startsWith('/api/admin/')&&!user.admin)throw new Problem('This area is for the Lyverne owner.',403);
 if(path==='/api/admin/promotions'&&method==='GET')return json({promotions:await all(env.DB,'SELECT * FROM promotions ORDER BY created_at DESC'),campaign:await readCampaign(env.DB)});
 if(path==='/api/admin/promotions'&&method==='POST'){
  const p=couponInput(await body(req));if(await row(env.DB,'SELECT id FROM promotions WHERE code=?',p.code))throw new Problem('That code already exists. Edit it instead.',409);
  const pid=id(),date=now();await env.DB.batch([env.DB.prepare('INSERT INTO promotions(id,code,kind,value,minimum,usage_limit,starts,ends,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(pid,p.code,p.kind,p.value,p.minimum,p.limit,p.starts,p.ends,Number(p.active),date,date),activity(env.DB,user,'Created promo code',p.code)]);return json({ok:true},201);
 }
 if(/^\/api\/admin\/promotions\/[^/]+$/.test(path)&&method==='PUT'){
  const pid=path.split('/').pop(),b=await body(req),p=couponInput(b),current=await row(env.DB,'SELECT * FROM promotions WHERE id=?',pid);if(!current)throw new Problem('Promo code not found.',404);
  if(Number(b.version)!==current.version)throw new Problem('This offer changed. Refresh before editing.',409);
  if(p.code!==current.code)throw new Problem('A saved code cannot be renamed. Create another code instead.');
  if(p.limit!==null&&p.limit<current.used)throw new Problem('The limit cannot be less than the number already used.');
  const saved=await env.DB.prepare('UPDATE promotions SET kind=?,value=?,minimum=?,usage_limit=?,starts=?,ends=?,active=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(p.kind,p.value,p.minimum,p.limit,p.starts,p.ends,Number(p.active),now(),pid,current.version).run();if(!saved.meta.changes)throw new Problem('This offer changed. Refresh first.',409);
  await activity(env.DB,user,'Updated promo code',p.code).run();return json({ok:true});
 }
 if(path==='/api/admin/campaign'&&method==='PUT'){
  const b=await body(req),p=campaignInput(b);if(p.code&&!await row(env.DB,'SELECT id FROM promotions WHERE code=?',p.code))throw new Problem('Create the promo code before linking it to the popup.');
  const expected=Number(b.version);if(!Number.isInteger(expected)||expected<0)throw new Problem('Refresh the promotion settings.');
  const saved=expected===0?await env.DB.prepare("INSERT INTO shop_settings(id,value,version,updated_at) VALUES('opening-promotion',?,1,?) ON CONFLICT(id) DO NOTHING").bind(JSON.stringify(p),now()).run():await env.DB.prepare("UPDATE shop_settings SET value=?,version=version+1,updated_at=? WHERE id='opening-promotion' AND version=?").bind(JSON.stringify(p),now(),expected).run();
  if(!saved.meta.changes)throw new Problem('The popup changed. Refresh before saving.',409);await activity(env.DB,user,'Updated opening promotion',p.title).run();return json({ok:true});
 }
 if(path==='/api/admin/overview'&&method==='GET'){
  const products=(await all(env.DB,'SELECT * FROM products ORDER BY created_at DESC')).map(decodeProduct),orders=(await all(env.DB,'SELECT o.*,c.name AS customer_name,c.email AS customer_email FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC')).map(decodeOrder);
  return json({products,orders,customers:await all(env.DB,'SELECT id,email,name,phone,city,created_at FROM customers ORDER BY created_at DESC'),activity:await all(env.DB,'SELECT a.*,c.name AS actor_name FROM activity a LEFT JOIN customers c ON c.id=a.actor ORDER BY a.created_at DESC LIMIT 100'),connections:{ai:!!env.AI_API_KEY,uploads:!!bucketOf(env),courier:false}});
 }
 if(path==='/api/admin/import'&&method==='POST'){
  const date=now(),statements=[];
  for(const p of originalProducts){
   const slug=await uniqueSlug(env.DB,productSlug(p));
   statements.push(env.DB.prepare("INSERT INTO products(id,slug,name,color,description,category,price,stock,sizes,image,back,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?,?,'draft',?,?) ON CONFLICT(id) DO NOTHING").bind(p.id,slug,p.name,p.color,p.description,p.category||'SIGNATURE',p.price,JSON.stringify(p.sizes||['S','M','L','XL','XXL']),p.image,p.back||'',date,date));
  }
  statements.push(activity(env.DB,user,'Imported original collection as drafts','collection'));
  await env.DB.batch(statements);return json({ok:true});
 }
 if(path==='/api/admin/products'&&method==='POST'){
  const p=productInput(await body(req)),pid='product-'+id(),date=now(),slug=await uniqueSlug(env.DB,productSlug(p));await env.DB.batch([env.DB.prepare('INSERT INTO products(id,slug,name,color,description,category,price,stock,sizes,image,back,status,seo_title,seo_description,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(pid,slug,p.name,p.color,p.description,p.category,p.price,p.stock,JSON.stringify(p.sizes),p.image,p.back,p.status,p.seo_title,p.seo_description,date,date),activity(env.DB,user,'Created product',p.name)]);return json({product:decodeProduct(await row(env.DB,'SELECT * FROM products WHERE id=?',pid))},201);
 }
 if(/^\/api\/admin\/products\/[^/]+$/.test(path)&&['PUT','DELETE'].includes(method)){
  const pid=path.split('/').pop(),current=await row(env.DB,'SELECT * FROM products WHERE id=?',pid);if(!current)throw new Problem('Product not found.',404);
  const b=await body(req);if(Number(b.version)!==current.version)throw new Problem('This product changed. Refresh before editing.',409);
  if(method==='DELETE'){
   const result=await env.DB.prepare("UPDATE products SET status='archived',version=version+1,updated_at=? WHERE id=? AND version=?").bind(now(),pid,current.version).run();if(!result.meta.changes)throw new Problem('This product changed. Refresh first.',409);await activity(env.DB,user,'Archived product',current.name).run();return json({ok:true});
  }
  const p=productInput(b);const result=await env.DB.prepare('UPDATE products SET name=?,color=?,description=?,category=?,price=?,stock=?,sizes=?,image=?,back=?,status=?,seo_title=?,seo_description=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(p.name,p.color,p.description,p.category,p.price,p.stock,JSON.stringify(p.sizes),p.image,p.back,p.status,p.seo_title,p.seo_description,now(),pid,current.version).run();if(!result.meta.changes)throw new Problem('This product changed. Refresh first.',409);await activity(env.DB,user,'Updated product',p.name).run();return json({ok:true});
 }
 if(/^\/api\/admin\/orders\/[^/]+$/.test(path)&&method==='GET'){
  const order=await row(env.DB,'SELECT * FROM orders WHERE id=?',path.split('/').pop());if(!order)throw new Problem('Order not found.',404);return json({order:decodeOrder(order),events:await all(env.DB,'SELECT * FROM order_events WHERE order_id=? ORDER BY created_at DESC',order.id)});
 }
 if(/^\/api\/admin\/orders\/[^/]+$/.test(path)&&method==='PUT'){
  const oid=path.split('/').pop(),b=await body(req),current=await row(env.DB,'SELECT * FROM orders WHERE id=?',oid);if(!current)throw new Problem('Order not found.',404);if(Number(b.version)!==current.version)throw new Problem('This order changed. Reopen it before saving.',409);if(!allowedStatus(current.status,b.status))throw new Problem('Move an order one step forward, or cancel an unfinished order.');if(!['pending','paid','refunded'].includes(b.payment))throw new Problem('Choose a payment record.');
  const date=str(b.delivery_date,10);if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Problem('Choose a valid delivery date.');
  // Dispatch details fill themselves in once an order ships, so the owner is
  // not typing a tracking number and a date on every order. Anything already
  // set -- by the owner now, or on a previous save -- always wins.
  const dispatched=['shipped','out-for-delivery','delivered'].includes(b.status);
  const carrier=str(b.carrier,80)||current.carrier;
  let tracking=str(b.tracking_number,100)||current.tracking_number;
  let delivery=date||current.delivery_date;
  if(dispatched){
   if(!tracking)tracking='LY-'+id().replace(/-/g,'').slice(0,10).toUpperCase();
   // Three days is the usual door-to-door window inside Bangladesh; the owner
   // can overwrite it, and doing so sticks.
   if(!delivery)delivery=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
  }
  const message=str(b.message,500)||`${statusLabels[b.status]}. ${b.status===current.status?'Delivery details updated.':''}`;const statements=[];
  if(b.status==='cancelled'&&current.status!=='cancelled')for(const item of JSON.parse(current.items))statements.push(env.DB.prepare("UPDATE products SET stock=stock+?,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND version=? AND status!='cancelled')").bind(item.quantity,item.id,oid,current.version));
  statements.push(env.DB.prepare('INSERT INTO order_events(id,order_id,status,message,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?)').bind(id(),oid,b.status,message,now(),oid,current.version));
  statements.push(env.DB.prepare('UPDATE orders SET status=?,payment=?,carrier=?,tracking_number=?,delivery_date=?,note=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(b.status,b.payment,carrier,tracking,delivery,str(b.note,500),now(),oid,current.version));
  const result=await env.DB.batch(statements);if(!result.at(-1).meta.changes)throw new Problem('The order changed. Refresh and try again.',409);await activity(env.DB,user,'Updated order',oid+' / '+statusLabels[b.status]).run();return json({ok:true});
 }
 if(path==='/api/admin/upload'&&method==='POST'){
  const bucket=bucketOf(env);if(!bucket)throw new Problem('Image uploads are not connected.',503);if(Number(req.headers.get('content-length'))>5*1024*1024)throw new Problem('Choose an image under 5 MB.',413);const type=req.headers.get('content-type'),extension={'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'}[type];if(!extension)throw new Problem('Choose a PNG, JPEG or WebP image.');const buffer=await req.arrayBuffer();if(buffer.byteLength>5*1024*1024)throw new Problem('Choose an image under 5 MB.',413);const bytes=new Uint8Array(buffer),ascii=(from,to)=>new TextDecoder().decode(bytes.slice(from,to)),PNG=[137,80,78,71,13,10,26,10],valid=extension==='png'?PNG.every((b,i)=>bytes[i]===b):extension==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';if(!valid)throw new Problem('That file does not match its image type.');const key=id()+'.'+extension;await bucket.put(key,buffer,{httpMetadata:{contentType:type}});await activity(env.DB,user,'Uploaded product image',key).run();return json({url:'/media/'+key},201);
 }
 if(path==='/api/admin/assistant'&&method==='POST'){
  const b=await body(req),prompt=str(b.prompt,1500);if(!prompt)throw new Problem('Ask a question about your store.');
  const orders=(await all(env.DB,'SELECT * FROM orders')).map(decodeOrder),products=(await all(env.DB,'SELECT * FROM products')).map(decodeProduct),metrics=analytics(orders,products);const notes=insights(metrics);
  if(!aiConfigured(env))return json({mode:'insights',answer:notes.map(n=>n.title+'\n'+n.body).join('\n\n'),message:'Store-data insights. Live AI is not connected.'});
  try{return json({mode:'ai',answer:await analyst(env,{question:prompt,metrics})});}
  // The deterministic insights are always correct and always available, so an
  // AI outage degrades the feature rather than removing it.
  catch{return json({mode:'insights',answer:notes.map(n=>n.title+'\n'+n.body).join('\n\n'),message:'Live AI is unavailable right now; these are your store-data insights.'});}
 }
 if(path==='/api/admin/product-copy'&&method==='POST'){
  const b=await body(req);if(!aiConfigured(env))throw new Problem('The AI service is not connected.',503);
  const name=str(b.name,100),color=str(b.color,60);if(!name||!color)throw new Problem('Add a product name and colour first.');
  return json({copy:await productCopy(env,{name,color,category:str(b.category,60),notes:str(b.notes,600)})});
 }
 throw new Problem('This page could not be found.',404);
}
// Serves /collection/ from the built shell, with the product grid and the
// structured data replaced from live rows. The shell keeps its hand-built
// design; only the grid between the markers and the head tags change, so a
// product added in the admin panel appears immediately without a rebuild.
async function renderCollection(req,env){
 const asset=await env.ASSETS.fetch(new Request(new URL('/collection/',req.url),req));
 if(!asset.ok)return asset;
 let html=await asset.text();
 const origin=siteOrigin(env);
 const products=(await all(env.DB,"SELECT * FROM products WHERE status='active' ORDER BY created_at DESC")).map(decodeProduct);
 const start=html.indexOf(GRID_START),end=html.indexOf(GRID_END);
 if(start!==-1&&end!==-1&&products.length)html=html.slice(0,start)+catalogGrid(products)+html.slice(end+GRID_END.length);
 // Replace the build-time canonical with the configured origin and add the
 // social and structured-data tags the static generator cannot know.
 // Strip every build-time tag we are about to replace. Leaving the static
 // description in place would win, because Google reads the first one, and the
 // static canonical points at whichever host the build ran on.
 const title='Shop All T-Shirts — Oversized Tees in Bangladesh | LYVERNE';
 html=html.replace(/<link rel="canonical"[^>]*>/g,'')
  .replace(/<meta name="description"[^>]*>/g,'')
  .replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`)
  .replace('</head>',metaTags({origin,path:'/collection/',title,
   description:'Shop the Lyverne collection: oversized drop-shoulder t-shirts and original graphic tees in premium cotton, from ৳1,800. Delivered across Bangladesh.',
   image:products[0]?.image||'/assets/tee-front.png'})
   +jsonLd(collectionSchema(origin,products))+jsonLd(organisation(origin))+jsonLd(website(origin))+'</head>');
 return html2(html,200,{'Cache-Control':'public, max-age=300, stale-while-revalidate=600'});
}
// Renders /collection/<slug>/ from the database at request time, so a product
// added in the admin panel is live and indexable immediately rather than at the
// next build. Only active products resolve: drafts and archived pieces return a
// real 404 so they can never be indexed.
async function renderProduct(slug,env){
 const record=await row(env.DB,"SELECT * FROM products WHERE slug=? AND status='active'",slug);
 const origin=siteOrigin(env);
 if(!record)return html2(productNotFound(origin),404,{'Cache-Control':'public, max-age=60'});
 const product=decodeProduct(record);
 const others=(await all(env.DB,"SELECT * FROM products WHERE status='active' AND id!=? ORDER BY created_at DESC LIMIT 4",product.id)).map(decodeProduct);
 return html2(productPage({product,origin,others}),200,{'Cache-Control':'public, max-age=300, stale-while-revalidate=600'});
}
export default {async fetch(req,originalEnv,ctx){
 // Give every handler an env whose DB is a real connection, built from
 // DATABASE_URL when the platform has not injected a binding.
 const opened=originalEnv.DB?null:dbOf(originalEnv);
 const env=opened?{...originalEnv,DB:opened}:originalEnv;
 try{
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/'))return await api(req,env);
  if(url.pathname==='/robots.txt')return new Response(robots(siteOrigin(env)),{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600',...SECURITY_HEADERS}});
  if(url.pathname==='/sitemap.xml'){
   // Sitemaps list only what a crawler may index: active, priced products.
   const products=env.DB?(await all(env.DB,"SELECT slug,image,name,color,updated_at FROM products WHERE status='active' ORDER BY created_at DESC")):[];
   return new Response(sitemap(siteOrigin(env),products),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=900',...SECURITY_HEADERS}});
  }
  if(url.pathname==='/collection/'&&env.DB&&env.ASSETS)return await renderCollection(req,env);
  const productPath=/^\/collection\/([a-z0-9][a-z0-9-]{0,79})\/$/.exec(url.pathname);
  if(productPath&&env.DB)return await renderProduct(productPath[1],env);
  // Trailing slash is the canonical form, so redirect rather than serving the
  // same product at two URLs and splitting its ranking between them.
  const unslashed=/^\/collection\/([a-z0-9][a-z0-9-]{0,79})$/.exec(url.pathname);
  if(unslashed&&env.DB&&await row(env.DB,'SELECT id FROM products WHERE slug=?',unslashed[1]))return Response.redirect(url.origin+url.pathname+'/'+url.search,301);
  if(url.pathname.startsWith('/media/')){const bucket=bucketOf(env);if(!bucket)return new Response('Not found',{status:404});const key=url.pathname.slice(7);if(!/^[a-z0-9-]+\.(png|jpeg|webp)$/.test(key))return new Response('Not found',{status:404});const object=await bucket.get(key);return object?new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}}):new Response('Not found',{status:404});}
  // ASSETS is the platform's static-file binding. Without it there is nothing
  // to serve, which is a 404, not a server fault.
  if(!env.ASSETS)return new Response('Not found',{status:404});
  const png=/^\/assets\/([a-z0-9-]+)\.png$/i.exec(url.pathname);
  if(png&&webAssets.has(png[1])){
   const webp=new URL(`/assets/${png[1]}.webp`,url);
   return env.ASSETS.fetch(new Request(webp,req));
  }
  return env.ASSETS.fetch(req);
 }catch(error){if(!(error instanceof Problem))console.error('Lyverne request failed',error.message,error.stack);return json({error:error instanceof Problem?error.message:'Something went wrong. Your changes have not been confirmed; please refresh and try again.'},error.status||500);}
 finally{
  // Every response here is a fully-built string or an ASSETS/Storage stream, so
  // nothing still needs the database once the handler returns.
  if(opened)ctx?.waitUntil?ctx.waitUntil(opened.close().catch(()=>{})):opened.close().catch(()=>{});
 }
}};
