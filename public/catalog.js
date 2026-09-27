export const sizes=['S','M','L','XL','XXL'];
export const signatureProducts=[
 {id:'signature-onyx',name:'The Signature Tee',color:'Onyx Black',swatch:'#20201c',price:1800,image:'/assets/tee-front.png',back:'/assets/tee-back.png',detail:'/assets/tee-detail.png',description:'A relaxed black tee with dropped shoulders, a clean neckline, and a quiet cream monogram at the chest.'},
 {id:'signature-cream',name:'The Signature Tee',color:'Warm Cream',swatch:'#F3EEE4',price:1800,image:'/assets/tee-cream.png',description:'Our everyday silhouette in warm cream, finished with the signature Lyverne mark in orange.'},
 {id:'signature-charcoal',name:'The Signature Tee',color:'Washed Charcoal',swatch:'#555552',price:1800,image:'/assets/tee-charcoal.png',description:'A soft charcoal tone, an easy dropped shoulder, and a small cream signature. Understated from every angle.'},
 {id:'signature-orange',name:'The Signature Tee',color:'Lyverne Orange',swatch:'#F26B24',price:1800,image:'/assets/tee-orange.png',description:'The everyday uniform in our signature orange. A relaxed shape with a small cream chest monogram.'}
];
export const graphicProducts=[
 {id:'graphic-paper',detailFocus:'75% 82%',name:'Paper Day Tee',color:'Warm Cream',swatch:'#F3EEE4',price:null,sizes:['M','L','XL'],style:'ZTS-LY-260901',category:'GRAPHIC EDITION',image:'/assets/graphic-paper-front.png',description:'Warm cream, a relaxed drop shoulder, and a coffee-carrying character in earthy tones. The large graphic sits low on the front, following the original Lyverne design.'},
 {id:'graphic-talk',detailFocus:'77% 90%',name:'Talk Less Tee',color:'Warm Cream',swatch:'#F3EEE4',price:null,sizes:['M','L','XL'],style:'ZTS-LY-260902',category:'GRAPHIC EDITION',image:'/assets/graphic-talk-front.png',back:'/assets/graphic-talk-back.png',description:'A small blue-green character at the lower front. Turn it around for the full “Talk doesn’t cook rice” artwork. Oversized, with dropped shoulders and a crew neckline.'},
 {id:'graphic-sigil',name:'Night Sigil Tee',color:'Onyx Black',swatch:'#20201c',price:null,sizes:['M','L','XL'],style:'ZTS-LY-260903',category:'GRAPHIC EDITION',image:'/assets/graphic-sigil-front.png',back:'/assets/graphic-sigil-back.png',description:'Black cotton with a small red chest emblem and a large armored graphic across the back. A bold detail, balanced by a quiet oversized silhouette.'},
 {id:'graphic-cafe',name:'Café Orbit Tee',color:'Midnight Navy',swatch:'#171e35',price:null,sizes:['M','L','XL'],style:'ZTS-LY-260904',category:'GRAPHIC EDITION',image:'/assets/graphic-cafe-front.png',description:'Deep navy with a vintage cream café-and-astronaut chest graphic. A relaxed crewneck tee for your own orbit, based on the original Lyverne artwork.'}
];
export const products=[...signatureProducts,...graphicProducts];
export const findProduct=id=>products.find(p=>p.id===id)||products[0];
export const money=n=>Number.isFinite(n)?'৳'+n.toLocaleString('en-BD'):'PRICE TBA';
let catalogRequest;
export function refreshCatalog(){
 if(typeof window==='undefined')return Promise.resolve(null);
 return catalogRequest??=fetch('/api/products',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json()}).then(data=>{
  const live=new Map(data.products.map(p=>[p.id,p]));
  for(const p of products){if(live.has(p.id))Object.assign(p,live.get(p.id));}
  for(const p of data.products)if(!products.some(o=>o.id===p.id))products.push({...p,swatch:'#24241f'});
  return data;
 }).catch(()=>null);
}
