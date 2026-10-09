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
  let token = '', user = 'guest_local', nextId = 0
  const h = { storage, remote, requests, fail: false, gate: null, response: {data:[],page:{}}, get: null }
  const runtime = {getAccessToken:()=>token,getCachedAccessToken:()=>token,DATA_MODE_REMOTE:'remote',getRuntimeConfig:()=>({mode:'remote'})}
  const api = {
    encodeQuery:encodeURIComponent,apiErrorStatus:e=>e.status ?? 0,apiErrorCode:e=>e.code ?? '',apiErrorRequestId:e=>e.requestId ?? '',
    apiGet:async p=>{ requests.push(p); if(h.get) return h.get(p); if(h.fail) throw Error('offline'); return h.response },
    apiPostAuthorized:async (p,b)=>{ requests.push(['POST',p,b]); if(h.gate) {const g=h.gate;h.gate=null;await g.promise} if(h.postError) throw h.postError; if(h.fail) throw Error('offline'); if(!remote.has(b.productId))remote.set(b.productId,{...b,id:'w'+(++nextId)}); return {data:remote.get(b.productId)} },
    apiDeleteAuthorized:async p=>{requests.push(['DELETE',p]);if(h.fail)throw Error('offline');for(const [id,row]of remote)if(p.endsWith('/'+row.id))remote.delete(id)},
    apiPatchAuthorized:async (p,b)=>{requests.push(['PATCH',p,b]);if(h.fail)throw Error('offline');for(const row of remote.values())if(p.endsWith('/'+row.id))Object.assign(row,b)},
  }
  const stubs = {
    vue:{reactive:x=>x,nextTick:()=>Promise.resolve()},
    '@/config/runtime':runtime,
    '@/services/platform/api-client':api,
    '@/services/user-data/user-data-service':{listWishlistRemote:async()=>{if(h.fail)throw (h.listError??Error('offline'));return [...remote.values()].map(x=>({...x}))}},
    '@/utils/feedback':{showFeedback:()=>{}},
    '@/services/content/product-service':{fetchProductDetail:async(p)=>{h.detailCalls=(h.detailCalls??0)+1;if(h.productError)throw h.productError;if(h.productDetail)return h.productDetail(p);throw Error('offline')}},
    '@/stores/preferences-store':{usePreferencesStore:()=>({preferences:{pitTypes:[],followedBrands:[],priceRange:''}})},
    '@/stores/blacklist-store':{useBlacklistStore:()=>({brands:[],isBlacklisted:()=>false})},
    '@/utils/format':{formatPriceCents:String,formatRelativeTime:String,formatDeadline:String},
    // 注意：不要给 '@/services/mock/mock-catalog' 打桩 —— 它只依赖 domain 类型，可直接执行；
    // 打桩后每加一个导出（listMockProducts / mockDateAfter …）都会让这里过期并误判为失败。
  }
  const context=vm.createContext({console,Map,Set,Date,Math,JSON:Object.assign(Object.create(JSON),{parseArray:JSON.parse}),Error,Promise,uni:{getStorageSync:k=>storage.get(k)??'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),getNetworkType:o=>o.success({networkType:'wifi'})}})
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
  h.load=load;h.loadActual=id=>{delete stubs[id];return load(id)};h.login=()=>{token='real';user='user1';storage.set('v21_session_user_id',user)};
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
// 2026-09-30：「仅在本机使用」（mock 会话）已删除，演示收藏种子随之删除。
// 它曾经塞进 prd_jk_navy_45 / prd_lolita_moon / prd_hanfu_song 三条假收藏，在真实后端全部 404，
// 于是收藏页永远挂着 3 张「已下架」假卡（用户看到的就是「我什么都没收藏，怎么全下架了」）。
test('不再播种任何演示收藏：空收藏就是空',async()=>{
 const h=harness();const f=h.favorites()
 f.reloadFavorite()
 assert.equal(f.favoriteState.favoriteEntries.length,0,'收藏列表只能来自用户自己，不得有 demo 种子')
 assert.equal(f.isFavorite('prd_jk_navy_45'),false)
})
test('detail transport failure does not mark favorite safe to delete',async()=>{
 const h=harness(),f=h.favorites();f.toggleFavorite('A');await f.refreshFavorites()
 assert.equal(f.favoriteState.invalidFavoriteIds.length,0);assert.match(f.favoriteState.favoritesError,/重试/)
})
// 2026-09-28 用户反馈：「有几个已下架可清除失效收藏。按道理就算失效什么的不也应该给用户展示吗」。
// 回归点：冷启动时内存里没有任何商品卡片，已下架收藏**必须照样出现在列表里**（标题取本地收藏条目），
// 而不是整条消失、列表清空后只在页面顶部挂一行「收藏加载失败」。
test('已下架的收藏仍然展示占位卡，不会从列表里消失',async()=>{
 const h=harness();h.login();h.remote.set('A',{id:'w1',productId:'A',title:'某条马面裙',status:'WISH'})
 h.productError=Object.assign(Error('gone'),{status:404})
 const f=h.favorites();await f.refreshFavorites()
 const cards=f.favoriteState.favoriteProducts
 assert.equal(cards.length,1,'已下架收藏必须仍在列表里（这正是用户抱怨消失的那一条）')
 assert.equal(cards[0].entityId,'A')
 assert.equal(cards[0].title,'某条马面裙','标题要取本地收藏条目，不能因为详情 404 就丢')
 assert.equal(cards[0].saleStatus,'ENDED','只有确认下架（404/410）才给已结束状态')
 assert.deepEqual([...f.favoriteState.invalidFavoriteIds],['A'],'确认下架的才进「可清除失效」')
 // 2026-09-30：文案缩短（原来 24 字占满一整行）。「清除失效」这四个字由顶部提示条**右侧的按钮**承载，
 // 不再塞进这句话里；这里改断言「已下架 + 仍保留」这两个必要信息，并保证短。
 assert.match(f.favoriteState.favoritesError,/已下架/)
 assert.match(f.favoriteState.favoritesError,/仍保留/)
 assert.ok(f.favoriteState.favoritesError.length<=16,`提示语要短（当前 ${f.favoriteState.favoritesError.length} 字）`)
 assert.equal(/加载失败/.test(f.favoriteState.favoritesError),false,'已下架是稳定状态，不该报「加载失败」')
})
test('瞬时失败的收藏也给卡片，但不谎报已下架',async()=>{
 const h=harness();h.login();h.remote.set('A',{id:'w1',productId:'A',title:'某条马面裙'})
 const f=h.favorites();await f.refreshFavorites()   // 默认 stub 抛无 status 的错误 ⇒ 瞬时失败
 const cards=f.favoriteState.favoriteProducts
 assert.equal(cards.length,1)
 assert.equal(cards[0].saleStatus,'','拿不到详情时不许猜它是下架，saleStatus 必须留空')
 assert.equal(f.favoriteState.invalidFavoriteIds.length,0,'瞬时失败不能进「可清除失效」，否则用户会误删真收藏')
 assert.match(f.favoriteState.favoritesError,/重试/)
 assert.equal(h.detailCalls,2,'瞬时失败应静默重试一次')
})
test('已登录但列表没拉到：给「检查网络」而不是空态或逐条失败',async()=>{
 const h=harness();h.login();h.fail=true
 const f=h.favorites();await f.refreshFavorites()
 assert.equal(f.favoriteState.favoriteProducts.length,0,'我们并不知道用户收藏了什么，不能凭空数组展示卡片')
 assert.match(f.favoriteState.favoritesError,/检查网络/,'这是整页失败态，必须给「重新加载」的理由')
 assert.equal(f.favoriteState.favoritesLoading,false)
})
// 2026-09-30 用户反馈：「显示是东西下架了，下架的应该也展示」——
// 光有一张没图没价没品牌的空壳不算展示。收藏当刻 / 详情成功时都记快照，下架后用快照把卡片填满。
test('收藏列表拉取失败时带出 requestId（用户能拿它让后端捞日志）',async()=>{
 const h=harness();h.login();h.fail=true
 h.listError=Object.assign(Error('unauthorized'),{status:401,requestId:'req-1lz'})
 const f=h.favorites();await f.refreshFavorites()
 assert.equal(f.favoriteState.favoritesRequestId,'req-1lz')
})

test('下架后用本地快照补齐封面/品牌，卡片不是空壳',async()=>{
 const h=harness();h.login();h.remote.set('A',{id:'w1',productId:'A',title:'某条马面裙'})
 h.productDetail=p=>({item:{id:p,entityId:p,feedType:'product',title:'某条马面裙',brandName:'重回汉唐',coverUrl:'https://img/a.jpg',price:32000,priceType:'FULL',pitType:'HANFU'},currentRelease:null})
 const f=h.favorites();await f.refreshFavorites()
 assert.ok(f.favoriteSnapshotOf('A'),'详情拉成功时要记快照，否则下架后没东西可显示')
 h.productDetail=null;h.productError=Object.assign(Error('gone'),{status:404})
 await f.refreshFavorites()
 const card=f.favoriteState.favoriteProducts[0]
 assert.equal(card.coverUrl,'https://img/a.jpg','下架后封面必须来自快照')
 assert.equal(card.brandName,'重回汉唐')
 assert.equal(card.pitType,'HANFU')
 assert.equal(card.saleStatus,'ENDED')
 // 2026-09-30 文案缩短：保留「仍保留」的安抚语义即可（原来 24 字占满整行）
 assert.match(f.favoriteState.favoritesError,/仍保留/,'已下架的文案要说清「还留着」，不能像报错')
})
test('收藏当刻传商品卡：从未拉过详情的商品下架后也有完整卡片',async()=>{
 const h=harness();h.login()
 h.productError=Object.assign(Error('gone'),{status:404})
 const f=h.favorites()
 const item={id:'A',entityId:'A',feedType:'product',title:'某条马面裙',brandName:'重回汉唐',coverUrl:'https://img/a.jpg',price:32000,priceType:'FULL',pitType:'HANFU'}
 f.toggleFavorite('A',item.title,'',item)
 await f.refreshFavorites()
 const card=f.favoriteState.favoriteProducts[0]
 assert.equal(card.coverUrl,'https://img/a.jpg','收藏当刻的快照就是下架后唯一的展示来源')
 assert.equal(card.title,'某条马面裙')
 assert.equal(card.saleStatus,'ENDED')
})
test('游客无收藏是空态而非失败态',async()=>{
 const h=harness()
 const f=h.favorites();await f.refreshFavorites()
 assert.equal(f.favoriteState.favoritesError,'','游客没有收藏不该报错——「不需要远端」算成功')
 assert.equal(f.favoriteState.favoriteProducts.length,0)
})
// 2026-10-09：首页「固定前置 2 条展示样例」已删除（用户要求「删除首页的两个假数据」），
// comparison-products/mock-catalog 模块与 SHOW_COMPARISON_PRODUCTS 开关一并移除。
// 新契约：首页**只**返回远端真实商品，不注入任何样例；远端失败必须真实失败（禁止伪造商品）。
test('推荐首页只返回远端真实商品、不注入样例、远端失败直接 reject',async()=>{
 const h=harness(),s=h.load('@/services/content/feed-service')
 h.response={data:[{id:'A',entityId:'A',title:'远端商品A'}]}
 const first=await s.fetchFeedPage('')
 assert.equal(first.items.length,1,'不该再有 2 条样例被前置')
 assert.equal(first.items[0].title,'远端商品A')
 const rest=await s.fetchFeedPage('cursor')
 assert.equal(rest.items.length,1);assert.equal(rest.items[0].title,'远端商品A')
 h.fail=true;await assert.rejects(s.fetchFeedPage(''));await assert.rejects(s.fetchFeedPage('cursor'))
})
test('ranking uses independent favorite endpoint and never invents growth',async()=>{
 const h=harness(),s=h.load('@/services/content/ranking-service');h.response={data:[{entityId:'A',favoriteCount:99}]}
 const rows=await s.fetchRankingRemote('favorite');assert.equal(h.requests[0],'/api/v1/ranking?tab=favorite');assert.equal(rows[0].favoriteGrowth,0)
 // TTL 内（60s）二次调用命中缓存、不发请求，因此不会 reject；绕过缓存才应把网络错误抛出来
 assert.equal((await s.fetchRankingRemote('favorite')).length,1)
 h.fail=true;await assert.rejects(s.fetchRankingRemote('favorite',true))
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
 // 首页会前置 2 条展示样例，因此不能再用 allItems[0] 断言刷新结果；改为断言「刷新后的数据在、旧错误没覆盖」
 assert.equal(s.errorMessage,'');assert.ok(s.allItems.some((i)=>i.id==='new'));assert.equal(s.isLoadingMore,false)
})


test('ranking maps viewCount independently from favoriteCount',async()=>{
 const h=harness();h.response={data:[{entityId:'p1',viewCount:17,favoriteCount:3}]}
 const rows=await h.load('@/services/content/ranking-service').fetchRankingRemote('hot')
 assert.equal(rows[0].viewCount,17);assert.equal(rows[0].favoriteCount,3)
})
test('product detail carries variant styles into the rendered model',async()=>{
 const h=harness();h.response={data:{id:'p1',variants:[{id:'v1',styleName:'JSK'},{id:'v2',styleName:'OP'}]}}
 const detail=await h.loadActual('@/services/content/product-service').fetchProductDetail('p1')
 assert.equal(detail.variants[0].styleName,'JSK');assert.equal(detail.variants[1].styleName,'OP')
})
test('wardrobe silhouette survives storage, edit, favorite toggle and category change',()=>{
 const h=harness(),repo=h.load('@/domain/repositories/wardrobe-repo')
 const {WardrobeItem,WardrobeUpdateData}=h.load('@/domain/wardrobe-item')
 const item=new WardrobeItem();item.category='HANFU';item.silhouette='明制';item.style='马面裙'
 repo.add(item);assert.equal(repo.getById(item.id).silhouette,'明制')
 const data=new WardrobeUpdateData();data.silhouette='宋制';data.style='下裙'
 assert.equal(repo.update(item.id,data),true);repo.toggleFavorite(item.id)
 assert.equal(repo.getById(item.id).silhouette,'宋制')
 data.category='JK';data.silhouette='';repo.update(item.id,data)
 assert.equal(repo.getById(item.id).silhouette,'')
})
