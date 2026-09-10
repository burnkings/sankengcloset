const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const root = path.resolve(__dirname, '..')
const tick = () => new Promise(resolve => setImmediate(resolve))
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject} }
// Executes the actual UTS modules after erasing types. Only platform/network dependencies are replaced.
function harness() {
  const storage = new Map(), cache = new Map(), remote = new Map(), requests = []
  let token = '', mock = false, user = 'guest_local', nextId = 0
  const h = { storage, remote, requests, fail: false, gate: null, response: {data:[],page:{}}, get: null }
  const runtime = {isLocalMockSession:()=>mock,getAccessToken:()=>token,getCachedAccessToken:()=>token,DATA_MODE_REMOTE:'remote',getRuntimeConfig:()=>({mode:'remote'})}
  const api = {
    encodeQuery:encodeURIComponent,apiErrorStatus:e=>e.status ?? 0,
    apiGet:async p=>{ requests.push(p); if(h.get) return h.get(p); if(h.fail) throw Error('offline'); return h.response },
    apiPostAuthorized:async (p,b)=>{ requests.push(['POST',p,b]); if(h.gate) {const g=h.gate;h.gate=null;await g.promise} if(h.postError) throw h.postError; if(h.fail) throw Error('offline'); if(!remote.has(b.productId))remote.set(b.productId,{...b,id:'w'+(++nextId)}); return {data:remote.get(b.productId)} },
    apiDeleteAuthorized:async p=>{requests.push(['DELETE',p]);if(h.fail)throw Error('offline');for(const [id,row]of remote)if(p.endsWith('/'+row.id))remote.delete(id)},
    apiPatchAuthorized:async (p,b)=>{requests.push(['PATCH',p,b]);if(h.fail)throw Error('offline');for(const row of remote.values())if(p.endsWith('/'+row.id))Object.assign(row,b)},
  }
  const stubs = {
    vue:{reactive:x=>x,nextTick:()=>Promise.resolve()},
    '@/config/runtime':runtime,
    '@/services/platform/api-client':api,
    '@/services/user-data/user-data-service':{listWishlistRemote:async()=>{if(h.fail)throw Error('offline');return [...remote.values()].map(x=>({...x}))}},
    '@/utils/feedback':{showFeedback:()=>{}},
    '@/services/content/product-service':{fetchProductDetail:async()=>{throw Error('offline')}},
    '@/stores/preferences-store':{usePreferencesStore:()=>({preferences:{pitTypes:[],followedBrands:[],priceRange:''}})},
    '@/stores/blacklist-store':{useBlacklistStore:()=>({brands:[],isBlacklisted:()=>false})},
    '@/utils/format':{formatPriceCents:String,formatRelativeTime:String,formatDeadline:String},
    '@/services/mock/mock-catalog':{filterMockFeed:()=>[{id:'demo',category:'JK'}],listMockRanking:()=>[{entityId:'demo'}]},
  }
  const context=vm.createContext({console,Map,Set,Date,Math,JSON,Error,Promise,uni:{getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getNetworkType:o=>o.success({networkType:'wifi'})}})
  function load(id) {
    if(stubs[id])return stubs[id]
    if(cache.has(id))return cache.get(id)
    const file=path.join(root,id.replace(/^@\//,'')+'.uts')
    let code=stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'transform'})
    const exports=[]
    code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,src)=>`const {${names.replace(/\s+as\s+/g, ": ")}} = require(${JSON.stringify(src)});`)
    code=code.replace(/export\s+(async\s+)?(function|class|const|let)\s+(\w+)/g,(_,a,b,n)=>{exports.push(n);return `${a??''}${b} ${n}`})
    const result={};cache.set(id,result)
    vm.runInContext(`(function(require,exports){${code}\nObject.assign(exports,{${exports.join(',')}})})`,context,{filename:file})(load,result)
    return result
  }
  h.load=load;h.login=()=>{token='real';user='user1';storage.set('v21_session_user_id',user)};h.demo=()=>{mock=true};h.real=()=>{mock=false};
  h.favorites=()=>load('@/stores/favorite-store');h.queue=()=>load('@/services/sync/local-sync-queue')
  return h
}
test('A/B favorites persist through delayed A and sync both remote IDs',async()=>{
 const h=harness();h.login();const f=h.favorites(),g=deferred();h.gate=g
 f.toggleFavorite('A','Alpha','release-A');await tick();f.toggleFavorite('B','Beta');g.resolve()
 await h.queue().flushLocalOperations();await f.refreshRemoteFavorites()
 assert.equal(h.remote.size,2);assert.ok(f.favoriteEntryOf('A').itemId);assert.ok(f.favoriteEntryOf('B').itemId)
 assert.equal(h.remote.get('A').releaseId,'release-A');assert.equal(h.queue().readPendingOperations().length,0)
})
test('add then cancel during POST resolves to absent, never resurrects',async()=>{
 const h=harness();h.login();const f=h.favorites(),g=deferred();h.gate=g
 f.toggleFavorite('A');await tick();f.toggleFavorite('A');g.resolve()
 await h.queue().flushLocalOperations();await f.refreshRemoteFavorites()
 assert.equal(h.remote.has('A'),false);assert.equal(f.isFavorite('A'),false)
})
test('add cancel add serializes to one remote favorite',async()=>{
 const h=harness();h.login();const f=h.favorites(),g=deferred();h.gate=g
 f.toggleFavorite('A');await tick();f.toggleFavorite('A');f.toggleFavorite('A');g.resolve()
 await h.queue().flushLocalOperations();await f.refreshRemoteFavorites()
 assert.equal(h.remote.size,1);assert.ok(f.favoriteEntryOf('A').itemId)
})
test('failed A cannot be skipped by cancellation or lose independently queued B',async()=>{
 const h=harness();h.login();h.fail=true;const f=h.favorites()
 f.toggleFavorite('A');f.toggleFavorite('B');f.toggleFavorite('A');await h.queue().flushLocalOperations()
 assert.equal(h.queue().readPendingOperations().length,3)
 h.fail=false;await h.queue().flushLocalOperations();await f.refreshRemoteFavorites()
 assert.equal(h.remote.has('A'),false);assert.equal(h.remote.has('B'),true)
})
test('guest login replays favorite and status, preserves release and fills ID',async()=>{
 const h=harness(),f=h.favorites();f.toggleFavorite('A','Alpha','release-A');f.updateFavoriteStatus('A','WANT')
 await h.queue().flushLocalOperations();assert.equal(h.remote.size,0)
 h.login();await h.queue().flushLocalOperations();await f.refreshRemoteFavorites()
 assert.equal(f.favoriteStatusOf('A'),'WANT');assert.equal(h.remote.get('A').releaseId,'release-A');assert.ok(f.favoriteEntryOf('A').itemId)
})
test('pending deletion is not restored by remote snapshot',async()=>{
 const h=harness(),f=h.favorites();h.login();h.remote.set('A',{id:'w1',productId:'A',status:'WISH'})
 await f.refreshRemoteFavorites();h.fail=true;f.toggleFavorite('A');await h.queue().flushLocalOperations();h.fail=false
 await f.refreshRemoteFavorites();assert.equal(f.isFavorite('A'),false)
})
test('pending status wins over server WISH snapshot',async()=>{
 const h=harness(),f=h.favorites();h.login();h.remote.set('A',{id:'w1',productId:'A',status:'WISH'})
 await f.refreshRemoteFavorites();h.fail=true;f.updateFavoriteStatus('A','WANT');await h.queue().flushLocalOperations();h.fail=false
 await f.refreshRemoteFavorites();assert.equal(f.favoriteStatusOf('A'),'WANT')
})
test('demo favorites neither enter sync queue nor real favorite storage',async()=>{
 const h=harness();h.demo();const f=h.favorites();f.toggleFavorite('demo');assert.equal(h.queue().readPendingOperations().length,0)
 h.real();f.reloadFavorite();assert.equal(f.isFavorite('demo'),false)
})
test('detail transport failure does not mark favorite safe to delete',async()=>{
 const h=harness(),f=h.favorites();f.toggleFavorite('A');await f.refreshFavorites()
 assert.equal(f.favoriteState.invalidFavoriteIds.length,0);assert.match(f.favoriteState.favoritesError,/重试/)
})
test('real feed empty remains empty, failure rejects, demo never calls network',async()=>{
 const h=harness(),s=h.load('@/services/content/feed-service');assert.equal((await s.fetchFeedPage('')).items.length,0)
 h.fail=true;await assert.rejects(s.fetchFeedPage(''));await assert.rejects(s.fetchFeedPage('cursor'))
 h.demo();const count=h.requests.length;assert.equal((await s.fetchFeedPage('')).items[0].id,'demo');assert.equal(h.requests.length,count)
})
test('ranking uses independent favorite endpoint and never invents growth',async()=>{
 const h=harness(),s=h.load('@/services/content/ranking-service');h.response={data:[{entityId:'A',favoriteCount:99}]}
 const rows=await s.fetchRankingRemote('favorite');assert.equal(h.requests[0],'/api/v1/ranking?tab=favorite');assert.equal(rows[0].favoriteGrowth,0)
 h.fail=true;await assert.rejects(s.fetchRankingRemote('favorite'))
})
test('home pagination failure preserves cursor/items and retry fetches same page',async()=>{
 const h=harness();h.response={data:[{id:'A',entityId:'A'}],page:{nextCursor:'page2',hasMore:true}}
 const store=h.load('@/stores/home-feed-store').useHomeFeedStore();await store.loadFirstPage()
 h.fail=true;await store.loadMore();assert.equal(store.hasMore,true);assert.match(store.errorMessage,/offline/)
 h.fail=false;h.response={data:[{id:'B',entityId:'B'}],page:{nextCursor:'',hasMore:false}};await store.loadMore()
 assert.equal(store.hasMore,false);assert.equal(store.errorMessage,'');assert.equal(h.requests.filter(x=>typeof x==='string'&&x.includes('cursor=page2')).length,2)
})
test('401 keeps original and newly appended operations; concurrent flush is single flight',async()=>{
 const h=harness();h.login();const q=h.queue(),g=deferred();h.gate=g;h.postError=Object.assign(Error('expired'),{status:401})
 q.enqueueLocalOperation('user1','favorite','A','upsert',JSON.stringify({productId:'A'}))
 const first=q.flushLocalOperations();assert.equal(q.flushLocalOperations(),first);await tick()
 q.enqueueLocalOperation('user1','favorite','B','upsert',JSON.stringify({productId:'B'}));g.resolve()
 await assert.rejects(first,/expired/);assert.equal(q.readPendingOperations().length,2)
 h.postError=null;await q.flushLocalOperations();assert.equal(h.remote.size,2)
})
test('other account pending operations stay queued and never replay to current user',async()=>{
 const h=harness();h.login();const q=h.queue();q.enqueueLocalOperation('other','favorite','private','upsert','{}')
 q.enqueueLocalOperation('user1','favorite','mine','upsert','{}');await q.flushLocalOperations()
 assert.equal(h.remote.has('private'),false);assert.equal(h.remote.has('mine'),true);assert.equal(q.readPendingOperations().length,1)
})
test('late pagination error cannot overwrite a refreshed channel',async()=>{
 const h=harness();h.response={data:[{id:'A'}],page:{nextCursor:'old',hasMore:true}}
 const s=h.load('@/stores/home-feed-store').useHomeFeedStore();await s.loadFirstPage()
 const g=deferred();h.get=p=>p.includes('cursor=old')?g.promise:Promise.resolve({data:[{id:'new'}],page:{hasMore:false}})
 const old=s.loadMore();await s.loadFirstPage();g.reject(Error('old error'));await old
 assert.equal(s.errorMessage,'');assert.equal(s.allItems[0].id,'new');assert.equal(s.isLoadingMore,false)
})
