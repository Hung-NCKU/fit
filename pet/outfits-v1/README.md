# 完整寵物套裝素材

十種寵物各三套，每套透明 PNG 包含 4 欄 × 3 列，分別是 idle、walk、pickup 的四幀，共 360 幀。

詳細學習流程請看 [寵物套裝製作教學](../../docs/PET-OUTFIT-MAKING-OF.md)：提示詞、圖集定位、Vue 動畫、商城整合、舊商品相容、人工審圖、測試與部署／Push。

- `generation-manifest.json`：最初生成的完整提示詞與來源。
- `dog-2-anatomy-fix.json`：骨頭探險多腳問題的後續修正紀錄。
- `outfit-dog-2-source.png`：目前保存的是修正版；舊圖可在 Git 歷史查看。
- 網站用 WebP 在 `web/public/pets/outfits-v1/`；定位由 `web/tools/analyze-outfits.py` 產生。

圖片使用內建 imagegen 生成；分析程式只讀取圖片，不能驗證角色的肢體或穿著是否正確。
