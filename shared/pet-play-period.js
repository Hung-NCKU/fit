// Meals are reminders, not meal logging requirements. A play day runs 05:00–next 05:00 Taipei.
export function playPeriod(now=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`,hour=Number(parts.hour);
 const shift=n=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 const slot=hour>=5&&hour<11?'breakfast':hour>=11&&hour<17?'lunch':'dinner';
 const next=hour<5?date+'T05:00:00+08:00':hour<11?date+'T11:00:00+08:00':hour<17?date+'T17:00:00+08:00':shift(1)+'T05:00:00+08:00';
 return {day:hour<5?shift(-1):date,slot,label:{breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}[slot],amount:slot==='dinner'?4:3,nextPeriodAt:next};
}
