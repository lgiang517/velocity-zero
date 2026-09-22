import test from 'node:test';
import assert from 'node:assert/strict';
import {observeViewport} from '../src/viewport.js';

function setup({observer=true,visual=true}={}){
  const target=new EventTarget(),frames=new Map(),canvas={clientWidth:844,clientHeight:390};
  let frameId=0,calls=0,resizeObserver;
  target.devicePixelRatio=2;
  target.visualViewport=visual?new EventTarget():undefined;
  target.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
  target.cancelAnimationFrame=id=>frames.delete(id);
  class Observer{
    constructor(callback){this.callback=callback;resizeObserver=this;}
    observe(element){this.element=element;}
    disconnect(){this.disconnected=true;}
  }
  const dispose=observeViewport(canvas,()=>calls++,{target,ResizeObserverClass:observer?Observer:null});
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  return {target,canvas,frames,flush,dispose,get observer(){return resizeObserver;},get calls(){return calls;}};
}

test('CSS-only canvas changes resize the rendering even without a window resize',()=>{
  const h=setup();h.flush();assert.equal(h.calls,1);assert.equal(h.observer.element,h.canvas);
  h.canvas.clientHeight=320;h.observer.callback();h.flush();assert.equal(h.calls,2);
});

test('Window, visual viewport and canvas events coalesce into one frame at final dimensions',()=>{
  const h=setup();h.flush();h.canvas.clientHeight=300;
  h.target.dispatchEvent(new Event('resize'));h.target.visualViewport.dispatchEvent(new Event('resize'));h.observer.callback();
  h.canvas.clientHeight=280;assert.equal(h.frames.size,1);h.flush();assert.equal(h.calls,2);
  h.observer.callback();h.target.visualViewport.dispatchEvent(new Event('resize'));h.flush();assert.equal(h.calls,2);
});

test('Pixel ratio changes synchronize the buffer even with an unchanged CSS viewport',()=>{
  const h=setup();h.flush();h.target.devicePixelRatio=3;h.target.dispatchEvent(new Event('resize'));h.flush();assert.equal(h.calls,2);
});

test('A temporarily hidden canvas is skipped and synchronizes once visible again',()=>{
  const h=setup();h.canvas.clientWidth=0;h.flush();assert.equal(h.calls,0);
  h.canvas.clientWidth=568;h.canvas.clientHeight=320;h.observer.callback();h.flush();assert.equal(h.calls,1);
});

test('Disposal cancels pending work and removes all subscriptions',()=>{
  const h=setup();h.dispose();h.flush();assert.equal(h.calls,0);assert.equal(h.observer.disconnected,true);
  h.target.dispatchEvent(new Event('resize'));h.target.visualViewport.dispatchEvent(new Event('resize'));h.observer.callback();assert.equal(h.frames.size,0);
});

test('Older browsers still synchronize through window resize without optional APIs',()=>{
  const h=setup({observer:false,visual:false});h.flush();h.canvas.clientHeight=320;
  h.target.dispatchEvent(new Event('resize'));h.flush();assert.equal(h.calls,2);h.dispose();
});
