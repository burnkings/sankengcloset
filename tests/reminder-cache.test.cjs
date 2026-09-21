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
const ctx=vm.createContext({Date:{now:()=>now},getCachedAccessToken:()=>token,getRuntimeConfig:()=>({apiBaseUrl:'https://test'}),getCachedRefreshToken:()=>'',saveSessionTokens:()=>{},console,uni:{request:(x)=>{calls++;requests.push(x)}}});
vm.runInContext(source+'\nglobalThis.api={apiGet,apiPost,clearApiReadCache};',ctx);
(async()=>{
 const a=ctx.api.apiGet('/brands/a'),b=ctx.api.apiGet('/brands/a');assert.equal(calls,1);requests.shift().success({statusCode:200,data:{data:[{name:'A'}]}});const [x,y]=await Promise.all([a,b]);x.data[0].name='changed';assert.equal(y.data[0].name,'A');
 await ctx.api.apiGet('/brands/a');assert.equal(calls,1);
 token='b';const c=ctx.api.apiGet('/brands/a');assert.equal(calls,2);requests.shift().success({statusCode:200,data:{data:[]}});await c;
 const write=ctx.api.apiPost('/wishlist',{});requests.shift().success({statusCode:200,data:{data:{}}});await write;
 const d=ctx.api.apiGet('/brands/a');assert.equal(calls,4);requests.shift().fail({errMsg:'offline'});await assert.rejects(d);
 const e=ctx.api.apiGet('/brands/a');assert.equal(calls,5);requests.shift().success({statusCode:200,data:{data:[]}});await e;
 now+=300001;const f=ctx.api.apiGet('/brands/a');assert.equal(calls,6);requests.shift().success({statusCode:200,data:{data:[]}});await f;
 console.log('PASS: 3 Vue templates; API dedupe, clone isolation, account isolation, mutation invalidation, failed request retry, TTL expiry');
})().catch(e=>{console.error(e);process.exitCode=1});
