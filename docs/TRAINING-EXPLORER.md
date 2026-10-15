# 圖選訓練：部位、影片與逐組記錄

## 使用流程

1. 訓練頁點正面或背面人體圖上的肌群，也能使用文字部位按鈕。
2. 選擇部位與器材，再點動作。
3. 點影片預覽播放 YouTube 教學；無法內嵌時可直接開 YouTube，也可搜尋中文教學。
4. 在下方記錄各組實際重量與次數；棒式改記秒數。RPE 可選填，0 代表未評分。
5. 完成後勾選該組，儲存時只保存勾選的組數。已勾選的組可以取消勾選後修改。
6. 歷史紀錄可展開每組數據，點編輯可重新調整。未勾選的組不會被當成完成的訓練。

介面使用奶油杏色與橄欖綠；標頭將品牌與「目前分頁 · 使用者」分成兩行。

## 參考與影片來源

- [MuscleWiki](https://musclewiki.com/zh-cn)：參考點選肌群後探索對應動作的流程。
- [Anatomy 3D Atlas](https://anatomy3datlas.com/)：參考以身體區域組織資訊的方式。
- [DAREBEE](https://darebee.com/)：參考清楚的動作探索與訓練呈現。

人體圖是本專案自行繪製的互動 SVG、採正面與背面二維示意；沒有匯入這三個網站的圖片、影片檔案或 3D 模型。

目前的 [動作目錄](../shared/workout-catalog.json) 包含十個部位、十五個動作。每支影片保留 YouTube ID、影片標題與頻道名稱，於 2026-10-15 使用 YouTube 官方 oEmbed 核對標題與頻道；影片可能日後調整公開狀態或嵌入設定，頁面持續提供原站連結。

教學來源為 [ScottHermanFitness](https://www.youtube.com/@ScottHermanFitness) 與 [CrossFit](https://www.youtube.com/@CrossFit)。影片目前是英文；「找中文教學」是依動作名稱搜尋，沒有宣稱影片提供中文字幕。播放採 YouTube 隱私加強模式與使用者點選後載入，保留原播放器與來源，不下載第三方影片。

## 程式與資料

- [MuscleMap.vue](../web/src/components/MuscleMap.vue)：SVG 肌群點選、正背面切換、鍵盤與文字按鈕。
- [WorkoutExplorer.vue](../web/src/components/WorkoutExplorer.vue)：動作與器材篩選、影片、逐組記錄、分頁草稿。
- [WorkoutsView.vue](../web/src/views/WorkoutsView.vue)：保留手動新增、歷史與跨使用者唯讀。
- [workout-sets.js](../server/src/workout-sets.js)：每組資料驗證與統計 SQL。
- [records.js](../server/src/records.js)：儲存、修改、總量與日期統計。

既有 `workouts` 表增加 `set_details` JSON 欄位，舊紀錄預設為空陣列，依原本的組數、次數、重量顯示與計算。新紀錄每組保存 `weight_kg`、`reps`、`duration_s`、`rpe`。次數與時間擇一，不把計時動作當成重複次數。

總訓練量依 `Σ(每組重量 × 每組次數)` 計算；有明細時不再以第一組乘總組數推估。總時間由每組秒數換算分鐘，今日、區間圖與教練紀錄共用同一份資料。舊版 API 若明確修改組數、次數、重量或時間摘要，會以新的摘要取代逐組明細，避免保留互相矛盾的數據。

每次新存檔使用固定 `requestId`。訓練紀錄與 `workout_save_requests` 收據在同一交易保存；重送同一識別碼不重複新增，變更內容會拒絕，已刪除的紀錄也不會被重送復活。草稿與尚未確認的請求暫存在目前使用者的 sessionStorage，重新開啟同一分頁可以接續；清除瀏覽資料會移除草稿。

測試使用拋棄式資料庫，涵蓋不同重量、計時、舊資料相容、編輯、跨帳號唯讀、無效數據、交易回滾與重送。網站介面另外檢查手機與桌機的點選、影片載入、逐組操作及標頭排版。
