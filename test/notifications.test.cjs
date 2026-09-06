const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{EventEmitter}=require('node:events');
const {createLoader}=require('./helpers.cjs');const root=path.join(__dirname,'..');const {PosDatabase}=createLoader(root)('src/main/database.ts');
function setup(t,{fail=false}={}){
 const shown=[];class Notification extends EventEmitter {static isSupported(){return true;}constructor(options){super();this.options=options;}show(){shown.push(this.options);this.emit(fail?'failed':'show');}}
 const db=new PosDatabase(':memory:');t.after(()=>db.sqlite.close());const {NotificationService}=createLoader(root,{electron:{Notification}})('src/main/notifications.ts');return {db,service:new NotificationService(db,()=>{}),shown};
}
test('notification preferences are opt-in and never enter the synced tables',async t=>{
 const {db,service,shown}=setup(t);assert.equal(service.preferences().lowStock,false);assert.equal(service.preferences().dailyEnabled,false);
 const prefs=await service.save({...service.preferences(),lowStock:true,dailyEnabled:true});assert.equal(prefs.lowStock,true);assert.equal(prefs.dailyEnabled,true);assert.equal(shown.length,1);assert.equal(db.countDirty(),0);
});
test('low stock alerts only fire when this sale crosses the minimum',async t=>{
 const {db,service,shown}=setup(t);await service.save({...service.preferences(),lowStock:true});const p=db.saveProduct({name:'Rice',price:10,quantity:3,minStock:2});
 db.adjustStock(p.id,-1,'waste');await service.afterSale([p]);assert.equal(shown.length,2);
 const low=db.cartProducts([p.id])[0];db.adjustStock(p.id,-1,'waste');await service.afterSale([low]);assert.equal(shown.length,2);
});
test('daily reminder is once per local date and disabling stops it',async t=>{
 const {service,shown}=setup(t);await service.save({...service.preferences(),dailyEnabled:true,hour:20,minute:0});
 await service.tick(new Date('2026-09-05T19:59:00'));assert.equal(shown.length,1);
 await service.tick(new Date('2026-09-05T20:00:00'));await service.tick(new Date('2026-09-05T21:00:00'));assert.equal(shown.length,2);
 await service.save({...service.preferences(),dailyEnabled:false});await service.tick(new Date('2026-09-06T20:00:00'));assert.equal(shown.length,2);
});
test('a rejected OS notification leaves the preference disabled',async t=>{
 const {service}=setup(t,{fail:true});const prefs=await service.save({...service.preferences(),lowStock:true,dailyEnabled:true});assert.equal(prefs.lowStock,false);assert.equal(prefs.dailyEnabled,false);
});
