# Martina 的兇兇惡霸犬「小霸」

2026-10-20：新增同系列水彩、深棕描邊的灰白惡霸犬。所有影格保留兇狠皺眉、瞪眼、露牙表情。12 張透明影格分成吠叫、向右走路、拎起各四張；朝左移動由角色層翻轉。

原圖：`web/public/pets/special-bully-v1.png`。工具模式：內建 image_gen，先以原小狗素材作風格參考生成，再編輯成兇狠版。沒有使用 API 金鑰，也沒有程式重畫圖片。`web/tools/analyze-special-bully.py` 只測量 alpha 連通區，產生 `special-bully-layout.json` 的裁切和基線，避免相鄰影格露出。

元件 `BullyFrames.vue` 每次顯示一張影格；減少動態偏好時固定首張。`PetActor.vue` 每 4.5 秒交替顯示「汪汪！去吃飯！」和「汪汪！去運動！」，包括未選取時；暫停或拎起時收起氣泡。這是文字吠叫，不播放聲音。可跟其他寵物一樣遊蕩、點選、拎起和拖移。

`grantMartinaBully('martina')` 是伺服器管理函式，沒有公開 API。以固定 purchase_id 在交易中插入，重跑不重複、不扣代幣、不切換原本選取的寵物；初始位置只寫入一次。商城保留原十種，此角色沒有既有服裝。正式發送前先備份 Martina SQLite。

## 生成提示

初次：Generate a new American Bully sprite atlas matching the reference dog's warm hand-drawn kawaii watercolor/gouache style, thick dark-brown outlines. Stocky blue-gray and white muscular short dog, natural rose-fold ears, white chest and blaze. Twelve isolated sprites in four columns by three rows, transparent background: four idle/barking frames, four right-facing walking frames with exactly four legs, four gently lifted scruff pickup frames with hand above. No clothes, labels, backgrounds or floating marks. Generous transparent gutters.

最終編輯：Edit this sprite atlas. Preserve EXACTLY the same American Bully identity, stocky blue-gray and white coat, white blaze, broad body, thick dark-brown outlines, soft warm watercolor-gouache shading, same 12-sprite 4-column x 3-row layout, same three pose rows, transparent alpha, similar framing and scale. The user says the dog's expression must be VERY FIERCE. Change ALL 12 faces from friendly cute smiles into distinctly ferocious angry bossy expressions: heavy sharply downward-slanted V brows, narrowed glaring eyes, wrinkled snout, tense cheeks, snarling mouth showing small sharp canine teeth. Row1 alternates closed snarling lip and wide-open angry barking mouth; NO happy smiling, NO happy closed crescent eyes, NO heart or blush. Row2 four walking right-facing frames with angry glaring eyes and snarl, exactly FOUR legs/paws per character, never extra feet. Row3 four dangling pickup frames, hand overhead stays, dog is grumpy and angry even when lifted, blinking is a stern narrowed glare, no cheerful expressions. Still an appealing stylized cartoon pet matching original game art, not photoreal, no wounds or blood. Keep natural rose-fold ears, sturdy muscular physique, cute proportional size. No written text, speech bubbles, background, detached motion lines, floating marks, or shadows outside the figure. Maintain generous transparent gutters between sprites, no cross-cell overlaps.
