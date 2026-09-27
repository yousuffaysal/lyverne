import {Problem,str} from './domain.mjs';
export const defaultCampaign={enabled:true,title:'YOUR NEXT EVERYDAY.',text:'Meet the first edition. Quiet signatures. Original graphics. A little more you.',button:'Explore the collection',destination:'/collection/',code:'',version:0};
export function couponInput(b){
 const code=str(b.code,24).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code))throw new Problem('Use 3–24 letters, numbers or hyphens for the code.');
 const kind=b.kind,value=Number(b.value),minimum=Number(b.minimum||0),limit=b.limit===null||b.limit===''?null:Number(b.limit);
 if(!['percent','fixed'].includes(kind))throw new Problem('Choose percentage or fixed amount.');
 if(!Number.isInteger(value)||value<1||value>(kind==='percent'?100:1000000))throw new Problem(kind==='percent'?'Enter a percentage from 1 to 100.':'Enter a whole-number discount up to ৳1,000,000.');
 if(!Number.isInteger(minimum)||minimum<0||minimum>1000000)throw new Problem('Enter a valid minimum order value.');
 if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>1000000))throw new Problem('Enter a usage limit, or leave it blank.');
 const parseDate=x=>{if(!x)return '';if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw new Problem('Choose valid offer dates.');return new Date(x).toISOString();};
 const starts=parseDate(b.starts),ends=parseDate(b.ends);
 if(starts&&ends&&starts>=ends)throw new Problem('The end date must be after the start date.');
 return {code,kind,value,minimum,limit,starts,ends,active:b.active===true||b.active==='on'};
}
export function couponUsable(p,subtotal,time=new Date().toISOString()){
 if(!p||!p.active||(p.starts&&p.starts>time)||(p.ends&&p.ends<=time))throw new Problem('This promo code is not available.');
 if(p.usage_limit!==null&&p.used>=p.usage_limit)throw new Problem('This promo code has reached its usage limit.');
 if(subtotal<p.minimum)throw new Problem(`This code needs a merchandise subtotal of at least ৳${p.minimum.toLocaleString('en-US')}.`);
 return Math.min(subtotal,p.kind==='percent'?Math.floor(subtotal*p.value/100):p.value);
}
export function campaignInput(b){
 const title=str(b.title,70),text=str(b.text,230),button=str(b.button,35),code=str(b.code,24).toUpperCase();
 if(!title||!text||!button)throw new Problem('Add a headline, message and button label.');
 if(!['/collection/','/studio/'].includes(b.destination))throw new Problem('Choose a collection or Style Studio destination.');
 if(code&&!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code))throw new Problem('Choose a valid promo code.');
 return {title,text,button,code,destination:b.destination,enabled:b.enabled===true||b.enabled==='on'};
}
export async function readCampaign(db){
 const row=await db.prepare("SELECT * FROM shop_settings WHERE id='opening-promotion'").first();
 if(!row)return defaultCampaign;
 // A settings row that fails to parse must not take the admin panel down with
 // it: the campaign is one popup, and falling back to the defaults keeps every
 // other owner control reachable so the bad value can be corrected.
 try{return {...defaultCampaign,...JSON.parse(row.value),version:row.version};}
 catch{return {...defaultCampaign,version:row.version};}
}
export async function publicCampaign(db){
 const campaign=await readCampaign(db);if(!campaign.enabled)return null;
 if(campaign.code){
  const p=await db.prepare('SELECT * FROM promotions WHERE code=?').bind(campaign.code).first();
  try{couponUsable(p,p?.minimum||0);}catch{return null;}
  return {...campaign,offer:{kind:p.kind,value:p.value,minimum:p.minimum,ends:p.ends}};
 }
 return campaign;
}
export async function quoteOrder(db,rawItems,rawCode=''){
 if(!Array.isArray(rawItems)||!rawItems.length||rawItems.length>20)throw new Problem('Choose at least one product.');
 const items=[],quantities=new Map();
 for(const item of rawItems){
  const p=await db.prepare('SELECT * FROM products WHERE id=?').bind(str(item.id)).first(),qty=Number(item.quantity);
  if(!p||p.status!=='active'||p.price===null)throw new Problem('A piece in your bag is not available to order yet.',409);
  if(!JSON.parse(p.sizes).includes(item.size)||!Number.isInteger(qty)||qty<1||qty>20)throw new Problem('Check the product size and quantity.');
  items.push({id:p.id,name:p.name,color:p.color,image:p.image,price:p.price,size:item.size,quantity:qty,version:p.version});
  quantities.set(p.id,(quantities.get(p.id)||0)+qty);
  if(quantities.get(p.id)>p.stock)throw new Problem('A piece in your bag no longer has enough stock.',409);
 }
 const subtotal=items.reduce((sum,i)=>sum+i.price*i.quantity,0),code=str(rawCode,24).toUpperCase();
 const coupon=code?await db.prepare('SELECT * FROM promotions WHERE code=?').bind(code).first():null;
 const discount=code?couponUsable(coupon,subtotal):0;
 return {items,quantities,subtotal,discount,total:subtotal-discount,promo_code:code,coupon};
}
