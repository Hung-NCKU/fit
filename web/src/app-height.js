// iOS can report a stale CSS dvh on first standalone launch or return from the app switcher.
export function installAppHeight(win=window,doc=document){
 let frame,timers=[],expandedHeight=win.innerHeight;
 function sync(){
  const nav=win.navigator;
  const ios=/iPad|iPhone|iPod/.test(nav?.userAgent || '') || nav?.platform==='MacIntel' && nav?.maxTouchPoints>1;
  const standalone=nav?.standalone===true || win.matchMedia?.('(display-mode: standalone)').matches;
  doc.documentElement.classList?.toggle('ios-installed',!!(ios && standalone));
  const viewport=win.visualViewport;
  if(viewport?.scale && Math.abs(viewport.scale-1)>.02)return;
  const editing=doc.activeElement?.matches?.('input,textarea,[contenteditable="true"]');
  const fullHeight=win.innerHeight;
  if(!editing)expandedHeight=fullHeight;
  const keyboard=!!(editing && viewport?.height<expandedHeight*.8);
  const offset=ios && standalone && keyboard ? Math.max(0,viewport?.offsetTop || 0) : 0;
  doc.documentElement.style.setProperty('--app-viewport-top',offset+'px');
  if(ios && standalone && keyboard && win.scrollY>0)win.scrollTo?.(0,0);
  doc.documentElement.classList?.toggle('app-keyboard',keyboard);
  const height=keyboard ? viewport.height : fullHeight;
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
 win.visualViewport?.addEventListener('scroll',settle);
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)settle();});
 doc.addEventListener('focusin',settle);doc.addEventListener('focusout',settle);
 settle();
}
