const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {stripTypeScriptTypes}=require('node:module');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const run=(s,ctx)=>vm.runInNewContext(stripTypeScriptTypes(s.replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')),ctx);
test('ranking caches by tab, deduplicates requests and explicit refresh bypasses TTL',async()=>{let calls=0;await run(read('services/content/ranking-service.uts')+`; (async()=>{await Promise.all([fetchRankingRemote('hot'),fetchRankingRemote('hot')]);await fetchRankingRemote('hot');assert.equal(calls(),1);await fetchRankingRemote('new');assert.equal(calls(),2);await fetchRankingRemote('hot',true);assert.equal(calls(),3);assert.equal(peekRanking('hot').length,1)})()`,{assert,RankingItem:class{},encodeQuery:encodeURIComponent,calls:()=>calls,apiGet:async()=>{calls++;return {data:[{entityId:'p'}]}}})});
test('ranking expiry (1h window) fetches again, failure retains previous rows and can retry',async()=>{let now=1000,calls=0;await run(read('services/content/ranking-service.uts')+`; (async()=>{await fetchRankingRemote('hot');advance();await assert.rejects(fetchRankingRemote('hot'));assert.equal(peekRanking('hot')[0].entityId,'p');await fetchRankingRemote('hot')})()`,{assert,Date:{now:()=>now},advance:()=>now+=61*60*1000,RankingItem:class{},encodeQuery:encodeURIComponent,apiGet:async()=>{if(++calls===2)throw Error('offline');return {data:[{entityId:'p'}]}}});assert.equal(calls,3)});
// 2026-10-09：品牌目录的「固定样例品牌前置」已删除（用户要求删假数据），
// comparison-brand.uts 模块与 withComparisonBrand() 一并移除。这里改为守护**新契约**：
// brand-service 不再往真实品牌里注入任何样例，返回多少就是多少、也不改顺序。
test('brand list passes through real brands without injecting a sample brand',async()=>{
  const rows=[{id:'real1'},{id:'real2'}];
  const s=read('services/content/brand-service.uts');
  assert.ok(!/withComparisonBrand|COMPARISON_BRAND_ID/.test(s),'brand-service 不应再引用已删除的样例品牌');
  const out=await run(s+`; (async()=>{const items=await listBrands();assert.equal(items.length,2);assert.equal(items[0].id,'real1');assert.equal(items[1].id,'real2')})()`,{assert,Brand:class{},apiGet:async()=>({data:rows})});
  return out;
});
test('favorite date identifies actual selected date purpose',()=>{const s=read('pages/favorites/index.uvue');const a=s.indexOf('function favoriteReleaseText('),b=s.indexOf('/** 提醒按钮',a);let rel={releaseType:'reservation',endAt:'2026-09-28',balanceDueAt:'2026-10-08',startAt:''};let status='WISH';run(s.slice(a,b)+`;assert.equal(favoriteReleaseText({entityId:'p'}),'9月28日截定');setStatus();assert.equal(favoriteReleaseText({entityId:'p'}),'10月8日尾款');`,{assert,library:{favoriteReleaseOf:()=>rel,favoriteStatusOf:()=>status},setStatus:()=>status='WAIT_BALANCE',reminderDateFor:(r,s)=>s==='WAIT_BALANCE'?r.balanceDueAt:r.endAt,shortReleaseDate:d=>d==='2026-10-08'?'10月8日':'9月28日'})});
