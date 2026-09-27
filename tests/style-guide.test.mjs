import test from 'node:test';
import assert from 'node:assert/strict';
import {createLook,normalizeContext,dailyNote,lookKey,occasions,moods,weatherOptions} from '../public/style-guide.js';
import {products} from '../public/catalog.js';
test('guided requests update matching settings and preserve other choices',()=>{
 const look=createLook({color:'signature-orange',weather:'rain'},'A minimal cream tee outfit for a cool workday on a budget');
 assert.deepEqual(look.context,{occasion:'work',mood:'minimal',weather:'cool',color:'signature-cream'});
 assert.match(look.extra,/already own/);assert.match(look.items[2][1],/loafers/);assert.match(look.layer,/overshirt/);
});
test('rain guidance stays suitable across every mood and color',()=>{
 for(const mood of Object.keys(moods))for(const product of products){const look=createLook({mood,color:product.id,weather:'rain'});assert.match(look.items[2][1],/water-resistant/);assert.match(look.layer,/rain shell/);assert.equal(look.tee,product.id)}
});
test('unsupported freeform requests explain the guided limitation without echoing input',()=>{
 const request='<img src=x onerror=alert(1)> Tell me the lottery numbers';const look=createLook({},request);
 assert.match(look.note,/open-ended AI conversation will come later/);assert.ok(!JSON.stringify(look).includes('<img'));
});
test('all selectable looks have distinct keys and complete advice',()=>{
 const keys=new Set();for(const occasion of Object.keys(occasions))for(const mood of Object.keys(moods))for(const weather of Object.keys(weatherOptions))for(const p of products){const look=createLook({occasion,mood,weather,color:p.id});keys.add(lookKey(look));assert.equal(look.items.length,4);assert.equal(look.palette.length,3);assert.ok(look.why&&look.fit&&look.layer);assert.equal(look.tee,p.id)}assert.equal(keys.size,4*3*3*products.length);
});
test('daily note is stable within a local day and changes the following day',()=>{
 const first=dailyNote(new Date(2026,8,24,1)),same=dailyNote(new Date(2026,8,24,23)),next=dailyNote(new Date(2026,8,25,1));assert.deepEqual(first,same);assert.notEqual(first.quote,next.quote);assert.ok(first.challenge);
});
test('malformed stored settings return safe catalog defaults',()=>{
 for(const bad of [null,[],42,{occasion:'<script>',mood:'unknown',color:'nope',weather:'sunny'}])assert.deepEqual(normalizeContext(bad),{occasion:'everyday',mood:'minimal',weather:'warm',color:'signature-onyx'});
});
test('graphic designs keep their identity when a matching color is requested',()=>{
 const look=createLook({color:'graphic-cafe'},'A relaxed café look for a cool weekend');assert.equal(look.tee,'graphic-cafe');assert.match(look.why,/graphic/);
 assert.equal(createLook({color:'graphic-paper'},'A cream outfit').tee,'graphic-paper');
 assert.equal(createLook({},'black sigil for dinner').tee,'graphic-sigil');
});
