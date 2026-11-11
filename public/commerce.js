export const statuses=['confirmed','packing','shipped','out-for-delivery','delivered'];
export const statusLabels={'confirmed':'Confirmed','packing':'Being packed','shipped':'On the way','out-for-delivery':'Out for delivery','delivered':'Delivered','cancelled':'Cancelled'};
export class Problem extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function str(value,max=160){return typeof value==='string'?value.trim().slice(0,max):'';}
export const MAX_PRODUCT_IMAGES=12;
const imagePath=/^\/(assets\/[a-z0-9-]+\.(png|webp)|media\/[a-z0-9-]+\.(png|jpeg|webp))$/i;
export function productImages(product){
 const images=typeof product.images==='string'?JSON.parse(product.images||'[]'):product.images;
 if(Array.isArray(images)&&images.length)return images.map(image=>({url:image.url,label:image.label}));
 return [{url:product.image,label:'Front'},...(product.back&&product.back!==product.image?[{url:product.back,label:'Back'}]:[]),...(product.detail?[{url:product.detail,label:'Detail'}]:[])].filter(image=>image.url);
}
function galleryInput(body,existing){
 let images=body.images;
 if(images===undefined){
  images=productImages(existing||body);
  // Keep legacy image/back clients compatible without dropping extra photos.
  if(existing&&body.image&&body.image!==existing.image){if(images.length)images[0]={...images[0],url:body.image};else images.push({url:body.image,label:'Front'});}
  if(existing&&body.back!==undefined&&body.back!==existing.back){images=images.filter(image=>image.label.toLowerCase()!=='back');if(body.back)images.push({url:body.back,label:'Back'});}
 }
 if(!Array.isArray(images)||!images.length||images.length>MAX_PRODUCT_IMAGES)throw new Problem(`Add between 1 and ${MAX_PRODUCT_IMAGES} product images.`);
 const seen=new Set();
 return images.map(image=>{
  if(!image||typeof image.url!=='string'||image.url.length>200||!imagePath.test(image.url))throw new Problem('Choose or upload a valid product image.');
  const label=typeof image.label==='string'?image.label.trim():'';
  if(!label||label.length>40)throw new Problem('Give each image a name of 1–40 characters, such as Front, Back or Detail.');
  if(seen.has(image.url))throw new Problem('The same image is already in this product.');
  seen.add(image.url);return {url:image.url,label};
 });
}
// Regular price stays editable; every purchase surface uses the same final price.
export function productPricing(product){
 const regular=typeof product.price==='number'&&Number.isInteger(product.price)&&product.price>0?product.price:null;
 const type=product.discount_type||'none',value=Number(product.discount_value||0);
 if(regular===null)return {regular:null,price:null,savings:0,percent:0,discounted:false,type:'none'};
 let savings=type==='percent'?Math.floor(regular*value/100):type==='fixed'?value:0;
 if(!Number.isInteger(savings)||savings<0||savings>=regular)savings=0;
 return {regular,price:regular-savings,savings,percent:type==='percent'?value:Math.floor(savings*1000/regular)/10,discounted:savings>0,type};
}
export function priceMarkup(product,{compact=false}={}){
 const pricing=productPricing(product),money=value=>'৳'+value.toLocaleString('en-BD');
 if(pricing.price===null)return '<span class="product-price price-tba">PRICE TBA</span>';
 const saving=pricing.type==='percent'?pricing.percent+'% off':money(pricing.savings)+' off';
 return `<span class="product-price"><strong class="current-price">${money(pricing.price)}</strong>${pricing.discounted?`<del class="regular-price" aria-label="Regular price ${money(pricing.regular)}">${money(pricing.regular)}</del><span class="price-discount">${saving}</span>${compact?'':`<span class="price-savings">You save ${money(pricing.savings)}</span>`}`:''}</span>`;
}
export function productInput(b,existing){
 const name=str(b.name,100),color=str(b.color,60),description=str(b.description,2000),category=str(b.category,60)||'ESSENTIALS';
 const price=b.price===''||b.price===null?null:Number(b.price),stock=Number(b.stock),sizes=Array.isArray(b.sizes)?[...new Set(b.sizes.filter(s=>['S','M','L','XL','XXL'].includes(s)))]:[];
 const images=galleryInput(b,existing),image=images[0].url,back=images.find(image=>image.label.toLowerCase()==='back')?.url||'',status=['draft','active','archived'].includes(b.status)?b.status:'draft';
 const discount_type=b.discount_type===undefined?(existing?.discount_type||'none'):b.discount_type;
 const discount_value=discount_type==='none'?0:Number(b.discount_value===undefined?(existing?.discount_value||0):b.discount_value);
 if(!['none','percent','fixed'].includes(discount_type))throw new Problem('Choose no discount, percentage or a fixed amount.');
 if(discount_type!=='none'&&(price===null||!Number.isInteger(discount_value)||discount_value<1||(discount_type==='percent'?discount_value>99:discount_value>=price)))throw new Problem('Set a regular price and a valid discount: 1–99% or a whole-number amount below the regular price.');
 if(discount_type!=='none'&&productPricing({price,discount_type,discount_value}).savings<1)throw new Problem('The discount must save at least ৳1.');
 const seoTitle=str(b.seo_title,70),seoDescription=str(b.seo_description,160);
 // 0 keeps the piece off the homepage; 1-12 is its position in that grid.
 const homeSlot=b.home_slot===''||b.home_slot===null||b.home_slot===undefined?0:Number(b.home_slot);
 if(!name||!color||!description||!sizes.length)throw new Problem('Add a name, color, description and at least one size.');
 if(price!==null&&(!Number.isInteger(price)||price<1||price>1000000))throw new Problem('Enter a whole-number price between ৳1 and ৳1,000,000.');
 if(!Number.isInteger(stock)||stock<0||stock>100000)throw new Problem('Stock must be a whole number from 0 to 100,000.');
 if(!/^\/(assets\/[a-z0-9-]+\.(png|webp)|media\/[a-z0-9-]+\.(png|jpeg|webp))$/i.test(image))throw new Problem('Choose or upload a product image.');
 if(back&&!/^\/(assets\/[a-z0-9-]+\.(png|webp)|media\/[a-z0-9-]+\.(png|jpeg|webp))$/i.test(back))throw new Problem('Choose a valid back image.');
 if(status==='active'&&price===null)throw new Problem('Set a price before publishing a product.');
 if(!Number.isInteger(homeSlot)||homeSlot<0||homeSlot>12)throw new Problem('Homepage position must be a whole number from 0 to 12.');
 // Only a published piece may sit on the homepage: a draft would render a card
 // linking to a product page that refuses to load.
 if(homeSlot>0&&status!=='active')throw new Problem('Publish the piece before putting it on the homepage.');
 return {name,color,description,category,price,discount_type,discount_value,stock,sizes,image,back,images,status,seo_title:seoTitle,seo_description:seoDescription,home_slot:homeSlot};
}
// URL-safe slug for the per-product pages. Accents are folded rather than
// dropped so "Café" becomes "cafe", not "caf".
export function slugify(value,max=70){
 return str(value,200).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,max).replace(/-+$/,'');
}
// A product's slug is its name and color, which reads well in a URL and stays
// descriptive for search: /collection/signature-onyx-tee-onyx/
export function productSlug(p){return slugify(`${p.name} ${p.color}`)||'piece';}
// Idempotent: decoding an already-decoded record returns it unchanged. Rows
// travel through several helpers and decoding twice must not throw, because a
// JSON.parse of an already-parsed array would.
const decodeJson=value=>typeof value==='string'?JSON.parse(value||'[]'):(Array.isArray(value)?value:[]);
export function decodeProduct(p){return {...p,sizes:decodeJson(p.sizes),images:productImages(p)};}
export function decodeOrder(o){return {...o,items:decodeJson(o.items)};}
export function analytics(orders,products,days=30,now=Date.now()){
 const filtered=orders.filter(o=>new Date(o.created_at).getTime()>=now-days*86400000);
 const paid=filtered.filter(o=>o.payment==='paid'&&o.status!=='cancelled');
 const revenue=paid.reduce((s,o)=>s+o.total,0),open=orders.filter(o=>!['delivered','cancelled'].includes(o.status));
 const sales={};for(const o of paid){const subtotal=o.items.reduce((s,i)=>s+i.price*i.quantity,0);let allocated=0;for(const [index,item] of o.items.entries()){const a=sales[item.id]||{name:item.name,quantity:0,revenue:0};const net=index===o.items.length-1?o.total-allocated:Math.floor(subtotal?item.price*item.quantity/subtotal*o.total:0);allocated+=net;a.quantity+=item.quantity;a.revenue+=net;sales[item.id]=a;}}
 const weeks=Array.from({length:7},(_,i)=>{const t=new Date(now-(6-i)*86400000);const key=t.toISOString().slice(0,10);return {date:key,label:t.toLocaleDateString('en',{weekday:'short',timeZone:'UTC'}),value:paid.filter(o=>o.created_at.startsWith(key)).reduce((s,o)=>s+o.total,0)};});
 return {revenue,count:filtered.length,average:paid.length?Math.round(revenue/paid.length):0,open:open.length,paid:paid.length,lowStock:products.filter(p=>p.status==='active'&&p.stock<6),top:Object.values(sales).sort((a,b)=>b.quantity-a.quantity),weeks,days};
}
export function insights(m){
 return [{title:m.lowStock.length?`${m.lowStock.length} product${m.lowStock.length===1?'':'s'} need a stock check`:'Stock is within the threshold',body:m.lowStock.length?m.lowStock.map(p=>`${p.name} / ${p.color}: ${p.stock} left`).join('. '):'No active products currently have fewer than six units.'},{title:`${m.open} orders in progress`,body:m.open?'Review the oldest open orders before taking on the next dispatch.':'No open orders are waiting for fulfillment.'},{title:m.top[0]?`${m.top[0].name} leads paid sales`:'A little more data will help',body:m.top[0]?`${m.top[0].quantity} units sold in the selected period. Compare that demand with available stock before reordering.`:'Paid orders will unlock product rankings and an average order value. No forecast is shown without sales history.'}];
}
export function allowedStatus(from,to){
 if(to===from)return true;
 // Delivered and cancelled are final: reopening them would contradict what the
 // customer has already been told.
 if(from==='delivered'||from==='cancelled')return false;
 return to==='cancelled'||statuses.includes(to);
}

export function promotionStatus(p,now=Date.now()){
 if(!p.active)return 'inactive';
 if(p.ends&&Date.parse(p.ends)<=now)return 'expired';
 if(p.usage_limit!=null&&p.used>=p.usage_limit)return 'exhausted';
 if(p.starts&&Date.parse(p.starts)>now)return 'scheduled';
 return 'running';
}
export function promotionAnalytics(orders,days=30,now=Date.now()){
 const since=days==='all'?-Infinity:now-Number(days)*86400000;
 const rows=orders.filter(o=>o.promo_code&&Date.parse(o.created_at)>=since&&Date.parse(o.created_at)<=now);
 const blank=()=>({orders:0,paidOrders:0,pendingOrders:0,cancelledOrders:0,refundedOrders:0,revenue:0,discounts:0});
 const summary=blank(),byCode=Object.create(null);
 for(const o of rows){
  const metrics=byCode[o.promo_code]||(byCode[o.promo_code]=blank());
  for(const m of [summary,metrics]){
   m.orders++;
   if(o.status==='cancelled')m.cancelledOrders++;
   if(o.payment==='refunded')m.refundedOrders++;
   if(o.status==='cancelled'||o.payment==='refunded')continue;
   m.discounts+=o.discount||0;
   if(o.payment==='paid'){m.paidOrders++;m.revenue+=o.total;}
   else if(o.payment==='pending')m.pendingOrders++;
  }
 }
 return {summary,byCode,orders:rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)),days,generatedAt:now};
}
