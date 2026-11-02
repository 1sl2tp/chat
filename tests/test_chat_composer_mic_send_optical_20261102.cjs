'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

// SPEC-CHAT-COMPOSER-MIC-SEND-20261102
// Given an iPhone Chat composer (empty or with text), the microphone and
// send affordance have visually balanced ChatGPT-like sizes without ever
// shrinking their accessible 44px touch surfaces.
// MUST-STAY: recording permission/preview, send mode, IME, keyboard
// positioning, composer height and audio state machine logic.
const token=fs.readFileSync('ui-foundation.css','utf8');
const mobile=fs.readFileSync('mobile-chat-refresh.css','utf8');
const markup=fs.readFileSync('index.source.html','utf8');
const runtime=fs.readFileSync('app.js','utf8');

const readToken=name=>{
  const match=token.match(new RegExp('--'+name+':(\\d+)px;'));
  assert(match,'missing UI token '+name);
  return Number(match[1]);
};
const touch=readToken('ui-control-touch');
const mic=readToken('ui-composer-mic-glyph');
const arrow=readToken('ui-composer-arrow-glyph');
const disc=readToken('ui-composer-send-disc');
const ring=readToken('ui-composer-send-ring');
assert.equal(touch,44);
assert.equal(mic,24);
assert.equal(arrow,22);
assert.equal(disc,38);
assert.equal(ring,3);
assert.equal(disc+2*ring,touch,'ring must fit inside the original hit box');

// SPEC-CHAT-COMPOSER-SURFACE-20261102 — subtle theme-aware surface,
// no blue focus glow or hardcoded white footer, and one shared button press
// path. Input geometry, send/record/IME and keyboard placement stay intact.
const source=markup;
assert(token.includes('--ui-chat-composer-radius:28px;'));
assert(source.includes('border:1px solid var(--composer-border,var(--theme-border-strong));'));
assert(source.includes('box-shadow:var(--composer-shadow,0 1px 1px #00000008),0 4px 14px rgba(0,0,0,.035);'));
assert(source.includes('var(--theme-surface-primary,#fff) 76%'));
assert(source.includes('#composerShell :is(#composer-plus-btn,#composer-mic-btn,#send):active:not(:disabled)'));
assert(source.includes('#composerShell[data-can-send="true"] #send:hover:not(:disabled)'));
assert(source.includes('@media (prefers-reduced-motion:reduce)'));
assert(mobile.includes('border-radius:var(--ui-chat-composer-radius,var(--radius-2xl,28px));'));
assert(mobile.includes('transition:background-color .12s ease,color .12s ease,transform .12s ease;'));
assert(mobile.includes('#composer-mic-btn:not([data-recording="true"])'));
assert(!source.includes('rgba(255,255,255,.94) 54%'));


assert(mobile.includes('width:var(--ui-control-touch,44px)!important;'));
assert(mobile.includes('height:var(--ui-control-touch,44px)!important;'));
assert(mobile.includes('border:var(--ui-composer-send-ring,4px) solid var(--cgpt-composer-surface-primary)'));
assert(mobile.includes('width:var(--ui-composer-mic-glyph,20px)!important;'));
assert(mobile.includes('width:var(--ui-composer-arrow-glyph,18px)!important;'));
assert(mobile.includes('#composer-mic-btn svg :is(path,line,rect,circle,polyline)'));
assert(mobile.includes('#send svg :is(path,line,rect,circle,polyline)'));
assert(mobile.includes('stroke-width:1.8px!important;'));
assert(mobile.includes('stroke-width:2px!important;'));
assert(mobile.includes('#composerShell:not([data-can-send="true"]) #send'));
assert(mobile.includes('#composerShell[data-audio-state="RECORDING"]'));

assert(markup.includes('id="composer-mic-btn"'));
assert(markup.includes('id="send" type="submit"'));
assert(markup.includes('data-chatgpt-source-icon="microphone-regular-24"'));
assert(markup.includes('data-arrow="up" data-mode-toggle="true"'));
assert(markup.includes('viewBox="0 0 24 24"'));
assert(markup.includes('viewBox="0 0 20 20"'));
assert(runtime.includes("micButton.addEventListener('click'"));
assert(runtime.includes("sendButton.dataset.arrow=arrow;"));
assert(runtime.includes("sendButton.dataset.modeToggle="));
assert(runtime.includes("sendButton.setAttribute("));
assert(runtime.includes('startRecording()'));
assert(runtime.includes('stopRecording()'));

console.log('CHAT mic/send visual parity: 24px mic, 22px arrow, 38px disc, stable 44px touch PASS');
