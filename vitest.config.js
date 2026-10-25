import { defineConfig } from 'vitest/config';

// 測試既有模組，不載入伺服器、不啟動推播或 Gemini，也不寫正式資料庫。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    clearMocks: true,
    restoreMocks: true,
    // 測試檔變多之後（一檔一個 worker，啟動各約 0.9 秒），beforeAll 裡建 SQLite
    // 的時間會被機器競爭拉長，預設 10 秒會零星逾時——而且每次紅的檔案都不一樣。
    // 單獨跑每一支都過，所以這不是邏輯問題，是啟動擠在一起。
    hookTimeout: 30000,
    testTimeout: 20000,
  },
});
