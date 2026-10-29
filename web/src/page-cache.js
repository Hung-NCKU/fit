// Private, per-session page snapshots. Never persisted to browser storage.
const pages=new Map();let epoch=0;
const copy=data=>structuredClone(data);
export function clearPageCache(){epoch++;pages.clear();}
async function refresh(entry,key){
 if(entry.pending)return entry.pending;
 const generation=entry.generation,started=epoch;
 const pending=Promise.resolve().then(entry.fetcher).then(data=>{
  if(started===epoch && pages.get(key)===entry && entry.generation===generation){entry.data=copy(data);entry.updated=Date.now();}
  return data;
 }).finally(()=>{if(entry.pending===pending)entry.pending=null;});
 entry.pending=pending;return pending;
}
export function loadCachedPage(parts,fetcher,onCached=()=>{}){
 const key=JSON.stringify(parts);let entry=pages.get(key);
 if(!entry){entry={data:undefined,fetcher,generation:0,pending:null,updated:0};pages.set(key,entry);if(pages.size>48)pages.delete(pages.keys().next().value);}
 entry.fetcher=fetcher;
 if(entry.data!==undefined)onCached(copy(entry.data));
 return refresh(entry,key);
}
export function invalidatePageCache(path){
 let affected;
 if(/^\/(meals|workouts|weights)(\/|$)/.test(path))affected=['pet','today','chat',path.split('/')[1]];
 else if(path.startsWith('/expenses'))affected=['ledger'];
 else if(path.startsWith('/profile'))affected=['pet','today','chat'];
 else if(path.startsWith('/pet'))affected=['pet'];
 else if(path.startsWith('/chat'))affected=['chat','today','pet','meals','workouts'];
 else if(['/login','/logout','/guest','/account'].includes(path)){clearPageCache();return;}
 else return;
 for(const [key,entry] of pages){if(!affected.includes(JSON.parse(key)[0]))continue;entry.generation++;entry.data=undefined;entry.pending=null;refresh(entry,key).catch(()=>{});}
}

export function patchCachedPage(parts,update){const entry=pages.get(JSON.stringify(parts));if(!entry || entry.data===undefined)return;entry.generation++;entry.pending=null;entry.data=copy(update(copy(entry.data)));}
