// Installed PWA: lock accidental page zoom while retaining native panning.
export function installFixedAppViewport(win=window,doc=document) {
  const mode=win.matchMedia('(display-mode: standalone)');
  const installed=()=>mode.matches || win.navigator.standalone===true;
  const viewport=doc.querySelector('meta[name="viewport"]');
  const original=viewport?.getAttribute('content');
  function apply() {
    doc.documentElement.classList.toggle('installed-app',installed());
    if(viewport)viewport.setAttribute('content',installed()?'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover':original);
  }
  const blockPinch=event=>{if(installed() && event.touches?.length>1 && event.cancelable)event.preventDefault();};
  const blockGesture=event=>{if(installed() && event.cancelable)event.preventDefault();};
  doc.addEventListener('touchstart',blockPinch,{passive:false});
  doc.addEventListener('touchmove',blockPinch,{passive:false});
  doc.addEventListener('gesturestart',blockGesture,{passive:false});
  doc.addEventListener('gesturechange',blockGesture,{passive:false});
  mode.addEventListener('change',apply);
  win.addEventListener('appinstalled',apply);
  apply();
}
