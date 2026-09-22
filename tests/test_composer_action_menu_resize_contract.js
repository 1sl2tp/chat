const fs=require('fs'),assert=require('assert'),path=require('path');

const css=fs.readFileSync(path.join(__dirname,'..','mobile-ui-polish.css'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');

const menuBlock=css.match(/\/\* ---------- Composer \+ menu ---------- \*\/[\s\S]*?\.composer-action-menu-source\s*\{([\s\S]*?)\}/);
assert(menuBlock,'mobile composer menu polish block must exist');
assert(!/top\s*:\s*auto\s*!important/i.test(menuBlock[1]),'mobile polish must not override JS-computed top');
assert(!/bottom\s*:\s*calc\([^}]*anchor\(/i.test(menuBlock[1]),'mobile polish must not use anchor() for vertical placement');
assert(/placeComposerActionMenu\(\)/.test(app),'composer menu must have one JS placement owner');
assert(/window\.addEventListener\('resize',[\s\S]*?placeComposerActionMenu\(\)/.test(app),'desktop resize must re-place an open menu');
assert(/vv\?\.addEventListener\('resize',[\s\S]*?placeComposerActionMenu\(\)/.test(app),'visual viewport resize must re-place an open menu');
assert(/actionMenu\.style\.top=/.test(app),'JS placement must own top');
assert(/actionMenu\.style\.bottom='auto'/.test(app),'JS placement must clear bottom');

console.log('composer action menu resize contract PASS');
