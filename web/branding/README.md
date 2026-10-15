# 健身養寵品牌素材

- 原始圖：[fitness-puppy-source.png](fitness-puppy-source.png)。
- 使用內建 imagegen，以原本 [奶油色垂耳狗](../public/pets/dog-pet.webp) 作角色與畫風參考。
- 最終提示詞與參考路徑：[icon-generation.json](icon-generation.json)。重點是粗咖啡線條、簡單色塊、圓潤短腿、四隻爪子，以及雙前爪拿一支藍色啞鈴；不要寫實毛髮或大眼睛。
- `node web/tools/make-icons.mjs` 只解碼、縮放與編碼已核對的 PNG，不重新繪製角色。不需額外圖像套件。
- 輸出在 `web/public/`：192、512、180 像素圖示、32 像素網站圖示，以及縮至 80% 並延展背景邊緣的 Android maskable 圖示。
- 網站色票在 [style.css](../src/style.css)：米白背景 `#fff4df`、奶油卡片 `#fffaf0`、杏色 `#f7e5c8`、咖啡文字 `#38291f`、暖橄欖綠 `#4e653d`。圖示中的啞鈴保留藍色，介面按鈕與選中狀態採用橄欖綠。

重新產生圖示後執行 `npm run build`。換圖須同步更新圖示 URL 版本與 Service Worker 快取版本；保留 manifest 的 `id: "/"`，維持原本的 App 身分。
