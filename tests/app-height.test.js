import {it,expect,vi} from 'vitest';
import {installAppHeight} from '../web/src/app-height.js';
it('首次、恢復、旋轉與鍵盤關閉會重算高度，捏合縮放不改版面高度',()=>{
 vi.useFakeTimers();const win=new EventTarget(),doc=new EventTarget(),values={};let editing=false;
 Object.assign(win,{innerHeight:844,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},visualViewport:Object.assign(new EventTarget(),{height:780,offsetTop:0,scale:1})});
 Object.assign(doc,{hidden:false,activeElement:{matches:()=>editing},documentElement:{style:{setProperty:(key,value)=>{values[key]=value;}}}});
 try{installAppHeight(win,doc);expect(values['--app-height']).toBe('844px');win.innerHeight=390;win.dispatchEvent(new Event('orientationchange'));expect(values['--app-height']).toBe('390px');win.innerHeight=844;win.dispatchEvent(new Event('pageshow'));expect(values['--app-height']).toBe('844px');editing=true;win.visualViewport.height=400;win.visualViewport.offsetTop=70;win.visualViewport.dispatchEvent(new Event('resize'));expect(values['--app-height']).toBe('400px');editing=false;doc.dispatchEvent(new Event('focusout'));expect(values['--app-height']).toBe('844px');win.visualViewport.scale=2;win.innerHeight=500;win.dispatchEvent(new Event('resize'));expect(values['--app-height']).toBe('844px');}
 finally{vi.clearAllTimers();vi.useRealTimers();}
});
