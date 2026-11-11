import test from 'node:test';
import assert from 'node:assert/strict';
import {productPricing,priceMarkup} from '../server/domain.mjs';
import {updateProductPricing} from '../public/product-pricing-admin.js';

test('product pricing shares whole-taka math for percentage and fixed discounts',()=>{
 assert.equal(productPricing({price:2000,discount_type:'percent',discount_value:20}).price,1600);
 assert.equal(productPricing({price:1999,discount_type:'percent',discount_value:10}).price,1800);
 assert.equal(productPricing({price:2000,discount_type:'fixed',discount_value:350}).price,1650);
 assert.equal(productPricing({price:2000}).price,2000);
 assert.equal(productPricing({price:null}).price,null);
 const html=priceMarkup({price:2000,discount_type:'percent',discount_value:20});
 assert.match(html,/<strong class="current-price">৳1,600<\/strong>/);assert.match(html,/<del[^>]*>৳2,000<\/del>/);assert.match(html,/20% off/);assert.match(html,/You save ৳400/);
 assert.doesNotMatch(priceMarkup({price:2000}),/<del|off|You save/);
});

test('admin price preview updates immediately for percentage, amount and disabled discounts',()=>{
 const fields={price:{value:'2000'},discount_type:{value:'percent'},discount_value:{value:'20',setCustomValidity(message){this.validationMessage=message}},hint:{},error:{},preview:{}};
 const form={querySelector:selector=>({'[name=price]':fields.price,'[name=discount_type]':fields.discount_type,'[name=discount_value]':fields.discount_value,'[data-discount-hint]':fields.hint,'[data-price-error]':fields.error,'[data-price-preview]':fields.preview}[selector])};
 updateProductPricing(form);assert.match(fields.preview.innerHTML,/৳1,600/);assert.match(fields.preview.innerHTML,/You save ৳400/);
 fields.discount_type.value='fixed';fields.discount_value.value='300';updateProductPricing(form);assert.match(fields.preview.innerHTML,/৳1,700/);
 fields.price.value='3000';updateProductPricing(form);assert.match(fields.preview.innerHTML,/৳2,700/);
 fields.discount_value.value='4000';updateProductPricing(form);assert.match(fields.discount_value.validationMessage,/below the regular price/);
 fields.discount_type.value='none';updateProductPricing(form);assert.equal(fields.discount_value.disabled,true);assert.equal(fields.discount_value.validationMessage,'');assert.doesNotMatch(fields.preview.innerHTML,/<del/);assert.match(fields.preview.innerHTML,/৳3,000/);
});
