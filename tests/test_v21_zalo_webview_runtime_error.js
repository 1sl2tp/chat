const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const path=require('path');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function isOwnedRuntimeErrorEvent(event){');
const end=source.indexOf("\nwindow.addEventListener('error'",start);
assert(start>=0&&end>start,'runtime ownership function must exist');

const context={
  console:{warn(){}},
  URL,
  location:{
    href:'https://chat.taphoa.xyz/',
    origin:'https://chat.taphoa.xyz',
    protocol:'https:'
  }
};
vm.createContext(context);
vm.runInContext(source.slice(start,end)+'\nthis.__isOwned=isOwnedRuntimeErrorEvent;',context);
const isOwned=context.__isOwned;

assert.strictEqual(
  isOwned({
    message:"ReferenceError: Can't find variable: zaloJSV2",
    filename:'',
    error:{message:"Can't find variable: zaloJSV2"}
  }),
  false,
  'Zalo WebView bridge ReferenceError must be treated as external runtime noise'
);

assert.strictEqual(
  isOwned({
    message:'ReferenceError: zaloJSV2 is not defined',
    filename:'https://chat.taphoa.xyz/',
    error:{message:'zaloJSV2 is not defined'}
  }),
  false,
  'Zalo bridge noise must stay ignored even when the WebView attributes it to the page'
);

assert.strictEqual(
  isOwned({
    message:"ReferenceError: Can't find variable: chatOwnedVariable",
    filename:'',
    error:{message:"Can't find variable: chatOwnedVariable"}
  }),
  true,
  'ordinary no-filename app ReferenceErrors must still surface'
);

assert.strictEqual(
  isOwned({
    message:'TypeError: first-party failure',
    filename:'https://chat.taphoa.xyz/app.js',
    error:{message:'first-party failure'}
  }),
  true,
  'first-party runtime errors must still surface'
);

assert.strictEqual(
  isOwned({
    message:'TypeError: external failure',
    filename:'https://cdn.example.com/widget.js',
    error:{message:'external failure'}
  }),
  false,
  'existing external-origin filtering must remain intact'
);

console.log('Zalo WebView runtime error scope PASS');
