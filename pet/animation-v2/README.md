# 寵物連續動作素材 v2

使用內建 ImageGen，以使用者指定的 `pet/素材/圖鑑2/02_寵物角色` 十種角色為造型依據。
已完成：貓、狗、兔、倉鼠、天竺鼠、刺蝟、貂、鸚鵡、烏龜、龍貓。每種五套四幀動作，共 200 幀。
貓與龍貓沿用已核對相同造型的 v2；其餘八種直接引用圖鑑2高解析原圖生成。
原始素材保留，不覆盖舊版動作圖。

## 生成規格與 prompt

Use case: identity-preserve. Create a production animation sprite sheet preserving
the provided pet's colors, markings, rounded chibi illustration style, warm brown
outline and tail. Remove the held seed/flower. Exactly 4 columns by 5 rows on a
truly transparent background. Equal square cells, fixed character scale, horizontal
center, foot baseline and padding. No labels, grid lines, scene or shadows.
Each row contains four successive frames of the same character: idle breathing
and blink; side-facing-right alternating walk strides; eating with a fixed small
bowl and gentle head dip; curled sleeping with subtle breathing; playful anticipation,
small hop, landing and settle. Keep identity and proportions consistent; small,
soothing motions, whole body and tail visible, no overlapping cells.

貓額外保留橘白毛色、條紋及額頭月牙；龍貓保留灰毛、白肚子、粉紅大耳與蓬鬆尾巴。

## 檔案與播放

- `*-source.png`：十種 ImageGen 透明原稿。
- `web/public/pets/animated-*-v2.webp`：品質 92 WebP，alpha 品質 100，保留透明邊緣。
- `PetFrames.vue`：以 SVG viewBox 定位每幀的真實輪廓，不改動原圖像素。
- `web/tools/analyze-pet-frames.py`：僅讀 alpha 連通區域，輸出 `pet-frame-layout.json`；腳底統一至畫布的 88%，跳躍保留離地幅度。
- 順序：idle / walk / eat / sleep / play。每列四格。
- idle 大部分時間保留開眼，偶爾眨眼；一般走路約每秒五格，烏龜、刺蝟、天竺鼠與鸚鵡較慢；轉向先停頓。
- 遵守 prefers-reduced-motion；原素材作為其他物種與未支援姿勢的後備。

針對格線邊界追加的編輯 prompt：Keep the same identity, colors, poses and 4-by-5 frame order. Uniformly shrink every character to the middle 70% of its cell width, keep a fixed ground baseline, and leave transparent gutters at every row and column border. Never let tail, whiskers or ears overlap the neighboring cell. No text, grid or shadows.

新增物種時，先產生動作圖、重新分析幀定位，再加入 PetView 的 animatedPet 清單。

`generation-manifest.json` 保存新素材的參考來源與生成 prompt；`build-pet-preview.py` 生成十種動物及五種背景的互動預覽。
播放器依 `pet-frame-layout.json` 是否包含該物種選用動畫，不再限制只有貓和龍貓。
