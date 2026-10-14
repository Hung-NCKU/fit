import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true,
    // 專案放在 /mnt/d（Windows 磁碟），WSL 收不到 inotify 事件，必須輪詢才有熱更新
    watch: { usePolling: true, interval: 300 },
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: {input: {
    app:fileURLToPath(new URL('./index.html',import.meta.url)),
    wearPreview:fileURLToPath(new URL('./wear-preview.html',import.meta.url)),
  }} },
});
