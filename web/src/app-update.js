import {reactive} from 'vue';
export const updateState=reactive({version:'',pendingWrites:0,reloading:false,error:''});
export const currentBuild=typeof __APP_BUILD__==='string'?__APP_BUILD__:'';
export async function checkAppUpdate(){
  try {
    const response=await fetch('/version.json?t='+Date.now(),{cache:'no-store',headers:{'ngrok-skip-browser-warning':'1'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)return;
    const {version}=await response.json();
    if(typeof version==='string' && /^[a-z0-9-]{4,64}$/.test(version) && currentBuild && version!==currentBuild)updateState.version=version;
  }catch {/* Offline or a deployment in progress: keep the current app usable. */}
}
export function watchAppUpdates(){
  const check=()=>{if(!document.hidden)checkAppUpdate();};
  const timer=setInterval(check,60000);check();
  window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check);};
}
export async function reloadUpdatedApp(){
  if(updateState.pendingWrites || updateState.reloading)return;
  updateState.reloading=true;updateState.error='';
  try {
    const response=await fetch('/version.json?t='+Date.now(),{cache:'no-store',headers:{'ngrok-skip-browser-warning':'1'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error();
    const body=await response.json();if(typeof body.version!=='string')throw Error();
    // Keep SW registration and push subscription; only discard this app's static caches.
    if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.getRegistration();if(registration)await Promise.race([registration.update(),new Promise(resolve=>setTimeout(resolve,5000))]);}catch{}}
    if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('fit-')).map(k=>caches.delete(k)));}
    const url=new URL(location.href);url.searchParams.set('_app_update',body.version);location.replace(url.href);
  }catch {updateState.error='目前無法連線更新，請確認網路後再試。';updateState.reloading=false;}
}
