import {productPricing,priceMarkup} from './commerce.js';
export function productPriceFields(product){
 return `<section class="full product-pricing-editor"><h3>Price & discount</h3><div class="form-grid"><label>Regular price (BDT)<input name="price" type="number" min="1" max="1000000" step="1" value="${product.price??''}" placeholder="Leave blank for TBA"></label><label>Discount<select name="discount_type">${[['none','No discount'],['percent','Percentage (%)'],['fixed','Amount off (BDT)']].map(([value,label])=>`<option value="${value}" ${(product.discount_type||'none')===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Discount value<input name="discount_value" type="number" min="1" step="1" value="${Number(product.discount_value)||''}" ${(product.discount_type||'none')==='none'?'disabled':''} placeholder="e.g. 10"><small class="muted" data-discount-hint></small></label></div><div class="product-price-preview"><span class="eyebrow">CUSTOMER PRICE PREVIEW</span><div data-price-preview role="status" aria-live="polite"></div></div><p class="error" data-price-error role="alert"></p><p class="small muted">The product discount is automatic. Any valid promo code is applied afterward at checkout.</p></section>`;
}
export function updateProductPricing(form){
 const price=form.querySelector('[name=price]'),kind=form.querySelector('[name=discount_type]'),value=form.querySelector('[name=discount_value]');
 const regular=price.value===''?null:Number(price.value),type=kind.value,amount=Number(value.value);
 value.disabled=type==='none';value.max=String(type==='percent'?99:Math.max(1,(regular||0)-1));
 form.querySelector('[data-discount-hint]').textContent=type==='percent'?'Enter 1–99%. Prices are rounded to whole taka.':type==='fixed'?'Enter the amount to subtract from the regular price.':'Choose a discount type to enable this field.';
 let error='';
 if(type!=='none'){
  if(!Number.isInteger(regular)||regular<1||regular>1000000)error='Set a valid regular price first.';
  else if(!Number.isInteger(amount)||amount<1||(type==='percent'?amount>99:amount>=regular))error=type==='percent'?'Enter a whole-number discount from 1 to 99%.':'Enter a whole-number amount below the regular price.';
  else if(productPricing({price:regular,discount_type:type,discount_value:amount}).savings<1)error='The discount must save at least ৳1.';
 }
 value.setCustomValidity(error);
 form.querySelector('[data-price-error]').textContent=error;
 form.querySelector('[data-price-preview]').innerHTML=regular===null?'<span class="muted small">Enter a regular price to see the final selling price.</span>':error?priceMarkup({price:regular}):priceMarkup({price:regular,discount_type:type,discount_value:type==='none'?0:amount});
}
