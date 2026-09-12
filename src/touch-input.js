/** Keyboard and each touch pointer keep independent ownership of driving keys. */
export class InputState {
 constructor(){this.keyboard=new Set();this.pointers=new Map();this.listeners=new Set();}
 has(code){return this.keyboard.has(code)||[...this.pointers.values()].includes(code);}
 subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 notify(){for(const listener of this.listeners)listener();}
 setKey(code,pressed){if(pressed)this.keyboard.add(code);else this.keyboard.delete(code);this.notify();}
 pressPointer(id,code){this.pointers.set(id,code);this.notify();}
 releasePointer(id){if(this.pointers.delete(id))this.notify();}
 clearPointers(){this.pointers.clear();this.notify();}
 clear(){this.keyboard.clear();this.pointers.clear();this.notify();}
}

function capture(element,id){try{element.setPointerCapture?.(id);}catch{/* Global release listeners cover a lost capture. */}}
function releaseCapture(element,id){try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{/* The browser may already have cancelled it. */}}

export function bindTouchButtons(buttons,input,{enabled=()=>true,releaseTarget=globalThis.window}={}){
 const list=Array.from(buttons),owners=new Map(),remove=[];
 const listen=(target,type,handler)=>{if(!target)return;target.addEventListener(type,handler);remove.push(()=>target.removeEventListener(type,handler));};
 const refresh=()=>{for(const button of list){const held=input.has(button.dataset.key);button.classList.toggle('is-held',held);button.setAttribute('aria-pressed',String(held));}};
 const unsubscribe=input.subscribe(refresh);
 function release(id){const owner=owners.get(id);owners.delete(id);input.releasePointer(id);if(owner)releaseCapture(owner,id);}
 for(const button of list){
  listen(button,'pointerdown',event=>{
   if(!enabled()||button.disabled||(event.button!==undefined&&event.button!==0))return;
   event.preventDefault();release(event.pointerId);owners.set(event.pointerId,button);input.pressPointer(event.pointerId,button.dataset.key);capture(button,event.pointerId);
  });
  for(const type of['pointerup','pointercancel','lostpointercapture'])listen(button,type,event=>{if(owners.get(event.pointerId)===button)release(event.pointerId);});
  listen(button,'contextmenu',event=>event.preventDefault());
 }
 for(const type of['pointerup','pointercancel'])listen(releaseTarget,type,event=>release(event.pointerId));
 function clear(){for(const id of [...owners.keys()])release(id);input.clearPointers();refresh();}
 refresh();return {clear,refresh,dispose(){clear();unsubscribe();for(const off of remove)off();}};
}

/** One drag owns the orbit until that pointer ends; another finger cannot steal or release it. */
export function bindOrbitPointer(canvas,{enabled=()=>true,onDrag,releaseTarget=globalThis.window}={}){
 let pointer=null;const remove=[];
 const listen=(target,type,handler)=>{if(!target)return;target.addEventListener(type,handler);remove.push(()=>target.removeEventListener(type,handler));};
 function clear(){const old=pointer;pointer=null;if(old)releaseCapture(canvas,old.id);}
 listen(canvas,'pointerdown',event=>{
  if(pointer||!enabled()||(event.button!==undefined&&event.button!==0))return;
  event.preventDefault();pointer={id:event.pointerId,x:event.clientX,y:event.clientY};capture(canvas,event.pointerId);
 });
 listen(canvas,'pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  if(!enabled()){clear();return;}
  event.preventDefault();onDrag(event.clientX-pointer.x,event.clientY-pointer.y);pointer.x=event.clientX;pointer.y=event.clientY;
 });
 const end=event=>{if(pointer?.id===event.pointerId)clear();};
 for(const type of['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,end);
 for(const type of['pointerup','pointercancel'])listen(releaseTarget,type,end);
 return {clear,dispose(){clear();for(const off of remove)off();}};
}

/** Secondary fingers do not reliably synthesize clicks while a driving pedal is held. */
export function bindTouchAction(button,action){
 if(!button)return()=>{};
 let lastTouch=-Infinity;
 const down=event=>{if(event.pointerType!=='touch'||button.disabled)return;event.preventDefault();lastTouch=Date.now();action(event);};
 const click=event=>{if(button.disabled||event.pointerType==='touch'||(event.detail>0&&Date.now()-lastTouch<1000))return;action(event);};
 button.addEventListener('pointerdown',down);button.addEventListener('click',click);
 return()=>{button.removeEventListener('pointerdown',down);button.removeEventListener('click',click);};
}
