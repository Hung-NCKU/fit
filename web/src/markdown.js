/**
 * 極簡 markdown：**粗體**、標題、清單、換行。
 *
 * 模型回話幾乎一定會夾 Markdown，不轉的話畫面上就是一堆星號。不引整套
 * markdown 套件是因為只需要這幾種，而且先把 & < > escape 掉，v-html 才安全。
 *
 * 教練頁與煮飯頁的小幫手共用這一份——兩邊是同一個模型，輸出長得一樣。
 */
export function render(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,6}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<span class="li">• $1</span>')
    .replace(/^\s*(\d+)\.\s+(.+)$/gm, '<span class="li">$1. $2</span>')
    .replace(/\n/g, '<br>');
}
