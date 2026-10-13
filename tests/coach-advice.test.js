import { expect, it } from 'vitest';
import { isGeneralAdvice } from '../server/src/coach.js';
it('一般知識問答可使用無工具流程', () => {
  expect(isGeneralAdvice('運動後可以吃什麼？')).toBe(true);
  expect(isGeneralAdvice('請簡短告訴我運動後可以吃什麼，不要記錄飲食。')).toBe(true);
});
it('個人紀錄與寫入需求保留原本工具流程', () => {
  for (const q of ['今天運動後可以吃什麼？', '運動後我吃了兩顆蛋，幫我記錄', '我剛吃完飯，怎麼增肌？', '幫我修改昨天的飲食', '參考這週紀錄告訴我怎麼減脂']) {
    expect(isGeneralAdvice(q)).toBe(false);
  }
});
