第二批：逐格動畫圖 PNG 去背素材

來源：使用者提供的 10 寵物逐格動畫總覽圖，依原圖逐格裁切並以 Alpha 透明去除背景，沒有重新生成角色。高解析 portrait 則直接沿用使用者先前上傳的 10 張個別角色 PNG。
內含：每隻動物 1 張大頭像 portrait、1 張 4欄×5列 Sprite Sheet（每格96×96）、動作個別 PNG、animations.json。
動作列：idle / walk / eat / sleep / play。遊玩列部分是 3 幅原圖，最後一格保留透明空白。
說明：來源本身動作小圖為低解析度示意稿，部分部件接近相鄰圖片，Alpha 自動分離可能有殘影或局部裁切；進正式 App 前建議人工檢查與修圖。
使用 Phaser：load.spritesheet(name, path, {frameWidth:96, frameHeight:96}); 對應 action row 的起始 index 為 row*4。
