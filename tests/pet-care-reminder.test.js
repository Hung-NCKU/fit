import {it,expect} from 'vitest';
import {careReminder} from '../shared/pet-care-reminder.js';
const good={mood:70,fullness:40,interactions:0,interactionLimit:5};
it('數值足夠或沒有照顧資料時不提醒',()=>{expect(careReminder(good)).toBe('');expect(careReminder(null)).toBe('');});
it('低心情邀請陪玩或運動，額度用完只邀請運動',()=>{expect(careReminder({...good,mood:69})).toContain('陪我玩');const capped=careReminder({...good,mood:50,interactions:5});expect(capped).toContain('去運動');expect(capped).not.toContain('陪我玩');});
it('低飽足度提醒主人吃飯，兩者偏低會合併',()=>{expect(careReminder({...good,fullness:39})).toContain('該吃飯了');const both=careReminder({...good,mood:40,fullness:0});expect(both).toContain('該吃飯了');expect(both).toContain('去運動');});
