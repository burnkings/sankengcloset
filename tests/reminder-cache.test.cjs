const fs=require('fs'), vm=require('vm'), assert=require('assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const path=require('path');
const root=path.resolve(__dirname, '..') + '/';
const compiler=require('@vue/compiler-sfc');
for(const p of ['pages/reminder/edit.uvue','pages/product/detail.uvue','pages/discover/index.uvue']){
 const {descriptor,errors}=compiler.parse(fs.readFileSync(root+p,'utf8'));assert.equal(errors.length,0);
 const c=compiler.compileTemplate({source:descriptor.template.content,filename:p,id:p,compilerOptions:{expressionPlugins:['typescript']}});
 assert.deepEqual(c.errors,[]);stripTypeScriptTypes(descriptor.scriptSetup.content,{mode:'transform'});
}
let token='a', calls=0, now=100000;const requests=[];
let source=fs.readFileSync(root+'services/platform/api-client.uts','utf8').replace(/^import .*$/mg,'').replace(/export /g,'');
source=stripTypeScriptTypes(source,{mode:'transform'});
// 目录长缓存层（services/platform/catalog-cache.uts）整体打桩：
// 本用例只验证**进程内**缓存的语义（去重 / 克隆隔离 / 换账号作废 / 写操作作废 / TTL 过期），
// 磁盘长缓存另有专门用例，这里把它当作不存在，免得两套缓存叠在一起看不清是谁在生效。
// catalogMemoryMs 仍返回真实策略值（品牌目录 30 分钟）——否则 /brands/a 会掉到默认 30s，
// 最后一步的「TTL 过期」就退化成在测 30 秒档，而不是长缓存窗口。
const ctx=vm.createContext({
  Date:{now:()=>now},
  getCachedAccessToken:()=>token,
  getRuntimeConfig:()=>({apiBaseUrl:'https://test'}),
  getCachedRefreshToken:()=>'',saveSessionTokens:()=>{},
  catalogMemoryMs:(p)=>p.indexOf('/brands')>=0?1800000:0,
  isCatalogPath:()=>false,
  isCatalogFresh:()=>false,
  readCatalog:()=>null,
  writeCatalog:()=>{},
  clearCatalogCache:()=>{},
  console,uni:{request:(x)=>{calls++;requests.push(x)}}});
vm.runInContext(source+'\nglobalThis.api={apiGet,apiPost,clearApiReadCache};',ctx);
(async()=>{
 const a=ctx.api.apiGet('/brands/a'),b=ctx.api.apiGet('/brands/a');assert.equal(calls,1);requests.shift().success({statusCode:200,data:{data:[{name:'A'}]}});const [x,y]=await Promise.all([a,b]);x.data[0].name='changed';assert.equal(y.data[0].name,'A');
 await ctx.api.apiGet('/brands/a');assert.equal(calls,1);
 token='b';const c=ctx.api.apiGet('/brands/a');assert.equal(calls,2);requests.shift().success({statusCode:200,data:{data:[]}});await c;
 const write=ctx.api.apiPost('/wishlist',{});requests.shift().success({statusCode:200,data:{data:{}}});await write;
 const d=ctx.api.apiGet('/brands/a');assert.equal(calls,4);requests.shift().fail({errMsg:'offline'});await assert.rejects(d);
 const e=ctx.api.apiGet('/brands/a');assert.equal(calls,5);requests.shift().success({statusCode:200,data:{data:[]}});await e;
 // 品牌目录属「低频内容」，走 30 分钟长缓存窗口（此前是写死的 5 分钟）：
 // +5 分钟仍然命中缓存，+30 分钟才过期。
 now+=300001;await ctx.api.apiGet('/brands/a');assert.equal(calls,5);
 now+=1800001;const f=ctx.api.apiGet('/brands/a');assert.equal(calls,6);requests.shift().success({statusCode:200,data:{data:[]}});await f;
 console.log('PASS: 3 Vue templates; API dedupe, clone isolation, account isolation, mutation invalidation, failed request retry, catalog 30min TTL expiry');
})().catch(e=>{console.error(e);process.exitCode=1});
