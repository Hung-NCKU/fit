import {it,expect} from 'vitest';import {playPeriod} from '../shared/pet-play-period.js';
it('台灣餐期邊界與凌晨歸屬不受伺服器時區影響',()=>{
 for(const [at,slot,day]of [['2026-10-16T20:59:59Z','dinner','2026-10-16'],['2026-10-16T21:00:00Z','breakfast','2026-10-17'],['2026-10-17T02:59:59Z','breakfast','2026-10-17'],['2026-10-17T03:00:00Z','lunch','2026-10-17'],['2026-10-17T08:59:59Z','lunch','2026-10-17'],['2026-10-17T09:00:00Z','dinner','2026-10-17']]){
 const now=new Date(at),p=playPeriod(now);expect(p.slot).toBe(slot);expect(p.day).toBe(day);expect(Date.parse(p.nextPeriodAt)).toBeGreaterThan(now.getTime());
 }
});
