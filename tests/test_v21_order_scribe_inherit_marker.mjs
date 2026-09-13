import assert from 'node:assert/strict';
import {materializeAiImageTranscriptions} from '../supabase/functions/v21-order-scribe/scribe-core.mjs';

{
  const result=materializeAiImageTranscriptions([
    {text:'TH bịch có đường 2T',uncertain:false},
    {text:'____ ít đường 2T',uncertain:false},
  ]);
  assert.deepEqual(result,{
    items:[
      {quantity:2,quantityLabel:'2T',name:'TH bịch có đường',uncertain:false},
      {quantity:2,quantityLabel:'2T',name:'TH bịch ít đường',uncertain:false},
    ],
    unresolved:[],
  },'____ means reuse the previous common name and replace only its visible variant');
}

{
  const result=materializeAiImageTranscriptions([
    {text:'TH bịch có đường 10T',uncertain:false},
    {text:'____ bịch ít đường 15T',uncertain:false},
  ]);
  assert.deepEqual(result,{
    items:[
      {quantity:10,quantityLabel:'10T',name:'TH bịch có đường',uncertain:false},
      {quantity:15,quantityLabel:'15T',name:'TH bịch ít đường',uncertain:false},
    ],
    unresolved:[],
  },'the visible remainder after ____ can repeat part of the type; the omitted prefix still comes from the line above');
}

{
  const result=materializeAiImageTranscriptions([
    {text:'Yomost dâu 2T',uncertain:false},
    {text:'____ cam 3T',uncertain:false},
  ]);
  assert.deepEqual(result,{
    items:[
      {quantity:2,quantityLabel:'2T',name:'Yomost dâu',uncertain:false},
      {quantity:3,quantityLabel:'3T',name:'Yomost cam',uncertain:false},
    ],
    unresolved:[],
  },'repeat markers are structural, not tied to a hard-coded product/variant dictionary');
}

{
  const result=materializeAiImageTranscriptions([
    {text:'Meizan 1L : 2T',uncertain:false},
    {text:'____ 2L : 2T',uncertain:false},
    {text:'____ 5L : 2T',uncertain:false},
  ]);
  assert.deepEqual(result,{
    items:[
      {quantity:2,quantityLabel:'2T',name:'Meizan 1L',uncertain:false},
      {quantity:2,quantityLabel:'2T',name:'Meizan 2L',uncertain:false},
      {quantity:2,quantityLabel:'2T',name:'Meizan 5L',uncertain:false},
    ],
    unresolved:[],
  },'repeat marker must keep the previous parent while changing the size variant');
}

{
  const result=materializeAiImageTranscriptions([
    {text:'____ ít đường 2T',uncertain:false},
  ]);
  assert.deepEqual(result,{
    items:[],
    unresolved:[{raw:'____ ít đường 2T'}],
  },'a repeat marker without a previous resolved line must stay unresolved instead of guessing');
}

console.log('handwritten repeat-marker inheritance contract PASS');
