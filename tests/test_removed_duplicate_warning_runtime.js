const fs=require('fs'),assert=require('assert'),path=require('path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

assert(!/duplicateUploadWarningOverlay/.test(app),'removed duplicate-warning overlay must not be referenced');
assert(!/closeDuplicateUploadWarning/.test(app),'removed duplicate-warning close handler must not be referenced');
assert(!/showDuplicateUploadWarning/.test(app),'removed duplicate-warning open handler must not be referenced');
assert(!/duplicate_image/.test(app),'historical duplicate-image blocker must stay removed');
assert(/v21-interaction-abort/.test(app),'interaction abort handler must remain present');
console.log('removed duplicate warning runtime references PASS');
