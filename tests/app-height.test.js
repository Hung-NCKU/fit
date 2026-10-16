import {it,expect,vi} from 'vitest';
import {installAppHeight} from '../web/src/app-height.js';
it('首次、恢復、旋轉與鍵盤關閉會重算高度，捏合縮放不改版面高度',()=>{
 vi.useFakeTimers();const win=new EventTarget(),doc=new EventTarget(),values={};let editing=false;
 Object.assign(win,{innerHeight:844,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},visualViewport:Object.assign(new EventTarget(),{height:780,offsetTop:0,scale:1})});
 Object.assign(doc,{hidden:false,activeElement:{matches:()=>editing},documentElement:{style:{setProperty:(key,value)=>{values[key]=value;}}}});
 try{installAppHeight(win,doc);expect(values['--app-height']).toBe('844px');win.innerHeight=390;win.dispatchEvent(new Event('orientationchange'));expect(values['--app-height']).toBe('390px');win.innerHeight=844;win.dispatchEvent(new Event('pageshow'));expect(values['--app-height']).toBe('844px');editing=true;win.visualViewport.height=400;win.visualViewport.offsetTop=70;win.visualViewport.dispatchEvent(new Event('resize'));expect(values['--app-height']).toBe('400px');editing=false;doc.dispatchEvent(new Event('focusout'));expect(values['--app-height']).toBe('844px');win.visualViewport.scale=2;win.innerHeight=500;win.dispatchEvent(new Event('resize'));expect(values['--app-height']).toBe('844px');}
 finally{vi.clearAllTimers();vi.useRealTimers();}
});
it('iOS keyboard pan is a separate offset, scroll events update it, and innerHeight shrink does not lose keyboard state',()=>{
 vi.useFakeTimers();const win=new EventTarget(),doc=new EventTarget(),values={},flags={};let editing=false;
 Object.assign(win,{innerHeight:844,navigator:{userAgent:'iPhone',standalone:true},scrollY:0,setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},visualViewport:Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1})});
 Object.assign(doc,{hidden:false,activeElement:{matches:()=>editing},documentElement:{classList:{toggle:(k,v)=>flags[k]=v},style:{setProperty:(k,v)=>values[k]=v}}});
 try{installAppHeight(win,doc);editing=true;win.innerHeight=400;win.visualViewport.height=400;win.visualViewport.offsetTop=70;win.visualViewport.dispatchEvent(new Event('resize'));expect(flags['app-keyboard']).toBe(true);expect(values['--app-height']).toBe('400px');expect(values['--app-viewport-top']).toBe('70px');win.visualViewport.offsetTop=90;win.visualViewport.dispatchEvent(new Event('scroll'));expect(values['--app-viewport-top']).toBe('90px');editing=false;win.innerHeight=844;win.visualViewport.height=844;doc.dispatchEvent(new Event('focusout'));expect(flags['app-keyboard']).toBe(false);expect(values['--app-viewport-top']).toBe('0px');expect(values['--app-height']).toBe('844px');}
 finally{vi.clearAllTimers();vi.useRealTimers();}
});
