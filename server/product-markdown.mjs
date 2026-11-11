import {Marked} from 'marked';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const normalize=value=>String(value??'').replace(/\r\n?/g,'\n').replace(/^([\t ]*)[•●▪◦·][\t ]*/gm,'$1- ').replace(/^([\t ]*)\.\s+/gm,'$1- ');
// Raw HTML never enters the document. Markdown links use a protocol allowlist;
// images render as their alt text because this field is for product copy.
const markdown=new Marked({gfm:true,breaks:true,async:false,renderer:{
 html({text}){return escape(text);},
 heading({tokens,depth}){const level=Math.min(6,depth+2);return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;},
 image({text}){return escape(text);},
 link({href,title,tokens}){
  const label=this.parser.parseInline(tokens);
  let url;try{url=new URL(href,'https://markdown.invalid/');}catch{return label;}
  if(!['http:','https:','mailto:'].includes(url.protocol))return label;
  const destination=String(href).startsWith('#')||String(href).startsWith('?')?href:url.origin==='https://markdown.invalid'?url.pathname+url.search+url.hash:url.href;
  return `<a href="${escape(destination)}"${title?` title="${escape(title)}"`:''} rel="noopener noreferrer">${label}</a>`;
 }
}});
export function renderProductDescription(value){return markdown.parse(normalize(value));}
function tokenText(token){
 if(token.type==='list')return token.items.map(tokenText).join(' ');
 if(token.type==='table')return [...token.header,...token.rows.flat()].map(tokenText).join(' ');
 if(token.tokens)return token.tokens.map(tokenText).join('');
 if(['br','space','hr'].includes(token.type))return ' ';
 if(token.type==='html')return String(token.text||'').replace(/<[^>]*>/g,'');
 return token.text||'';
}
// Search snippets and structured data need readable text, not Markdown syntax.
export function productDescriptionText(value){return markdown.lexer(normalize(value)).map(tokenText).join(' ').replace(/\s+/g,' ').trim();}
