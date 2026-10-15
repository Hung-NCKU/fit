# 寵物插畫風肌群模特（目前版本 v2）

2026-10-15，依使用者要求，以內建 imagegen 重畫成與現有寵物一致的奶油杏色、暖棕輪廓線與柔和陰影。頭部留白，沒有五官與頭髮；身體為中性模型，沒有內褲、衣物、乳頭或性器官。肌肉以簡化弧形分區呈現。

- 正面原圖：`anatomy-front-pet-v2-source.png`。
- 背面原圖：`anatomy-back-pet-v2-source.png`。
- 網站輸出：`web/public/training/anatomy-front-pet-v2.webp`、`anatomy-back-pet-v2.webp`。
- 完整提示詞：[pet-style-v2-prompts.json](pet-style-v2-prompts.json)。
- 風格參考：`web/public/pets/act-dog-idle.webp`；v1 人體圖只用作站姿、比例與部位座標參考。

透明原圖等比例轉為寬 768 的 WebP，保留 alpha，沒有額外重繪或程式去背。互動層以杏橘色半透明覆蓋選中區域；背景配合奶油色介面，原有正背面切換、肌群點選與細分重點保留。

以下保留 v1 製作紀錄，方便學習與版本比較；網站已使用 v2。

---

# 灰白肌群模特素材製作紀錄

2026-10-15，使用內建 imagegen 生成，未使用 CLI/API 金鑰。使用者參考圖僅提供灰白肌肉線條及紅色訓練部位的視覺方向；構圖改為直立正／背面，方便點選。

先生成雙人正背面風格稿作參考，再分別生成兩張單人直立圖。風格稿未作為網站素材，避免相鄰手掌影響互動圖。選定原圖保存在本資料夾：

- `anatomy-front-source.png`：1024 × 1536，RGBA。
- `anatomy-back-source.png`：1024 × 1536，RGBA。

用 sharp 等比例輸出寬 768 的 WebP，quality 88、alphaQuality 100，保留 alpha。輸出為 `web/public/training/anatomy-front-v1.webp` 及 `anatomy-back-v1.webp`。未用去背演算法重畫或修改角色。透明區的 RGB 可能仍含暗色值，使用 alpha 正常合成到白底時不會顯示黑底。

`MuscleMap.vue` 以同一張圖作 alpha mask，在 1024 × 1536 座標上套互動路徑：未選取透明，選取紅色半透明，保留原本肌纖維。胸部細分及背部重點另有區域標示。菱形肌等深層肌群是投影位置示意，不宣稱 AI 圖片等於醫療解剖圖。

## 正面最終提示詞

Create ONLY ONE standing FRONT / ANTERIOR full-body muscular anatomy model, matching the grayscale anatomy rendering and person in the supplied reference. Reference is style and anatomy only. Transparent background. Neutral standing A pose with arms slightly separated from torso and both palms forward. Exactly one human, one head, two arms, two hands, two legs, five fingers per hand. Full figure head to feet with generous clear margin on both sides of both hands and feet. Scientific exercise instruction illustration with finely drawn black fascia boundaries and gray directional muscle fibers, softly shaded grayscale muscles, natural athletic human proportions, matte charcoal brief trunks; no other clothing or shoes. No labels, text, arrows, weights, gym equipment, floor shadows or red markings. A TALL portrait canvas preferred. Center head at x50% y5%, shoulders y21%, waist y44%, hips y51%, knees y69%, feet y95%. Avoid cropped or overlapping hands. Muscles should be easily distinguishable but accurate, not a robot or geometric mannequin.

## 背面最終提示詞

Create ONLY ONE standing BACK / POSTERIOR full-body muscular anatomy model, matching the grayscale anatomy rendering and person in the supplied reference. Reference is style and anatomy only. Transparent background. Neutral standing A pose with arms slightly separated from torso. Exactly one human, one head, two arms, two hands, two legs, five fingers per hand. Full figure head to feet with generous clear margin on both sides of both hands and feet. Scientific exercise instruction illustration with finely drawn black fascia boundaries and gray directional muscle fibers, softly shaded grayscale muscles, natural athletic human proportions, matte charcoal brief trunks; no shoes. Show trapezius, posterior deltoids, rotator-cuff area, broad lats, triceps, hamstrings and calves clearly. Do not make deep muscles appear as if superficial. No labels, text, arrows, weights, gym equipment, floor shadows or red markings. A TALL portrait canvas preferred. Center head at x50% y5%, shoulders y21%, waist y44%, hips y51%, knees y69%, feet y95%. Avoid cropped or overlapping hands. Muscles should be easily distinguishable but accurate, not a robot or geometric mannequin.
