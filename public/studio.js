import {products,findProduct} from './catalog.js';
import {createLook,dailyNote,lookKey,normalizeContext,occasions,moods} from './style-guide.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const form=$('#style-form'),notebookKey='lyverne-style-notebook-v1';
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
let saved=[],currentLook,lookNumber=1;
const readStorage=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
function writeStorage(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function validSaved(value){if(!Array.isArray(value))return [];const seen=new Set();return value.filter(x=>x&&typeof x==='object'&&x.context&&Object.hasOwn(occasions,x.context.occasion)&&Object.hasOwn(moods,x.context.mood)&&['warm','cool','rain'].includes(x.context.weather)&&products.some(p=>p.id===x.context.color)).map(x=>({context:normalizeContext(x.context)})).filter(x=>{const id=lookKey(x);if(seen.has(id))return false;seen.add(id);return true}).slice(0,12)}
saved=validSaved(readStorage(notebookKey,[]));
function setFields(context){for(const [key,value] of Object.entries(context))form.elements.namedItem(key).value=value}
function fields(){return normalizeContext(Object.fromEntries(new FormData(form)))}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
let noticeTimer;
function notify(message){const toast=$('.toast');clearTimeout(noticeTimer);toast.textContent=message;toast.classList.add('visible');noticeTimer=setTimeout(()=>toast.classList.remove('visible'),3500)}
function paintSavedButton(){const present=saved.some(x=>lookKey(x)===lookKey(currentLook));$('#save-look').replaceChildren(document.createTextNode(present?'Saved to notebook ':'Save this look '),node('span','',present?'✓':'＋'));$('#save-look').setAttribute('aria-pressed',String(present));decorateButton($('#save-look'))}
function showLook(context,request='',focus=false){
 currentLook=createLook(context,request);setFields(currentLook.context);
 const tee=findProduct(currentLook.tee);
 $('#guide-message').textContent=currentLook.note;
 $('#look-number').textContent=String(lookNumber).padStart(2,'0');
 $('#look-title').textContent=currentLook.title;
 $('#look-context').textContent=`${occasions[currentLook.context.occasion]} · ${moods[currentLook.context.mood]}`.toUpperCase();
 $('#look-image').src=tee.image;$('#look-image').alt=`${tee.color} ${tee.name}`;
 $('#look-product').dataset.productId=tee.id;$('#look-product').setAttribute('aria-label',`See the ${tee.color} tee`);
 $('#look-palette').replaceChildren(...currentLook.palette.map(p=>{const el=node('span');el.style.background=p.hex;el.title=p.name;el.setAttribute('aria-label',p.name);return el}));
 $('#look-items').replaceChildren(...currentLook.items.map(([label,value])=>{const row=node('div');row.append(node('dt','',label),node('dd','',value));return row}));
 $('#look-why').textContent=currentLook.why;$('#look-fit').textContent=currentLook.fit;$('#look-layer').textContent=currentLook.layer;$('#look-extra').hidden=!currentLook.extra;$('#look-extra').textContent=currentLook.extra||'';
 paintSavedButton();writeStorage('lyverne-style-settings-v1',currentLook.context);
 if(focus){const result=$('#look-result');result.classList.remove('result-enter');requestAnimationFrame(()=>result.classList.add('result-enter'));result.focus({preventScroll:true});result.scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'})}
}
form.addEventListener('submit',event=>{event.preventDefault();lookNumber++;showLook(fields(),$('#style-prompt').value.trim(),true)});
$$('[data-prompt]').forEach(button=>button.addEventListener('click',()=>{$('#style-prompt').value=button.dataset.prompt;form.requestSubmit()}));
$$('[data-refine]').forEach(button=>button.addEventListener('click',()=>{const context={...currentLook.context};if(button.dataset.refine==='warm')context.weather='warm';else {context.mood=button.dataset.refine;if(context.mood==='street')context.occasion='weekend'}$('#style-prompt').value='';lookNumber++;showLook(context,'',true)}));
function renderNotebook(){
 const grid=$('#saved-grid');grid.replaceChildren();$('#saved-count').textContent=String(saved.length).padStart(2,'0');
 if(!saved.length){const empty=node('div','notebook-empty'),text=node('div');const link=node('a','','Find my first look ↗');link.href='#assistant';text.append(node('h3','','A LITTLE ROOM FOR INSPIRATION.'),node('p','','Build a look above and save the ones that feel like you.'),link);const sketch=node('span','empty-sketch','＋');sketch.setAttribute('aria-hidden','true');empty.append(sketch,text);grid.append(empty);return}
 saved.forEach(entry=>{const look=createLook(entry.context),tee=findProduct(look.tee),card=node('article','saved-card'),img=node('img'),actions=node('div','saved-card-actions');img.src=tee.image;img.alt=`${tee.color} ${tee.name}`;img.loading='lazy';img.width=1254;img.height=1254;const open=node('button','','Open look ↗');open.dataset.openLook=lookKey(look);open.setAttribute('aria-label',`Open ${look.title.toLowerCase()} in ${tee.color}`);const remove=node('button','remove-note','Remove');remove.dataset.removeLook=lookKey(look);remove.setAttribute('aria-label',`Remove ${look.title.toLowerCase()} in ${tee.color}`);actions.append(open,remove);card.append(img,node('h3','',look.title),node('p','',`${tee.color} / ${occasions[look.context.occasion]} / ${moods[look.context.mood]}`),actions);grid.append(card)})
}
$('#save-look').addEventListener('click',()=>{if(saved.some(x=>lookKey(x)===lookKey(currentLook))){notify('This look is already in your notebook.');return}if(saved.length>=12){notify('Your notebook has 12 looks. Remove one to make room.');return}saved.unshift({context:{...currentLook.context}});const persisted=writeStorage(notebookKey,saved);renderNotebook();paintSavedButton();notify(persisted?'Saved. A good idea for another day.':'Saved for this visit. Browser storage is unavailable.');$('#notebook-status').textContent=persisted?'Your latest look is saved on this device.':'This browser cannot keep your notebook after this visit.'});
$('#saved-grid').addEventListener('click',event=>{const open=event.target.closest('[data-open-look]'),remove=event.target.closest('[data-remove-look]');if(open){const entry=saved.find(x=>lookKey(x)===open.dataset.openLook);if(entry){$('#style-prompt').value='';lookNumber++;showLook(entry.context,'',true)}}if(remove){const index=saved.findIndex(x=>lookKey(x)===remove.dataset.removeLook);saved=saved.filter(x=>lookKey(x)!==remove.dataset.removeLook);const persisted=writeStorage(notebookKey,saved);renderNotebook();paintSavedButton();$('#notebook-status').textContent=persisted?'Look removed from your notebook.':'Removed for this visit. Browser storage is unavailable.';const buttons=$$('[data-remove-look]');(buttons[Math.min(index,buttons.length-1)]||$('#saved-grid a'))?.focus()}});
window.addEventListener('storage',event=>{if(event.key===notebookKey){saved=validSaved(readStorage(notebookKey,[]));renderNotebook();paintSavedButton()}});
const colorStories={
 'signature-onyx':{title:'ONYX, MEET STONE.',copy:'Start dark. Add a little warmth. A soft neutral makes the black tee feel effortless.',colors:[['Onyx','#20201c'],['Warm stone','#c5b9a6'],['Soft cream','#F3EEE4']]},
 'signature-cream':{title:'CREAM, WITH A LITTLE EARTH.',copy:'Soft cream and muted olive. An easy pairing with just enough contrast to feel considered.',colors:[['Warm cream','#F3EEE4'],['Muted olive','#62674b'],['Ink','#20201c']]},
 'signature-charcoal':{title:'A QUIETER SHADE OF DARK.',copy:'Charcoal, warm taupe and cream. Similar softness, different depths. Let texture do the talking.',colors:[['Charcoal','#555552'],['Warm taupe','#b1a28e'],['Soft cream','#F3EEE4']]},
 'signature-orange':{title:'A LITTLE MORE EXPRESSION.',copy:'Let Lyverne orange lead. Charcoal trousers and a quiet cream detail keep the whole look grounded.',colors:[['Lyverne orange','#F26B24'],['Charcoal','#454641'],['Soft cream','#F3EEE4']]}
};
let activeColor='signature-onyx';
function pickColor(id){activeColor=id;const story=colorStories[id],tee=findProduct(id);$('#color-tee').src=tee.image;$('#color-tee').alt=`${tee.color} ${tee.name}`;$('#color-story-title').textContent=story.title;$('#color-story-copy').textContent=story.copy;$('.color-disc').style.background=story.colors[1][1];$$('[data-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.color===id)));$('#palette-bars').replaceChildren(...story.colors.map(([name,hex])=>{const swatch=node('span');swatch.style.background=hex;const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);swatch.style.color=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>.179?'#20201c':'#F3EEE4';swatch.append(document.createTextNode(name),node('small','',hex.toUpperCase()));return swatch}))}
$$('[data-color]').forEach(button=>button.addEventListener('click',()=>pickColor(button.dataset.color)));
$('#use-palette').addEventListener('click',()=>{$('#style-prompt').value='';lookNumber++;showLook({...fields(),color:activeColor},'',true)});
$$('[data-lesson]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.lesson==='color'){pickColor('signature-orange');$('#use-palette').focus({preventScroll:true});$('#color-playground').scrollIntoView({behavior:reduced.matches?'instant':'smooth'})}else{lookNumber++;$('#style-prompt').value='';showLook({...fields(),mood:button.dataset.lesson},'',true)}}));
let noteDay;
function updateDailyNote(){const now=new Date();const key=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;if(noteDay===key)return;noteDay=key;const note=dailyNote(now);$('#daily-quote').textContent=`“${note.quote}”`;$('#daily-challenge').textContent=note.challenge;$('#quote-date').textContent=now.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}).toUpperCase();$('#quote-date').dateTime=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;paintChallenge(readStorage('lyverne-style-challenge',null)===noteDay)}
function paintChallenge(active){const button=$('#challenge-toggle');button.setAttribute('aria-pressed',String(active));button.replaceChildren(document.createTextNode(active?'ON MY LIST ':'I’LL TRY IT '),node('span','',active?'✓':'↗'))}
$('#challenge-toggle').addEventListener('click',()=>{updateDailyNote();const active=$('#challenge-toggle').getAttribute('aria-pressed')!=='true';paintChallenge(active);writeStorage('lyverne-style-challenge',active?noteDay:null)});
setInterval(updateDailyNote,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateDailyNote()});
// The same drawn circles and arrows used throughout the homepage.
document.body.classList.add('home-motion');
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>entry.target.classList.toggle('is-inview',entry.isIntersecting)),{threshold:.18});
function decorateButton(button){if(button.querySelector('.cta-sketch'))return;button.classList.add('drawn-cta');const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.classList.add('cta-sketch');svg.setAttribute('viewBox','0 0 220 76');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');path.setAttribute('d','M127 64C67 72 5 59 4 36 2 12 64 2 115 4 166 4 213 14 216 36 219 61 120 72 45 73');path.setAttribute('pathLength','1');svg.append(path);button.append(svg);observer.observe(button)}
$$('main .oval-link').forEach(decorateButton);$$('.hand-note,.circled-word').forEach(el=>observer.observe(el));
updateDailyNote();pickColor('signature-onyx');renderNotebook();showLook(normalizeContext(readStorage('lyverne-style-settings-v1',{})));
