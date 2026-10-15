# iPhone 推播與載入改善

## 本次發現

正式伺服器曾記錄推播 HTTP 403；部署環境的 VAPID subject 使用 `mailto:...@localhost`。這與 Apple 拒絕本機識別的已知情況一致，見 [web-push 官方文件](https://github.com/web-push-libs/web-push) 與 [Apple Web Push 錯誤說明](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)。本次只將部署 VAPID subject 改成實際公開網站 URL，保留金鑰對及現有訂閱；沒有自動向真實手機發送測試。

原本「立刻測試一次」會發送給帳號所有裝置，其他裝置成功可能掩蓋 iPhone 失敗。現在客戶端傳入本機訂閱 endpoint，後端先限制在登入者自己的訂閱中選取；任意網址或其他帳號 endpoint 不會被發送。

## 手機測試流程

1. 關閉並重新從 iPhone 主畫面開啟健身養寵，點鈴鐺。檢查通知權限顯示「已允許」。
2. 點「測試手機顯示」：由本機 service worker 顯示通知，不經伺服器。如果沒有出現，查看通知中心、系統允許通知、專注模式及通知摘要。
3. 點「立刻測試一次」：只測目前裝置。成功文字只表示推播服務接受請求，沒有宣稱手機已收到。失敗顯示例如 `403 BadJwtToken`，不再當成未訂閱或籠統成功。
4. 訂閱失效可關閉後重新開啟；「重新連線」會將現有本機訂閱重新保存到登入帳號。

iOS 16.4 以上的主畫面 Web App 可接收通知，參考 [WebKit 官方說明](https://webkit.org/blog/13878/)。服務未就緒會在 12 秒後說明，不讓開關永久等待。系統拒絕時顯示 iPhone 設定路徑。`404/410` 仍移除失效訂閱；其餘失敗保留訂閱並回傳安全狀態碼，日誌不列完整 endpoint 或推播金鑰。

## 載入改善

- Vite 建置使用 Node 內建 gzip / Brotli 為 JS、CSS 產生預壓縮檔；現有 Fastify `preCompressed:true` 可直接傳送，不需要每次請求壓縮。當次主程式約 251 KB，Brotli 約 76 KB，減少約七成傳輸量；實際載入時間仍受網路、圖片、裝置與伺服器影響。
- 飲食日期與當天餐點改由 `/api/meals/page` 一次回傳，首次／新增刪除後重新載入由兩趟網路改一趟。保留最近有紀錄日期的預設，並以請求序號避免切使用者後舊結果覆蓋新結果。
- 教練歷史、服務狀態、模型與起始計畫改成同時載入，不等前一批回來才抓計畫。
- API 仍不使用共享快取，個人資料不寫入 service worker 的靜態快取。

自動化以假的推播服務回應驗證選取本機、跨帳號隔離、403 診斷及失效訂閱清理；未以這些模擬測試宣稱 iPhone 真正送達。瀏覽器另檢查手機通知面板、手機本機顯示呼叫、單次飲食請求及壓縮傳輸標頭。
