import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState,bindTouchButtons,bindOrbitPointer,bindTouchAction} from '../src/touch-input.js';
class Button extends EventTarget{
 constructor(code){super();this.dataset={key:code};this.disabled=false;this.classes=new Set();this.attributes=new Map();this.captures=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
 setAttribute(name,value){this.attributes.set(name,value);}
 setPointerCapture(id){this.captures.add(id);}
 hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){this.captures.delete(id);send(this,'lostpointercapture',id);}
}
function send(target,type,id,xy={}){const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,button:0,clientX:0,clientY:0,...xy});target.dispatchEvent(event);return event;}
function setup(){const input=new InputState(),w=new Button('KeyW'),a=new Button('KeyA'),s=new Button('KeyS'),window=new EventTarget();let enabled=true;const bound=bindTouchButtons([w,a,s],input,{releaseTarget:window,enabled:()=>enabled});return {input,w,a,s,window,bound,setEnabled:v=>enabled=v};}

test('Two fingers hold throttle and direction independently, including two fingers on one button',()=>{
 const {input,w,a,bound}=setup();send(w,'pointerdown',1);send(a,'pointerdown',2);
 assert.ok(input.has('KeyW')&&input.has('KeyA'));assert.ok(w.classes.has('is-held')&&a.classes.has('is-held'));
 send(a,'pointerup',2);assert.ok(input.has('KeyW'));assert.equal(input.has('KeyA'),false);assert.equal(a.attributes.get('aria-pressed'),'false');
 send(w,'pointerdown',3);send(w,'pointerup',1);assert.ok(input.has('KeyW'));send(w,'pointerup',3);assert.equal(input.has('KeyW'),false);bound.dispose();
});

test('Keyboard and touch never release each other when they hold the same key',()=>{
 const {input,w,bound}=setup();input.setKey('KeyW',true);send(w,'pointerdown',1);send(w,'pointerup',1);assert.ok(input.has('KeyW'));
 send(w,'pointerdown',2);input.setKey('KeyW',false);assert.ok(input.has('KeyW'));send(w,'pointercancel',2);assert.equal(input.has('KeyW'),false);bound.dispose();
});

test('Pointer cancel and lost capture release only the affected finger',()=>{
 const {input,w,a,s,window,bound}=setup();send(s,'pointerdown',1);send(a,'pointerdown',2);send(a,'pointercancel',2);
 assert.ok(input.has('KeyS'));assert.equal(input.has('KeyA'),false);send(s,'lostpointercapture',1);assert.equal(input.has('KeyS'),false);
 send(w,'pointerdown',4);send(window,'pointerup',4);assert.equal(input.has('KeyW'),false);assert.equal(w.captures.size,0);bound.dispose();
});

test('Clearing on blur, pause, restart or rotation leaves no held key, feedback or capture',()=>{
 for(const reason of['blur','pause','restart','orientationchange']){
  const {input,w,a,bound,setEnabled}=setup();input.setKey('ArrowUp',true);send(w,'pointerdown',1);send(a,'pointerdown',2);
  input.clear();bound.clear();setEnabled(false);
  assert.equal(input.keyboard.size,0,reason);assert.equal(input.pointers.size,0,reason);assert.equal(w.captures.size+a.captures.size,0);assert.equal(w.classes.size+a.classes.size,0);
  send(w,'pointerdown',9);assert.equal(input.has('KeyW'),false);setEnabled(true);send(w,'pointerdown',10);assert.ok(input.has('KeyW'));bound.dispose();
 }
});

test('Secondary canvas fingers cannot steal or release the orbit drag',()=>{
 const canvas=new Button(),window=new EventTarget(),moves=[];let enabled=true;
 const orbit=bindOrbitPointer(canvas,{releaseTarget:window,enabled:()=>enabled,onDrag:(x,y)=>moves.push([x,y])});
 send(canvas,'pointerdown',1,{clientX:10,clientY:20});send(canvas,'pointerdown',2,{clientX:100,clientY:100});send(window,'pointerup',2);
 send(canvas,'pointermove',1,{clientX:15,clientY:29});assert.deepEqual(moves,[[5,9]]);
 orbit.clear();assert.equal(canvas.captures.size,0);send(canvas,'pointermove',1,{clientX:30,clientY:40});assert.equal(moves.length,1);
 send(canvas,'pointerdown',3);enabled=false;send(canvas,'pointermove',3,{clientX:30,clientY:40});assert.equal(moves.length,1);assert.equal(canvas.captures.size,0);orbit.dispose();
});

test('Touch actions activate with a secondary finger once, retain keyboard clicks and respect disabled state',()=>{
 const button=new Button();let calls=0;const dispose=bindTouchAction(button,()=>calls++);
 const touch=send(button,'pointerdown',2,{pointerType:'touch',isPrimary:false});assert.equal(calls,1);assert.equal(touch.defaultPrevented,true);
 send(button,'click',2,{pointerType:'touch',detail:1});send(button,'click',2,{detail:1});assert.equal(calls,1);
 send(button,'click',0,{detail:0});assert.equal(calls,2);
 button.disabled=true;send(button,'pointerdown',3,{pointerType:'touch'});send(button,'click',0,{detail:0});assert.equal(calls,2);
 dispose();button.disabled=false;send(button,'pointerdown',3,{pointerType:'touch'});assert.equal(calls,2);
});
