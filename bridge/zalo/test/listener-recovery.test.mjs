import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {superviseZaloListener} from '../src/listener-recovery.mjs';

function createFakeClock(){
  const timers=new Map();
  let seq=0;
  return {
    timers,
    schedule(callback,delay){
      const key=++seq;
      timers.set(key,{callback,delay});
      return key;
    },
    cancel(key){timers.delete(key);},
    runNext(){
      const [key,task]=timers.entries().next().value;
      timers.delete(key);
      task.callback();
      return task.delay;
    },
  };
}

function createListener(){
  const listener=new EventEmitter();
  listener.starts=[];
  listener.start=(options)=>listener.starts.push(options);
  return listener;
}

const logger={info(){},warn(){}};

test('starts the Zalo websocket with built-in close retry enabled',()=>{
  const listener=createListener();
  const dispose=superviseZaloListener(listener,{logger});
  assert.deepEqual(listener.starts,[{retryOnClose:true}]);
  dispose();
});

test('handles socket errors and allows built-in reconnect on disconnected',()=>{
  const clock=createFakeClock();
  const listener=createListener();
  const dispose=superviseZaloListener(listener,{logger,schedule:clock.schedule,cancel:clock.cancel});
  assert.doesNotThrow(()=>listener.emit('error',new Error('transient websocket error')));
  listener.emit('disconnected',1006,'network lost');
  assert.equal(clock.timers.size,0,'library owns its own retry after disconnected');
  dispose();
});

test('reconnects with bounded backoff if zca-js finally emits closed',()=>{
  const clock=createFakeClock();
  const listener=createListener();
  const dispose=superviseZaloListener(listener,{
    logger,schedule:clock.schedule,cancel:clock.cancel,baseDelayMs:5000,maxDelayMs:20000,
  });
  listener.emit('closed',3000,'duplicate connection');
  listener.emit('closed',3000,'duplicate connection');
  assert.equal(clock.timers.size,1,'no concurrent fallback reconnects');
  assert.equal(clock.runNext(),5000);
  assert.equal(listener.starts.length,2);
  listener.emit('closed',1006,'network error');
  assert.equal(clock.runNext(),10000);
  assert.equal(listener.starts.length,3);
  listener.emit('closed',1006,'network error');
  assert.equal(clock.runNext(),20000);
  listener.emit('connected');
  listener.emit('closed',1006,'network error');
  assert.equal(clock.runNext(),5000,'successful reconnect resets backoff');
  dispose();
});

test('retries a synchronous startup failure and cancels work on shutdown',()=>{
  const clock=createFakeClock();
  const listener=createListener();
  let fail=true;
  listener.start=options=>{
    listener.starts.push(options);
    if(fail)throw new Error('not ready');
  };
  const dispose=superviseZaloListener(listener,{
    logger,schedule:clock.schedule,cancel:clock.cancel,baseDelayMs:10,
  });
  assert.equal(clock.timers.size,1);
  fail=false;
  assert.equal(clock.runNext(),10);
  assert.deepEqual(listener.starts,[{retryOnClose:true},{retryOnClose:true}]);
  listener.emit('closed',1006);
  assert.equal(clock.timers.size,1);
  dispose();
  assert.equal(clock.timers.size,0);
  listener.emit('closed',1006);
  assert.equal(clock.timers.size,0);
});
