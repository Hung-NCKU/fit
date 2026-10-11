import { defineConfig } from 'vitest/config';

// 測試既有模組，不載入伺服器、不啟動推播或 Gemini，也不寫正式資料庫。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    clearMocks: true,
    restoreMocks: true,
  },
});
