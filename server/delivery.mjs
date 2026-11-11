import {Problem} from './domain.mjs';
import {isRegion,normalisePhone,isPostcode} from './bangladesh.mjs';

const field=(value,max,label)=>{
 const text=String(value??'').trim();
 if(text.length>max)throw new Problem(`${label} must be ${max} characters or fewer.`);
 return text;
};
// Orders keep their own delivery snapshot. Profile edits cannot move a parcel.
export function deliveryInput(body,{required=true}={}){
 const phoneText=field(body.phone,40,'Mobile number');
 const phone=normalisePhone(phoneText);
 if((required||phoneText)&&!phone)throw new Problem('Enter a Bangladeshi mobile number, like 01712 345678.');
 const alternateText=field(body.alternate_phone,40,'Alternative mobile number');
 const alternate_phone=alternateText?normalisePhone(alternateText):'';
 if(alternateText&&!alternate_phone)throw new Problem('Enter a valid alternative Bangladeshi mobile number, or leave it empty.');
 if(alternate_phone&&alternate_phone===phone)throw new Problem('Use a different number for the alternative mobile.');
 const address=field(body.address,1000,'Detailed address');
 if(required&&address.length<10)throw new Problem('Add the house, road and area for delivery.');
 const division=field(body.division,40,'Division'),district=field(body.district,40,'District');
 const thana=field(body.thana,60,'Upazila or thana');
 if((required||division||district)&&!isRegion(division,district))throw new Problem('Choose your division and district from the list.');
 if(required&&!thana)throw new Problem('Add your upazila or thana.');
 const postcode=field(body.postcode,10,'Postcode');
 if(!isPostcode(postcode))throw new Problem('A postcode is four digits, or leave it empty.');
 return {address,phone,alternate_phone,division,district,thana,postcode,
  local_area:field(body.local_area,160,'Union, ward or locality'),
  delivery_note:field(body.delivery_note,1000,'Delivery note')};
}
