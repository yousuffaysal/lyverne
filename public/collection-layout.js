// Shared by the storefront and admin preview. Unlisted products stay visible.
export const COLLECTION_SECTIONS=['graphic','signature'];
export const COLLECTION_TITLES={graphic:'The graphic edition',signature:'The quiet signature'};
export function collectionSection(product){return String(product.category||'').toUpperCase().includes('GRAPHIC')?'graphic':'signature';}
export function defaultCollectionLayout(){return {sections:[...COLLECTION_SECTIONS],products:{graphic:[],signature:[]},version:0};}
export function arrangeCollection(products,layout=defaultCollectionLayout()){
 const sections=Array.isArray(layout.sections)&&layout.sections.length===2&&new Set(layout.sections).size===2&&layout.sections.every(key=>COLLECTION_SECTIONS.includes(key))?layout.sections:COLLECTION_SECTIONS;
 return sections.map(key=>{
  const ranks=new Map((layout.products?.[key]||[]).map((id,index)=>[id,index]));
  const items=products.filter(product=>collectionSection(product)===key).map((product,index)=>({product,index}));
  items.sort((a,b)=>(ranks.get(a.product.id)??Infinity)-(ranks.get(b.product.id)??Infinity)||a.index-b.index);
  return {key,title:COLLECTION_TITLES[key],products:items.map(item=>item.product)};
 });
}
export function collectionLayoutInput(body,products){
 if(!Array.isArray(body.sections)||body.sections.length!==2||new Set(body.sections).size!==2||!body.sections.every(key=>COLLECTION_SECTIONS.includes(key)))throw Error('Choose Graphic or Signature as the first section.');
 const output={sections:[...body.sections],products:{}};const seen=new Set();
 for(const key of COLLECTION_SECTIONS){
  const ids=body.products?.[key];if(!Array.isArray(ids)||ids.length>500)throw Error('Send a valid product order for each section.');
  for(const id of ids){
   const product=products.find(product=>product.id===id);
   if(!product||collectionSection(product)!==key||seen.has(id))throw Error('A product changed collection or was listed twice. Reopen the layout and try again.');
   seen.add(id);
  }
  output.products[key]=[...ids];
 }
 return output;
}
export async function readCollectionLayout(db){
 const row=await db.prepare("SELECT value,version FROM shop_settings WHERE id='collection-layout'").first();
 if(!row)return defaultCollectionLayout();
 try{return {...JSON.parse(row.value),version:row.version};}catch{return {...defaultCollectionLayout(),version:row.version};}
}
