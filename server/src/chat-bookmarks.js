import {getDb} from './db.js';
const bad=message=>Object.assign(new Error(message),{status:400});
export function questionBookmarks(userId,before=null){
 if(before!==null && (!Number.isSafeInteger(Number(before)) || Number(before)<=0))throw bad('書籤分頁無效');
 const db=getDb(userId),rows=before===null ? db.prepare("SELECT id,substr(content,1,100) AS preview,created_at FROM chat_messages WHERE role='user' ORDER BY id DESC LIMIT 101").all() : db.prepare("SELECT id,substr(content,1,100) AS preview,created_at FROM chat_messages WHERE role='user' AND id<? ORDER BY id DESC LIMIT 101").all(Number(before));
 const items=rows.slice(0,100);return {items,hasMore:rows.length>100,nextBefore:rows.length>100?items.at(-1).id:null};
}
export function questionContext(userId,id){
 const value=Number(id);if(!Number.isSafeInteger(value)||value<=0)throw bad('問題編號無效');
 const db=getDb(userId);if(!db.prepare("SELECT id FROM chat_messages WHERE id=? AND role='user'").get(value))throw Object.assign(new Error('找不到這個問題，可能已清除對話'),{status:404});
 const before=db.prepare('SELECT * FROM chat_messages WHERE id<=? ORDER BY id DESC LIMIT 16').all(value).reverse();
 const after=db.prepare('SELECT * FROM chat_messages WHERE id>? ORDER BY id LIMIT 24').all(value);
 return [...before,...after].map(row=>({...row,actions:JSON.parse(row.actions || '[]')}));
}
