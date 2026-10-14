# 裝飾新版素材

以 `商品_1` 到 `商品_10` 的品項風格與圖鑑2、圖鑑3商城清單為準，透過內建 image_gen 重繪 141 件裝飾，改善低解析度、白邊、裁切不完整與環境風格不一致的問題。

十張透明 PNG 原稿保留於本資料夾；提示詞、來源與商品識別碼對應保存在 `generation-manifest.json`。原始商品圖與價格保留，不影響已購買紀錄。

網頁採用 `web/public/pets/decor-v2/*.webp`（q92、alpha q100），每件 SVG 顯示範圍由 `web/tools/analyze-decor-atlases.py` 讀取透明輪廓產生 `web/src/decor-art-layout.json`。分析程式不修改圖片像素；重繪與修補由 image_gen 完成。

`RoomDecor.vue` 依家具、植物、玩具與餐具的類型設定不同顯示比例，拖曳後以環境寬高百分比儲存位置；同一件已購買商品可收起後再次放回，不重複扣幣。
