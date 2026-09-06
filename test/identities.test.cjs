const assert=require('node:assert/strict'),{test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createLoader}=require('./helpers.cjs');
const {PosDatabase}=createLoader(path.join(__dirname,'..'))('src/main/database.ts');
const method=(id,extra={})=>({table:'payment_methods',id,name:'Cash',code:'cash',isActive:1,updatedAt:'2026-01-01',serverSeq:1,...extra});
const level=(id,extra={})=>({table:'price_levels',id,name:'Retail',isDefault:1,updatedAt:'2026-01-01',serverSeq:2,...extra});
const tier=(id,priceLevelId,bulkPrice)=>({table:'bulk_pricing',id,productId:'p',minQuantity:3,priceLevelId,bulkPrice,updatedAt:'2026-01-01',serverSeq:3});
const active=(db,table)=>db.sqlite.prepare('SELECT * FROM '+table+' WHERE deletedAt IS NULL').all();
function setup(t){const db=new PosDatabase(':memory:');t.after(()=>db.sqlite.close());return db;}
test('same payment codes merge without modifying historical payments, and replay stays merged',t=>{
 const db=setup(t);db.sqlite.exec("INSERT INTO payments (id,updatedAt,amount,methodCode,methodName,paidAt) VALUES ('p','2026-01-01',50,'cash','Old name','2026-01-01')");
 const before=db.sqlite.prepare('SELECT * FROM payments').all();
 db.applyPulled([method('a',{isActive:0}),method('b'),method('c',{code:'kbzpay'})]);
 assert.deepEqual(active(db,'payment_methods').map(r=>r.id),['a','c']);assert.equal(active(db,'payment_methods')[0].isActive,1);
 assert.deepEqual(db.sqlite.prepare('SELECT * FROM payments').all(),before);
 db.sqlite.exec('UPDATE payment_methods SET dirty=0');db.applyPulled([method('b',{updatedAt:'2099-01-01',serverSeq:99})]);
 assert.equal(active(db,'payment_methods').length,2);assert.ok(db.getState('identity.backup.payment_methods.b'));
});
test('Retail merges and repairs late price tiers, sale references and the saved cart',t=>{
 const db=setup(t);db.sqlite.exec("INSERT INTO sales (id,updatedAt,voucherId,soldAt,priceLevelId) VALUES ('s','2026-01-01','A-1','2026-01-01','old-retail')");
 db.setState('cart.draft',JSON.stringify({entries:[],priceLevelId:'old-retail',note:'keep'}));db.applyPulled([level('old-retail')]);db.applyPulled([tier('t','old-retail',90)]);
 assert.equal(active(db,'price_levels').filter(r=>r.isDefault).length,1);assert.equal(active(db,'bulk_pricing')[0].priceLevelId,'level-retail');assert.equal(active(db,'sales')[0].priceLevelId,'level-retail');assert.equal(active(db,'sales')[0].dirty,0);assert.equal(JSON.parse(db.getState('cart.draft')).note,'keep');assert.equal(JSON.parse(db.getState('cart.draft')).priceLevelId,'level-retail');
});
test('conflicting tier prices and same-name custom levels are preserved',t=>{
 const db=setup(t);db.applyPulled([tier('one','level-retail',80),level('old')]);db.applyPulled([tier('two','old',90),level('vip1',{name:'VIP',isDefault:0}),level('vip2',{name:'VIP',isDefault:0})]);
 assert.equal(active(db,'price_levels').filter(r=>r.isDefault).length,1);assert.equal(active(db,'price_levels').find(r=>r.id==='old').name,'Retail (pricing conflict)');assert.equal(active(db,'price_levels').filter(r=>r.name==='VIP').length,2);assert.deepEqual(active(db,'bulk_pricing').map(r=>r.bulkPrice),[80,90]);
});
test('startup repairs existing duplicates and shop wipe clears repair metadata',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-identity-')),file=path.join(dir,'test.db');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let db=new PosDatabase(file);db.sqlite.exec("INSERT INTO payment_methods(id,updatedAt,name,code) VALUES ('a','2026-01-01','Cash','cash'),('b','2026-01-01','Cash','cash')");db.sqlite.close();db=new PosDatabase(file);t.after(()=>db.sqlite.close());assert.equal(active(db,'payment_methods').length,1);db.wipeShopData();assert.equal(db.sqlite.prepare("SELECT * FROM sync_state WHERE key LIKE 'identity.%'").all().length,0);db.applyPulled([method('b')]);assert.equal(active(db,'payment_methods').length,1);
});
