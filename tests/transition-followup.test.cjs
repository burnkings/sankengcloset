const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {stripTypeScriptTypes}=require('node:module');const path=require('node:path');
const root=path.resolve(__dirname,'..');const src=p=>fs.readFileSync(path.join(root,p),'utf8');
function run(s,c={}){return vm.runInNewContext(stripTypeScriptTypes(s.replace(/^import[\s\S]*?from [^\n]+\n/gm,'').replace(/export /g,'')),c)}
// 2026-10-09：services/mock/*（mock-catalog / comparison-products / comparison-brand）已整体删除
// （用户要求「删除首页的两个假数据和品牌目录的假数据」），下面两条用例随之调整：
//   · 原来第 9 行那条「假货 fixture 与预览链接」用例已删除（它守护的对象不存在了）；
//   · 品牌相关用例不再拼接 comparison-brand（withComparisonBrand 已从 brand-service 摘除）。
const ctx={assert,FeedItem:class{},Brand:class{},RankingItem:class{},ProductImage:class{},ProductVariant:class{},ReleaseEvent:class{},FEED_PRODUCT:'product',deriveCoverUrl:x=>x[0]?.url??'',extractImageUrls:x=>x.map(i=>i.url),encodeQuery:encodeURIComponent,
  // 2026-10-09 评审 P2-2：store 现在从 wish-count 引入了增量同步函数。本测试用「正则剥掉
  // import 行 + vm 求值」的方式加载源码，被剥离的 import 不会自动带进来，所以这里补上桩。
  // 注意这**不是**放松断言：wishCountOf 仍按「服务端基数 + 增量」真实计算，只是增量表为空。
  wishCountOf:(id,n)=>n,clearWishDeltaAfterServerConfirm:()=>{},bumpWishCount:()=>{}};
test('detail URL rejects missing payloads and canonicalizes feed ID',()=>run(src('utils/content-navigation.uts')+`;assert.equal(productDetailUrl(null),'');assert.equal(productDetailUrl('undefined'),'');assert.equal(productDetailUrl('feed_prd_taobao_1'),'/pages/product/detail?id=prd_taobao_1');`,ctx));
// 2026-09-24：brand-service 当前**没有**服务端缓存与并发去重（每次调用都打 /api/v1/brands），
// 旧契约「并发只发 1 次请求」已作废。品牌目录的缓存/去重若要恢复，应在 store 层做（见 GAP 文档待办）。
// 2026-10-09：品牌目录的「固定样例品牌前置」已删除（用户要求删假数据）⇒ 服务端返回空数组时，
// 列表就是**空的**（原来会被 withComparisonBrand 补成 1 条）。断言随之从 1 改成 0。
test('brand list always hits the endpoint (no cache yet) and empty result stays empty',async()=>{let calls=0;await run(src('services/content/brand-service.uts')+`; (async()=>{const a=await Promise.all([listBrands(),listBrands()]);const b=await listBrands();assert.equal(a[0].length,0,'空响应不应被注入样例品牌');assert.equal(b.length,0)})()`,{...ctx,apiGet:async()=>{calls++;return {data:[]}}});assert.equal(calls,3)});
test('failed brand fetch retries instead of caching error',async()=>{let calls=0;await run(src('services/content/brand-service.uts')+`; (async()=>{await assert.rejects(listBrands());await listBrands()})()`,{...ctx,apiGet:async()=>{if(++calls===1)throw Error('offline');return {data:[]}}});assert.equal(calls,2)});
// 2026-10-06：来源标签改为品牌名（products.shop_name 已删，名称只有一个来源）
test('brand product forwards status and price semantics',()=>run(src('services/content/brand-service.uts')+`;const p=mapBrandProduct({id:'p',priceType:'DEPOSIT',saleStatus:'PRE_ORDER',depositCents:9200,fullPriceCents:36800,brandName:'品牌名'});assert.equal(p.priceType,'DEPOSIT');assert.equal(p.saleStatus,'PRE_ORDER');assert.equal(p.depositCents,9200);assert.equal(p.sourceLabel,'品牌名');`,ctx));
test('feedback duration defaults to three seconds and accepts override',()=>{let delays=[];run(src('utils/feedback.uts')+`;showFeedback('保存');showFeedback('长提示',3500)`,{reactive:x=>x,setTimeout:(f,d)=>{delays.push(d);return 1},clearTimeout:()=>{}});assert.deepEqual(delays,[3000,3500])});
// 2026-10-05：首屏加载后会**静默预取其余频道**（消除切频道时的整屏骨架），
// 所以「请求总数」不再是 2。这条用例真正要守的是**切换行为本身**：
// 已缓存的频道不再发请求、列表被正确保留。断言按行为写，别钉死请求条数。
test('channel switching retains pages and invalidates old requests',async()=>{
  const calls=[];
  const s=src('stores/home-feed-store.uts');
  // `calls` 必须挂进 vm 的上下文，否则用例里的断言（在 vm 内执行）看不到它
  await run(s+`; (async()=>{await loadFirstPage();await new Promise(r=>setTimeout(r,30));const afterFirst=calls.length;const first=_state.allItems[0];setChannel('上新');await new Promise(r=>setTimeout(r,0));setChannel('推荐');assert.equal(_state.allItems[0],first);assert.equal(_state.state,'loaded');assert.equal(_state.nextCursor,'next');assert.equal(calls.length,afterFirst,'切换已缓存的频道不应再发请求');assert.ok(channelCache.length>=2)})()`,{...ctx,calls,reactive:x=>x,nextTick:async()=>{},computed:f=>({get value(){return f()}}),setTimeout,usePreferencesStore:()=>({preferences:{pitTypes:[],followedBrands:[],priceRange:''}}),useBlacklistStore:()=>({}),fetchFeedPage:async(c,ch)=>{calls.push(ch);return {items:[{id:ch,entityId:ch}],nextCursor:'next',hasMore:true}}});
  assert.ok(calls.length>=1);
});
