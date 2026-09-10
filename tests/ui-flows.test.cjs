const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {stripTypeScriptTypes}=require('node:module')
const root=path.resolve(__dirname,'..')
function moduleUTS(id) {
 let code=stripTypeScriptTypes(fs.readFileSync(path.join(root,id+'.uts'),'utf8'),{mode:'transform'})
 const names=[]
 code=code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,p)=>`const {${n}}=require(${JSON.stringify(p.replace('@/', ''))});`)
 code=code.replace(/export\s+(function|class|const)\s+(\w+)/g,(_,kind,n)=>{names.push(n);return kind+' '+n})
 const out={};vm.runInNewContext(`(function(require,exports){${code};Object.assign(exports,{${names}})})`,{console,encodeURIComponent})(id=>id==='utils/feedback'?{showFeedback:()=>{}}:moduleUTS(id),out);return out
}
function component(file,props,names) {
 let code=fs.readFileSync(path.join(root,file),'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
 code=stripTypeScriptTypes(code,{mode:'transform'}).replace(/^import .*$/gm,'')
 const events=[],watchers=[]
 const ctx={console,Date,Math,parseInt,isNaN,brand:{primary:'pink'},n:{value:{bgTertiary:'gray',surfacePink:'pink',bgSecondary:'gray',text:'black'}},defineProps:()=>props,withDefaults:p=>p,defineEmits:()=>((...e)=>events.push(e)),ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch:(read,fn)=>watchers.push(fn)}
 const result=vm.runInNewContext(`(function(){${code};return {${names}}})()`,ctx)
 return {...result,events,watchers}
}
test('completed/cancelled/fully paid orders cannot request balance reminder',()=>{
 const {canSetBalanceReminder}=moduleUTS('utils/purchase-reminder')
 for(const paymentStatus of ['COMPLETED','CANCELLED'])assert.equal(canSetBalanceReminder({paymentStatus,totalAmount:100,paidAmount:0}),false)
 assert.equal(canSetBalanceReminder({paymentStatus:'DEPOSIT_PAID',totalAmount:100,paidAmount:100}),false)
 assert.equal(canSetBalanceReminder(null),false)
 assert.equal(canSetBalanceReminder({paymentStatus:'DEPOSIT_PAID',totalAmount:100,paidAmount:20}),true)
})
test('purchase to reminder preserves type and encoded relationship context',()=>{
 const {balanceReminderUrl}=moduleUTS('utils/purchase-reminder')
 const url=balanceReminderUrl({id:'order&1',name:'裙子 & 茶会',deadline:'2026-10-01',productId:'p/1',releaseId:'r+1',wishId:'w?1'})
 const q=new URL(url,'https://test').searchParams
 assert.equal(q.get('type'),'BALANCE');assert.equal(q.get('purchaseId'),'order&1');assert.equal(q.get('productId'),'p/1');assert.equal(q.get('releaseId'),'r+1');assert.equal(q.get('title'),'裙子 & 茶会 尾款')
 const {reminderTypeFromContext}=moduleUTS('utils/reminder-context')
 assert.equal(reminderTypeFromContext(q.get('type'),q.get('purchaseId')),'BALANCE')
 assert.equal(reminderTypeFromContext('',q.get('purchaseId')),'BALANCE')
 assert.equal(reminderTypeFromContext('invalid',''),'CHECKIN')
 assert.equal(reminderTypeFromContext('ARRIVAL','order'),'ARRIVAL')
})
test('product entry rejects missing ID and encodes parameters exactly once',()=>{
 const {productDetailUrl}=moduleUTS('utils/content-navigation')
 assert.equal(productDetailUrl(''), '')
 assert.equal(new URL(productDetailUrl('id&中文/?'),'https://test').searchParams.get('id'),'id&中文/?')
})
test('switch updates thumb and emits intended value once',()=>{
 const props={modelValue:false,disabled:false}
 const c=component('components/v3/AppSwitch.uvue',props,'onToggle, thumbStyle, trackStyle')
 assert.equal(c.thumbStyle.value.left,'5rpx');c.onToggle();assert.deepEqual(c.events[0],['update:modelValue',true])
 props.modelValue=true;assert.equal(c.thumbStyle.value.left,'45rpx');assert.equal(c.trackStyle.value.backgroundColor,'pink')
 c.onToggle();assert.deepEqual(c.events[1],['update:modelValue',false]);props.disabled=true;c.onToggle();assert.equal(c.events.length,2)
})
test('month picker restores current year, crosses year and confirms exact month',()=>{
 const props={visible:false,value:'2026-09'}
 const c=component('components/v3/MonthPicker.uvue',props,'year, selectMonth, close')
 c.watchers[0](true);assert.equal(c.year.value,2026)
 c.year.value=2025;c.selectMonth(12);assert.deepEqual(c.events[0],['change','2025-12']);assert.deepEqual(c.events[1],['update:visible',false])
 c.close(false);assert.equal(c.events.filter(e=>e[0]==='change').length,1)
})
