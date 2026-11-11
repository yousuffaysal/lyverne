import {renderProductDescription} from './product-markdown.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function productDescriptionEditor(product){
 return `<section class="full product-description-editor"><header><label for="product-description-input">Description</label><span class="small muted" data-description-count>${String(product.description||'').length} / 10,000</span></header><div class="description-toolbar" role="group" aria-label="Description formatting"><button type="button" data-description-format="heading" aria-label="Format as heading">Heading</button><button type="button" data-description-format="bold" aria-label="Bold"><strong>B</strong></button><button type="button" data-description-format="italic" aria-label="Italic"><em>I</em></button><button type="button" data-description-format="bullets" aria-label="Bulleted list"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="10" r="1"/><circle cx="3" cy="15" r="1"/></svg>List</button><button type="button" data-description-format="ordered" aria-label="Numbered list">1. List</button></div><div class="description-compose"><div><textarea id="product-description-input" name="description" rows="9" maxlength="10000" required aria-describedby="product-description-help" placeholder="## Fabric & fit&#10;&#10;A relaxed tee for your everyday.&#10;&#10;- **Fabric:** Cotton&#10;- **Fit:** Oversized">${escape(product.description)}</textarea><p class="small muted" id="product-description-help">Use <code>**bold**</code>, <code>*italic*</code>, <code>## Heading</code> and <code>- bullet points</code>. Leave a blank line between paragraphs.</p></div><details class="description-preview" open><summary>Customer preview</summary><div class="description-markdown" data-description-preview>${renderProductDescription(product.description)||'<p class="muted">Your formatted description will appear here.</p>'}</div></details></div></section>`;
}
export function updateDescriptionPreview(form){
 const field=form.querySelector('[name=description]');
 form.querySelector('[data-description-preview]').innerHTML=renderProductDescription(field.value)||'<p class="muted">Your formatted description will appear here.</p>';
 form.querySelector('[data-description-count]').textContent=field.value.length+' / 10,000';
}
export function formatProductDescription(button){
 const form=button.closest('form'),field=form.querySelector('[name=description]');
 const text=field.value,start=field.selectionStart,end=field.selectionEnd,kind=button.dataset.descriptionFormat;
 let from=start,to=end,replacement,selectFrom,selectTo;
 if(kind==='bold'||kind==='italic'){
  const marker=kind==='bold'?'**':'*',selected=text.slice(start,end);
  if(selected.startsWith(marker)&&selected.endsWith(marker)&&selected.length>=marker.length*2){replacement=selected.slice(marker.length,-marker.length);selectFrom=start;selectTo=start+replacement.length;}
  else if(text.slice(0,start).endsWith(marker)&&text.slice(end).startsWith(marker)){from-=marker.length;to+=marker.length;replacement=selected;selectFrom=from;selectTo=from+replacement.length;}
  else{replacement=marker+(selected||(kind==='bold'?'bold text':'italic text'))+marker;selectFrom=start+marker.length;selectTo=start+replacement.length-marker.length;}
 }else{
  from=start>0?text.lastIndexOf('\n',start-1)+1:0;
  const boundary=end>start&&text[end-1]==='\n'?end-1:end;const next=text.indexOf('\n',boundary);to=next<0?text.length:next;
  const lines=text.slice(from,to).split('\n');
  const pattern=kind==='heading'?/^\s*#{1,6}\s+/:kind==='ordered'?/^\s*\d+[.)]\s+/:/^\s*[-+*•●▪◦·]\s+/;
  const active=lines.filter(line=>line.trim()).length>0&&lines.filter(line=>line.trim()).every(line=>pattern.test(line));
  let number=0;
  replacement=lines.map(line=>{
   if(active)return line.replace(pattern,'');
   if(!line.trim()&&lines.length>1)return line;
   const value=line.replace(/^\s*#{1,6}\s+|^\s*(?:[-+*•●▪◦·]|\d+[.)])\s+/,'');
   return (kind==='heading'?'## ':kind==='ordered'?++number+'. ':'- ')+(value||(kind==='heading'?'Heading':'List item'));
  }).join('\n');selectFrom=from;selectTo=from+replacement.length;
 }
 if(text.length-(to-from)+replacement.length>10000)throw Error('Keep the description within 10,000 characters.');
 field.setRangeText(replacement,from,to,'select');field.focus({preventScroll:true});field.setSelectionRange(selectFrom,selectTo);
 field.dispatchEvent(new Event('input',{bubbles:true}));
}
