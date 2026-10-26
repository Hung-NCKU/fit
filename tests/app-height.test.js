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
it('iOS standalone uses independent CSS viewport height when innerHeight omits 59px',()=>{
 vi.useFakeTimers();const win=new EventTarget(),doc=new EventTarget(),values={},flags={};let measured=844,editing=false,created=0;
 const probe={style:{},setAttribute:()=>{},getBoundingClientRect:()=>({height:measured})};
 Object.assign(win,{innerHeight:785,navigator:{userAgent:'iPhone',standalone:true},CSS:{supports:()=>true},setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},visualViewport:Object.assign(new EventTarget(),{height:785,scale:1,offsetTop:0})});
 Object.assign(doc,{hidden:false,activeElement:{matches:()=>editing},createElement:()=>{created++;return probe;},body:{appendChild:()=>{}},documentElement:{style:{setProperty:(k,v)=>values[k]=v},classList:{toggle:(k,v)=>flags[k]=v}}});
 try{
  installAppHeight(win,doc);expect(values['--app-height']).toBe('844px');expect(probe.style.cssText).toContain('100dvh');expect(created).toBe(1);
  editing=true;win.innerHeight=400;win.visualViewport.height=400;win.visualViewport.offsetTop=70;doc.dispatchEvent(new Event('focusin'));expect(values['--app-height']).toBe('400px');expect(flags['app-keyboard']).toBe(true);expect(values['--app-viewport-top']).toBe('70px');
  editing=false;win.innerHeight=785;win.visualViewport.height=785;doc.dispatchEvent(new Event('focusout'));expect(values['--app-height']).toBe('844px');expect(values['--app-viewport-top']).toBe('0px');
  measured=390;win.innerHeight=369;win.visualViewport.height=369;win.dispatchEvent(new Event('orientationchange'));expect(values['--app-height']).toBe('390px');expect(created).toBe(1);
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
it('Safari browser and desktop do not use standalone full-screen measurements',()=>{
 vi.useFakeTimers();const win=new EventTarget(),doc=new EventTarget(),values={};
 Object.assign(win,{innerHeight:700,navigator:{userAgent:'iPhone',standalone:false},matchMedia:()=>({matches:false}),setTimeout,clearTimeout,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},visualViewport:Object.assign(new EventTarget(),{height:650,scale:1})});
 Object.assign(doc,{activeElement:{matches:()=>false},createElement:()=>{throw Error('Should not measure standalone viewport');},documentElement:{style:{setProperty:(k,v)=>values[k]=v}}});
 try{installAppHeight(win,doc);expect(values['--app-height']).toBe('700px');win.innerHeight=720;win.dispatchEvent(new Event('resize'));expect(values['--app-height']).toBe('720px');}
 finally{vi.clearAllTimers();vi.useRealTimers();}
});
