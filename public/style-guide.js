import {products} from './catalog.js';
export const occasions={everyday:'Everyday',work:'Creative workday',evening:'Evening out',weekend:'Weekend'};
export const moods={minimal:'Quiet minimal',street:'Relaxed street',smart:'Soft tailoring'};
export const weatherOptions={warm:'Warm days',cool:'Cool days',rain:'Rainy days'};
export const defaults={occasion:'everyday',mood:'minimal',weather:'warm',color:'signature-onyx'};
const quotes=[
 ['Personal style begins when you stop dressing for someone else.','Wear one piece today just because you love it.'],
 ['A quiet detail can say everything.','Choose a single accent. Let everything else breathe.'],
 ['Wear the clothes. Keep your own character.','Build around a piece you already reach for.'],
 ['The best thing an outfit can fit is your day.','Dress for what you want to do, not only how it looks.'],
 ['Less noise. More room to be yourself.','Try a two-color outfit. Notice the silhouette.'],
 ['Style is a practice, not a finish line.','Change one proportion in an outfit you know well.'],
 ['Your everyday can still feel considered.','Repeat a color in two small details.']
];
export function dailyNote(date=new Date()){
 const day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
 const [quote,challenge]=quotes[((day%quotes.length)+quotes.length)%quotes.length];
 return {quote,challenge};
}
export function normalizeContext(input={}){
 if(!input||typeof input!=='object')input={};
 return {occasion:Object.hasOwn(occasions,input.occasion)?input.occasion:defaults.occasion,mood:Object.hasOwn(moods,input.mood)?input.mood:defaults.mood,weather:Object.hasOwn(weatherOptions,input.weather)?input.weather:defaults.weather,color:products.some(p=>p.id===input.color)?input.color:defaults.color};
}
// This is a curated, local guide. It does not call a model or send visitor input anywhere.
export function createLook(input={},request=''){
 const context=normalizeContext(input);const text=String(request).slice(0,500).toLowerCase();const matched=[];
 const rules=[['occasion','work',/\b(work|workday|office|meeting)\b/],['occasion','evening',/\b(date|dinner|evening|night)\b/],['occasion','weekend',/\b(weekend|coffee|travel|brunch)\b/],['occasion','everyday',/\b(everyday|daily|casual)\b/],['mood','minimal',/\b(minimal|simple|quiet)\b/],['mood','street',/\b(street|baggy|oversized)\b/],['mood','smart',/\b(smart|tailored|polished|dressy)\b/],['weather','warm',/\b(warm|hot|summer|heat)\b/],['weather','cool',/\b(cool|cold|winter|chilly)\b/],['weather','rain',/\b(rain|rainy|wet)\b/],['color','signature-onyx',/\b(black|onyx)\b/],['color','signature-cream',/\b(cream|ivory|ecru)\b/],['color','signature-charcoal',/\b(charcoal|grey|gray)\b/],['color','signature-orange',/\borange\b/]];
 for(const [key,value,pattern] of rules)if(pattern.test(text)){if(key==='color'&&context.color.startsWith('graphic-')&&products.find(p=>p.id===context.color)?.swatch===products.find(p=>p.id===value)?.swatch){}else context[key]=value;matched.push(key)}
 const graphicCue=/\b(paper|talk|sigil|café|cafe|orbit)\b/.exec(text)?.[0];
 if(graphicCue){context.color=graphicCue==='paper'?'graphic-paper':graphicCue==='talk'?'graphic-talk':graphicCue==='sigil'?'graphic-sigil':'graphic-cafe';matched.push('design')}
 const tee=products.find(p=>p.id===context.color);
 const isOrange=tee.swatch==='#F26B24';const isCream=tee.swatch==='#F3EEE4';
 const bottomTone=isOrange?'charcoal':isCream?'deep olive':'warm stone';
 const bottomHex=isOrange?'#454641':isCream?'#62674b':'#c5b9a6';
 const isDressier=context.mood==='smart'||context.occasion==='work'||context.occasion==='evening';
 const bottom=context.mood==='street'?`Straight, relaxed ${bottomTone} cargo trousers`:`${isDressier?'Pleated':'Straight-leg'} ${bottomTone} trousers`;
 let footwear=isDressier?'Minimal black loafers':'Low-profile cream sneakers';
 if(context.mood==='street')footwear='Simple black skate-style sneakers';
 if(context.weather==='rain')footwear='Dark, water-resistant sneakers with a grippy sole';
 const layer=context.weather==='warm'?'Skip the layer; let the dropped shoulder define the shape.':context.weather==='rain'?'An unlined charcoal rain shell; keep the hem above your shoes.':context.mood==='smart'?'An unstructured charcoal jacket, worn open.':'A soft stone overshirt, worn open to show the tee.';
 const accessory=isOrange?'Keep accessories quiet: one matte silver detail.':context.mood==='street'?'A small crossbody bag; keep the strap clear of the artwork.':'One small silver ring or a clean black watch.';
 const title=context.occasion==='work'?'OFF-DUTY, ON PURPOSE.':context.occasion==='evening'?'AFTER HOURS. STILL YOU.':context.mood==='street'?'ROOM TO MOVE.':context.occasion==='weekend'?'THE SLOW-DAY UNIFORM.':'QUIETLY PUT TOGETHER.';
 const why=isOrange?'Orange becomes the focal point. Charcoal grounds it, so you get expression without competing colors.':isCream?'Cream and olive give you soft contrast. A dark shoe anchors the light tee and keeps the outfit intentional.':`A dark tee and lighter trousers create a clear silhouette. ${footwear.includes('cream')?'Cream sneakers continue the lighter tone for an easy finish.':'A dark shoe repeats the tee’s depth and brings the look together.'}`;
 const fit=context.mood==='street'?'Keep the relaxed shape, but finish the trouser hem cleanly. Oversized feels deliberate when the lengths are controlled.':isDressier?'Try a small front tuck and a trouser hem with little break. That one change gives a relaxed tee a sharper line.':'Let the tee sit naturally around the hip. Try a small front tuck if you want a longer-looking leg line.';
 const extra=/\b(budget|cheap|affordable|already|own)\b/.test(text)?'Start with trousers and shoes you already own in similar tones. This is an outfit formula, not a shopping list.':/\b(layer|layers|layering)\b/.test(text)?'Keep the outer layer open and slightly longer than the tee. Avoid bunching at the shoulder so the relaxed sleeve can sit naturally.':/\b(color|colour|palette)\b/.test(text)?'Use the tee as the main color, the trousers as the second, and repeat a shoe or accessory tone once. Two or three colors are plenty.':null;
 const unsupported=text.trim().length>0&&matched.length===0&&!extra;
 return {context,title,tee:tee.id,items:[['Start here',`${tee.color} ${tee.name}`],['Add shape',bottom],['Ground it',footwear],['Finish softly',accessory]],layer,why:tee.style?why+' Keep the other pieces plain so the graphic has room to speak.':why,fit,extra,palette:[{name:tee.color,hex:tee.swatch},{name:bottomTone,hex:bottomHex},{name:context.weather==='rain'?'Graphite':'Soft cream',hex:context.weather==='rain'?'#555552':'#F3EEE4'}],note:unsupported?'This guided preview can help with occasion, silhouette, weather and color. I’ve used your selected settings for this look; open-ended AI conversation will come later.':matched.length?'I picked up those style cues and updated your settings. Here’s a combination to try.':'Here’s a starting point from your choices. Make it your own with the pieces you already love.'};
}
export function lookKey(look){const c=look.context;return [c.occasion,c.mood,c.weather,c.color].join(':')}
