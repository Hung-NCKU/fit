# 五種寵物背景 v2

使用內建 ImageGen 生成清晰的 16:9 插畫場景，統一柔和配色、寵物比例及中央留白。
五种環境：小房間、庭院、海邊、健身房、太空艙；沒有直接畫入動物，角色由播放器疊加。

原稿 `*-source.png`；公開素材 `web/public/pets/scene-*-v2.webp` 使用品質 88 WebP。
舊版背景保留，既有商城物品 ID、價格與使用者的擁有／裝備狀態不變。

生成 prompt 共通部分：Generate a crisp wide panoramic 16:9 background-only illustration for a chibi pet app. Warm dark-brown outlines, soft pastel colors, shallow front-view perspective. Keep the lower 45% ground unobstructed and the center empty. Place furnishings only in the outer quarters and upper half. No animals, people, text, UI, dense details or photographic textures. Pets stand at 88% image height, centered. Keep bottom ground visible when viewport crops margins.

場景細節：

- room：奶油色牆、圓窗、小木架、植栽、寵物床及矮抓柱，淺木地板與淡色地毯。
- garden：矮木柵欄、樹與邊緣花盆，中央留出平坦草坪。
- beach：淡沙地、遠處平靜海面，兩側小陽傘、棕櫚與石頭。
- gym：鼠尾草色牆、軟木／橡膠地板、兩側低矮啞鈴架、墊子及踏階。
- space：柔和紫白太空艙、圓形地球窗、邊緣控制台與小寵物床，中央留出地板。

`PetView.vue` 用 ResizeObserver 量測場景實際高度，寵物比例及地面落點一起縮放，手機和桌機都保持自然比例。
