'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('bank-report-dashboard.js','utf8');
const first=src.indexOf('let reviewFocusOwner=null;');
const last=src.indexOf('async function openReviewDialog(',first);
assert(first>=0&&last>first,'extract canonical review modal lifecycle');
let focusName='',restores=0,prevented=0,stopped=0;
const makeNode=name=>({
 name,isConnected:true,hidden:false,disabled:false,
 focus(){focusName=name;doc.activeElement=this;},
 getAttribute(){return null;},getClientRects(){return [{}];}
});
const opener=makeNode('opener'),close=makeNode('close'),save=makeNode('save');
const form={querySelector(){return close;},querySelectorAll(){return [close,save]},
 contains(n){return n===close||n===save;}};
const root={hidden:false,contains(n){return n===opener;}};
const review={hidden:false,replaceChildren(){this.hidden=true;}};
const viewer={hidden:true};
const ui={review,viewer};
const doc={activeElement:opener};
const handlers={};
const overlay={isConnected:true,addEventListener(name,fn){handlers[name]=fn;}};
const context=vm.createContext({document:doc,root,ui,active:true,
 isReportContact:()=>true,closeViewer:()=>{viewer.hidden=true;}});
vm.runInContext(src.slice(first,last),context);
context.attachReviewDialogKeyboard(overlay,form);
assert.equal(focusName,'close','initial focus is on the visible close action');
function key(name,shiftKey=false){
 let event={key:name,shiftKey,
 preventDefault(){prevented++},stopPropagation(){stopped++}};
 handlers.keydown(event);
}
save.focus();key('Tab');assert.equal(focusName,'close','Tab wraps at the last action');
close.focus();key('Tab',true);assert.equal(focusName,'save','Shift Tab wraps to the last action');
viewer.hidden=false;key('Escape');assert.equal(viewer.hidden,true,'Escape closes viewer first');
assert.equal(review.hidden,false,'Escape must not dismiss the money confirmation under image');
key('Escape');assert.equal(review.hidden,true,'Escape closes the review modal');
assert.equal(focusName,'opener','focus returns to the still-visible opener');
assert.equal(prevented,4);assert.equal(stopped,2);
doc.activeElement=opener;review.hidden=false;root.hidden=false;
context.attachReviewDialogKeyboard(overlay,form);
root.hidden=true;context.closeReviewDialog();
assert.notEqual(focusName,'opener','route close must not restore focus behind hidden report');
assert(src.includes('attachReviewDialogKeyboard(overlay,form);'));
assert.equal(src.split('attachReviewDialogKeyboard(overlay,form);').length-1,4,
 'all four Admin bank review dialogs share one keyboard/focus owner');
const css=fs.readFileSync('bank-report-dashboard.css','utf8');
assert(css.includes('.bank-review-form .bank-review-actions button{min-height:44px}'));
assert(css.includes('.bank-review-heading .bank-report-image-close{min-width:44px;min-height:44px}'));
console.log('BANK-224: keyboard Escape, focus loop, focus return and 44px targets PASS');
