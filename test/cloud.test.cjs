const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),{tmpdir}=require('node:os');
const {createLoader}=require('./helpers.cjs');const root=path.join(__dirname,'..');
const {PosDatabase}=createLoader(root)('src/main/database.ts');
const session=(extra={})=>({accessToken:'test-access',refreshToken:'test-refresh',voucherSequence:20,shop:{id:'shop-a',name:'Shop A',tier:'cloud_pro',premiumUntil:'2099-01-01'},device:{id:'device-a',name:'Desktop',deviceCode:'B',role:'owner'},...extra});
function setup(t,{connected=true,initial=session(),fetcher}={}){
 const dir=fs.mkdtempSync(path.join(tmpdir(),'pos-cloud-')),db=new PosDatabase(':memory:');
 if(connected)fs.writeFileSync(path.join(dir,'cloud-session.bin'),JSON.stringify(initial));
 const electron={app:{getPath:()=>dir,getVersion:()=> 'test'},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()}};
 const old=global.fetch,calls=[];
 global.fetch=async(url,options)=>{
  const endpoint=new URL(url).pathname.replace(/^\/api/,''),body=options.body?JSON.parse(options.body):undefined;
  calls.push({endpoint,body,options});
  const value=await fetcher?.(endpoint,body,options) ?? (endpoint==='/auth/refresh'?initial:endpoint==='/sync/push'?{accepted:body.changes.map((c,i)=>({table:c.table,id:c.id,serverSeq:i+1})),skipped:[]}:endpoint.startsWith('/sync/pull')?{changes:[],nextSince:0,hasMore:false}:endpoint==='/cash-drawers/active'?{drawer:{id:'drawer-main',name:'Main drawer',isDefault:true,activeSessionId:null},session:null}:{});
  return {ok:!value.httpStatus,status:value.httpStatus??200,json:async()=>value};
 };
 const {CloudService}=createLoader(root,{electron})('src/main/cloud.ts');const cloud=new CloudService(db);
 t.after(()=>{global.fetch=old;db.sqlite.close();fs.rmSync(dir,{recursive:true,force:true});});return {cloud,db,dir,calls};
}
test('concurrent sync shares one refresh and pull',async t=>{
 let release;const barrier=new Promise(r=>release=r);
 const {cloud,calls}=setup(t,{fetcher:async e=>{if(e==='/auth/refresh'){await barrier;return session();}}});
 const first=cloud.syncNow(),second=cloud.syncNow();assert.equal(first,second);release();assert.equal((await first).status,'idle');assert.equal(calls.filter(c=>c.endpoint==='/auth/refresh').length,1);assert.equal(calls.filter(c=>c.endpoint.startsWith('/sync/pull')).length,1);
});
test('401 refreshes once and retries the protected endpoint',async t=>{
 let tries=0;const {cloud,calls}=setup(t,{fetcher:async e=>e==='/auth/devices'?(++tries===1?{httpStatus:401,message:'expired'}:{devices:[]}):undefined});
 assert.deepEqual(await cloud.devices(),[]);assert.equal(tries,2);assert.equal(calls.filter(c=>c.endpoint==='/auth/refresh').length,1);
});
test('offline plus pauses sync while preserving paid local features',async t=>{
 const {cloud,db,calls}=setup(t,{initial:session({shop:{id:'shop-a',name:'A',tier:'offline_plus',premiumUntil:'2099-01-01'}})});
 assert.equal((await cloud.syncNow()).status,'paused');assert.equal(calls.length,0);assert.equal(db.capabilities().expenses,true);
});
test('rejected rows remain pending without an endless resend loop',async t=>{
 const {cloud,db,calls}=setup(t,{fetcher:async(e,body)=>e==='/sync/push'?{accepted:[],skipped:body.changes.map(c=>({table:c.table,id:c.id,reason:'invalid'}))}:undefined});
 db.saveCustomer({name:'Pending'});const state=await cloud.syncNow();assert.equal(state.status,'error');assert.equal(state.pending,1);assert.equal(calls.filter(c=>c.endpoint==='/sync/push').length,1);
});
test('cloud drawer cannot close while cash activity is still unsynced',async t=>{
 const {cloud,db,calls}=setup(t,{fetcher:async(e,body)=>e==='/sync/push'?{accepted:[],skipped:body.changes.map(c=>({table:c.table,id:c.id,reason:'invalid'}))}:undefined});
 db.saveCustomer({name:'Pending'});
 await assert.rejects(cloud.closeCashDrawer('drawer-main','session-main',0),/Sync all pending cash activity/);
 assert.equal(calls.some(call=>call.endpoint==='/cash-drawers/drawer-main/close'),false);
});
test('server voucher floor is adopted before a local sale',t=>{
 const {db}=setup(t);assert.equal(db.nextVoucher(),'B-000021');
});
test('device limit exposes a replacement ticket without uploading local data',async t=>{
 const limit={status:'device_limit',limit:1,devices:[{id:'old',name:'Old'}],loginTicket:'ticket'};
 const {cloud,calls}=setup(t,{connected:false,fetcher:async()=>limit});assert.deepEqual(await cloud.login({phone:'09',password:'test',deviceName:'Desktop'}),limit);assert.equal(cloud.state().deviceId,null);assert.equal(calls.length,1);
});
test('shop switch waits for a fully synced previous shop before replacing local data',async t=>{
 const next=session({shop:{id:'shop-b',name:'B',tier:'cloud_pro',premiumUntil:'2099-01-01'}});
 const {cloud,db,dir,calls}=setup(t,{connected:false,fetcher:async e=>['/auth/login','/auth/refresh'].includes(e)?next:undefined});
 db.setState('data.shopId','shop-a');db.saveCustomer({name:'Unsynced A'});
 const result=await cloud.login({phone:'09',password:'test',deviceName:'Desktop'});assert.equal(result.status,'shop_switch');assert.equal(calls.length,1);assert.equal(db.listCustomers().length,1);
 await assert.rejects(cloud.confirmSwitch(),/Sync the previous shop/);assert.equal(db.listCustomers().length,1);
 db.sqlite.exec('UPDATE customers SET dirty=0');
 await cloud.confirmSwitch();assert.equal(db.listCustomers().length,0);assert.equal(db.getState('data.shopId'),'shop-b');
});
test('offline disconnect clears credentials but preserves the shop and previous device identity',async t=>{
 const {cloud,db,dir}=setup(t,{fetcher:async()=>{throw new TypeError('offline');}});db.saveCustomer({name:'Kept'});await cloud.signOut();assert.equal(cloud.state().status,'signed_out');assert.equal(db.listCustomers().length,1);assert.equal(db.getState('device.previousId'),'device-a');assert.equal(db.getState('data.shopId'),'shop-a');assert.equal(fs.existsSync(path.join(dir,'cloud-session.bin')),false);
});
test('cashier pairing includes previousDeviceId and caches the role',async t=>{
 const next=session({device:{id:'cashier',name:'Cashier',deviceCode:'C',role:'cashier'}});
 const {cloud,db,calls}=setup(t,{connected:false,fetcher:async e=>['/auth/devices/join','/auth/refresh'].includes(e)?next:undefined});db.setState('device.previousId','old');await cloud.join({pairingCode:'ABC123',deviceName:'Counter'});assert.equal(calls[0].body.previousDeviceId,'old');assert.equal(db.capabilities().owner,false);
});
test('billing refreshes cached features and payment slips keep API shapes',async t=>{
 const slip={id:'s',reference:'REF1',tier:'offline_plus',method:'kbzpay',amount:100,status:'pending'};
 const {cloud,db,calls}=setup(t,{fetcher:async(e,body)=>e==='/billing/slips'?(body?slip:{slips:[slip]}):e==='/billing/status'?{tier:'offline_plus',premiumUntil:'2099-01-01'}:undefined});
 assert.deepEqual(await cloud.listSlips(),[slip]);assert.deepEqual(await cloud.submitSlip({tier:'offline_plus',method:'kbzpay',amount:100,reference:'REF1'}),slip);await cloud.billingStatus();assert.equal(db.capabilities().effectivePlan,'offline_plus');assert.equal(db.capabilities().cloud,false);assert.equal(calls.find(c=>c.endpoint==='/billing/slips'&&c.body).body.reference,'REF1');
});
test('cancelled shop switch never replaces local rows',async t=>{
 const {cloud,db}=setup(t,{connected:false,fetcher:async e=>e==='/auth/login'?session({shop:{id:'other',name:'Other',tier:'free',premiumUntil:null}}):undefined});db.setState('data.shopId','shop-a');db.saveCustomer({name:'Kept'});await cloud.login({phone:'09',password:'test',deviceName:'Desktop'});await cloud.cancelSwitch();assert.equal(db.listCustomers()[0].name,'Kept');assert.equal(cloud.state().deviceId,null);
});
