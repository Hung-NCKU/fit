// iOS can report a stale CSS dvh on first standalone launch or return from the app switcher.
export function installAppHeight(win=window,doc=document){
 let frame,timers=[];
 function sync(){
  const viewport=win.visualViewport;
  if(viewport?.scale && Math.abs(viewport.scale-1)>.02)return;
  const editing=doc.activeElement?.matches?.('input,textarea,[contenteditable="true"]');
  const fullHeight=win.innerHeight;
  const height=editing && viewport?.height<fullHeight*.8 ? viewport.height : fullHeight;
  if(Number.isFinite(height) && height>0)doc.documentElement.style.setProperty('--app-height',`${Math.round(height)}px`);
 }
 function settle(){
  sync();win.cancelAnimationFrame(frame);timers.forEach(win.clearTimeout.bind(win));
  frame=win.requestAnimationFrame(()=>{sync();frame=win.requestAnimationFrame(sync);});
  timers=[150,450,900].map(delay=>win.setTimeout(sync,delay));
 }
 win.addEventListener('resize',settle);
 win.addEventListener('pageshow',settle);
 win.addEventListener('orientationchange',settle);
 win.visualViewport?.addEventListener('resize',settle);
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)settle();});
 doc.addEventListener('focusin',settle);doc.addEventListener('focusout',settle);
 settle();
}
