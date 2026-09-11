import {mealsDelivered} from '../../supabase/functions/_shared/keel/meals_delivered.ts';
const mouths=[{memberId:'alice',cells:[{day:'mon',slot:'lunch'},{day:'mon',slot:'dinner'}]}];
const dish={title:'Riz aux légumes',day:'mon',slot:'lunch',memberId:null,boxes:[],heldOff:[]};
console.log(JSON.stringify([
 {case:'zero dishes, two expected meals',result:mealsDelivered([],mouths)},
 {case:'lunch present, dinner absent',result:mealsDelivered([dish],mouths)},
],null,2));
