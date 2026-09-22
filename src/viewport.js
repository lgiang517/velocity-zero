/** Keep the render buffer aligned with the CSS canvas when mobile browser chrome changes. */
export function observeViewport(canvas,onResize,{target=window,ResizeObserverClass=globalThis.ResizeObserver}={}){
  let frame=null,disposed=false,lastWidth=0,lastHeight=0,lastDpr=0;
  const flush=()=>{
    frame=null;
    if(disposed)return;
    const width=canvas.clientWidth,height=canvas.clientHeight,dpr=target.devicePixelRatio||1;
    // Hidden/zero-sized canvases are not a useful projection; observe again on reveal.
    if(width<=0||height<=0||(width===lastWidth&&height===lastHeight&&dpr===lastDpr))return;
    lastWidth=width;lastHeight=height;lastDpr=dpr;
    onResize();
  };
  const schedule=()=>{if(!disposed&&frame===null)frame=target.requestAnimationFrame(flush);};
  target.addEventListener('resize',schedule);
  target.visualViewport?.addEventListener('resize',schedule);
  const observer=ResizeObserverClass?new ResizeObserverClass(schedule):null;
  observer?.observe(canvas);
  schedule();
  return ()=>{
    disposed=true;
    if(frame!==null)target.cancelAnimationFrame(frame);
    target.removeEventListener('resize',schedule);
    target.visualViewport?.removeEventListener('resize',schedule);
    observer?.disconnect();
  };
}
