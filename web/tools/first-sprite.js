/**
 * 從「一整列動物」的 alpha 覆蓋率裡，找出最左邊那一隻的左右邊界。
 *
 * slice-actions.sh 用得到：圖鑑每一列畫了三到四隻，有些（兔子、雪貂、龍貓）
 * 是肩併肩甚至交纏在一起的，連通區域分析會把整列當成同一塊。
 *
 * 但就算黏在一起，兩隻中間還是會「瘦一截」。所以改看每一欄被塗到的高度：
 * 先用空白切成幾塊，再在第一塊裡找波峰之後的谷底當分界。
 * 完全分開的情況谷底剛好是 0，同一套邏輯涵蓋兩種。
 *
 * 讀 stdin：convert ... -alpha extract -threshold 40% -resize Wx1! txt:-
 * 印出：<x0> <寬度>
 */
const FLOOR = 0.06;   // 覆蓋率低於這個就算空白
const MIN_W = 28;     // 比這個窄的不可能是一隻動物，多半是邊緣殘留的細屑

let buf = '';
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => {
  // txt: 的每一行長得像 `12,0: (2.71206,2.71206,2.71206)  #030303  gray(1.06%)`
  //
  // 括號裡的數字會隨 -depth 與縮放變成小數（縮到一列高時是平均值），
  // 分母也不一定是 65535。十六進位那欄永遠是整數，直接讀它最穩。
  const cov = buf.trim().split('\n').slice(1).map((line) => {
    const m = line.match(/#([0-9A-Fa-f]{2})/);
    return m ? parseInt(m[1], 16) / 255 : 0;
  });

  // 結尾一定要換行：bash 的 read 讀到沒有換行的 EOF 會回非零，
  // 呼叫端開了 set -e，整個腳本會安靜地中止。
  const emit = (x, w) => process.stdout.write(`${x} ${w}\n`);

  // 先用空白切成幾塊
  const blobs = [];
  let s = null;
  cov.forEach((v, i) => {
    if (v > FLOOR && s === null) s = i;
    if (v <= FLOOR && s !== null) { blobs.push([s, i - 1]); s = null; }
  });
  if (s !== null) blobs.push([s, cov.length - 1]);

  for (const [a, b] of blobs) {
    // 一塊裡可能黏了好幾隻：找第一個波峰之後的谷底
    let peak = 0;
    let i = a;
    for (; i <= b; i++) {
      if (cov[i] > peak) peak = cov[i];
      if (peak > 0.25 && cov[i] < peak * 0.45) break;
    }
    let end = Math.min(i, b);
    while (end + 1 <= b && cov[end + 1] <= cov[end]) end++;

    const w = end - a + 1;
    // 太窄的是細屑（面板邊框、隔壁露出來的一角），跳過去看下一塊
    if (w >= MIN_W && peak > 0.2) { emit(a, w); return; }
  }

  emit(0, 0);
});
