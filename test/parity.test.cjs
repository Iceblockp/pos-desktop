const assert=require('node:assert/strict');
const {test}=require('node:test');
const path=require('node:path');
const {existsSync}=require('node:fs');
const {createLoader,asyncDb}=require('./helpers.cjs');
const root=path.join(__dirname,'..'), load=createLoader(root);
const {PosDatabase,SYNC_TABLES}=load('src/main/database.ts');
function setup(t){const db=new PosDatabase(':memory:');t.after(()=>db.sqlite.close());db.savePaymentMethod({name:'Cash',code:'cash'});db.savePaymentMethod({name:'KBZPay',code:'kbzpay'});return db;}
function product(db){return db.saveProduct({name:'Rice',price:100,cost:40,quantity:20});}
function line(p,quantity=1){return {productId:p.id,name:p.name,unit:p.unit,quantity,unitPrice:p.price,unitCost:p.cost,discount:0};}
function sale(db,p,extras={}){return db.checkout({lines:[line(p)],paymentMethod:'cash',...extras});}
function rows(db,table){return db.sqlite.prepare('SELECT * FROM '+table).all();}
const range={from:'2020-01-01T00:00:00.000Z',to:'2099-12-31T23:59:59.999Z'};

test('stock writes use the API enum, including opening inventory, sales and returns',t=>{
 const db=setup(t),p=product(db),receipt=sale(db,p);db.returnSale(receipt.voucherId,[{productId:p.id,quantity:1}],'kbzpay');
 assert.deepEqual(rows(db,'stock_movements').map(r=>r.type),['stock_in','sale_out','return_in']);assert.equal(db.listProducts()[0].quantity,20);
});
test('split payment, credit, repayment and receipts agree',t=>{
 const db=setup(t),p=product(db),customer=db.saveCustomer({name:'Customer'});db.openCashSession(20);
 const receipt=sale(db,p,{customerId:customer.id,payments:[{methodCode:'cash',amount:30,tendered:50},{methodCode:'kbzpay',amount:40}]});
 assert.equal(receipt.outstanding,30);assert.equal(receipt.change,20);assert.deepEqual(receipt.payments.map(p=>p.methodName).sort(),['Cash','KBZPay']);
 assert.equal(db.customerLedger(customer.id).balance,30);assert.equal(db.cashSession().expectedCash,50);
 db.collectDebt(customer.id,30,'kbzpay',undefined,rows(db,'sales')[0].id);
 assert.equal(db.customerLedger(customer.id).balance,0);assert.equal(db.customerLedger(customer.id).sales[0].remaining,0);
 assert.equal(db.receiptForSale(receipt.voucherId).outstanding,0);
});
test('invalid checkout rolls back sale, payments and stock',t=>{
 const db=setup(t),p=product(db);for(const extra of [{payments:[{methodCode:'cash',amount:101}]},{payments:[{methodCode:'cash',amount:90}]},{amountTendered:20},{lines:[line(p,-1)]},{paymentMethod:'debt'}]) assert.throws(()=>sale(db,p,extra));
 assert.equal(rows(db,'sales').length,0);assert.equal(rows(db,'payments').length,0);assert.equal(db.listProducts()[0].quantity,20);
});
test('refunds use custom payment methods, permit partial customer credit, and net reports',t=>{
 const db=setup(t),p=product(db),c=db.saveCustomer({name:'Customer'});db.openCashSession(0);
 const receipt=sale(db,p,{customerId:c.id,payments:[]});
 const returned=db.returnSale(receipt.voucherId,[{productId:p.id,quantity:1}],'kbzpay',undefined,20);
 assert.equal(returned.total,-100);assert.equal(returned.payments[0].amount,-20);assert.equal(db.customerLedger(c.id).balance,20);
 const report=db.report(range.from,range.to);assert.equal(report.netSales,0);assert.equal(report.cost,0);assert.equal(report.saleCount,2);
 assert.equal(rows(db,'activity_log').find(r=>r.action==='return').amount,100);
});
test('discounted return preserves the original unit price and refunds the paid value',t=>{
 const db=setup(t),p=product(db);const receipt=sale(db,p,{lines:[{...line(p,2),discount:20}],discount:30});
 const ret=db.returnSale(receipt.voucherId,[{productId:p.id,quantity:2}],'cash');assert.equal(ret.total,-150);
 assert.equal(rows(db,'sale_items')[1].unitPrice,100);assert.equal(rows(db,'sale_items')[1].subtotal,-150);
 assert.throws(()=>db.returnSale(receipt.voucherId,[{productId:p.id,quantity:1}],'cash'));
});
test('duplicate return lines cannot refund the same unit twice',t=>{
 const db=setup(t),p=product(db),receipt=sale(db,p);assert.throws(()=>db.returnSale(receipt.voucherId,[{productId:p.id,quantity:1},{productId:p.id,quantity:1}],'cash'));
});
test('cash sessions have the same local calendar ID on every device',t=>{
 const a=setup(t),b=setup(t);assert.equal(a.openCashSession(0).id,b.openCashSession(0).id);assert.match(a.cashSession().id,/^cash-\d{4}-\d{2}-\d{2}$/);
});
test('payment codes cannot change on rename or use reserved credit code',t=>{
 const db=setup(t),m=db.listPaymentMethods().find(m=>m.code==='cash');db.savePaymentMethod({...m,name:'Cash renamed',code:'new-code'});assert.equal(db.listPaymentMethods().find(x=>x.id===m.id).code,'cash');
 assert.throws(()=>db.savePaymentMethod({name:'Debt',code:'debt'}));assert.throws(()=>db.savePaymentMethod({name:'Cash duplicate',code:'cash'}));
});
test('catalog includes retail legacy tiers and highest qualifying threshold wins',t=>{
 const db=setup(t),p=product(db);db.sqlite.prepare('INSERT INTO bulk_pricing (id,updatedAt,productId,minQuantity,bulkPrice,priceLevelId) VALUES (?,?,?,?,?,?)').run('legacy','2026-01-01',p.id,3,95,null);
 db.saveProductTier({productId:p.id,priceLevelId:'level-wholesale',minQuantity:1,bulkPrice:90});db.saveProductTier({productId:p.id,priceLevelId:'level-wholesale',minQuantity:10,bulkPrice:92});
 assert.equal(db.priceFor(p.id,null,3),95);assert.equal(db.priceFor(p.id,'level-wholesale',10),92);assert.equal(db.listProducts()[0].tiers.length,3);
});
test('expenses can be backdated, edited, filtered and tombstoned without changing their cash session',t=>{
 const db=setup(t);const session=db.openCashSession(100);db.saveExpense('Rent',20,'note',{spentAt:'2026-09-01T00:00:00.000Z'});const expense=db.listExpenses()[0];
 assert.equal(db.listExpenses('2026-09-02','2026-09-03').length,0);db.saveExpense('Rent corrected',30,'note',{id:expense.id});assert.equal(db.cashSession().expectedCash,70);
 assert.equal(rows(db,'expenses')[0].cashSessionId,session.id);db.removeExpense(expense.id);assert.equal(db.listExpenses().length,0);assert.equal(db.cashSession().expectedCash,100);assert.equal(rows(db,'expenses')[0].dirty,1);
});
test('pull page and cursor roll back together, stock arriving before a product is repaired',t=>{
 const db=setup(t);db.setState('cloud.cursor','2');assert.throws(()=>db.applyPulled([{table:'products',id:'broken',updatedAt:'2026-01-01',serverSeq:3}],3));assert.equal(db.getState('cloud.cursor'),'2');
 db.applyPulled([{table:'stock_movements',id:'movement',updatedAt:'2026-01-01',serverSeq:3,productId:'remote',type:'stock_in',quantityDelta:5,unitCost:2,occurredAt:'2026-01-01'}],3);
 db.applyPulled([{table:'products',id:'remote',updatedAt:'2026-01-01',serverSeq:4,name:'Remote',price:4,cost:2}],4);assert.equal(db.listProducts()[0].quantity,5);assert.equal(db.getState('cloud.cursor'),'4');
});
test('voucher collisions renumber only the rejected sale and remain pending',t=>{
 const db=setup(t),p=product(db);sale(db,p);db.setState('device.code','B');const sent=db.dirtyChanges().filter(r=>r.table==='sales');db.reconcilePush(sent,{accepted:[],skipped:[{table:'sales',id:sent[0].id,reason:'voucher_taken'}]});
 assert.match(rows(db,'sales')[0].voucherId,/^B-/);assert.equal(rows(db,'sales')[0].dirty,1);
});
test('edits made while a push is in flight remain dirty',t=>{
 const db=setup(t),p=product(db),sent=db.dirtyChanges();db.sqlite.prepare('UPDATE products SET updatedAt = ?, name = ? WHERE id = ?').run('2099-01-01','New name',p.id);
 db.reconcilePush(sent,{accepted:[{table:'products',id:p.id,serverSeq:5}],skipped:[]});assert.equal(rows(db,'products')[0].dirty,1);
});

const mobileRoot=process.env.STORE_POS_MOBILE ?? path.resolve(root,'../store_pos');
const hasMobile=existsSync(path.join(mobileRoot,'src/sync/registry.ts'));
const mobile=createLoader(mobileRoot,{'expo-crypto':{getRandomBytes:require('node:crypto').randomBytes}});
test('desktop and mobile sync registries match exactly',{skip:!hasMobile},()=>{
 assert.deepEqual(SYNC_TABLES,mobile('src/sync/registry.ts').SYNC_TABLES);
});
test('the same split sale produces matching mobile records and report totals',{skip:!hasMobile},async t=>{
 const desktop=setup(t),reference=setup(t);const p=product(desktop);reference.applyPulled(desktop.dirtyChanges().map(c=>({...c,...c.data,serverSeq:1})));
 const c=desktop.saveCustomer({name:'Customer'});reference.applyPulled(desktop.dirtyChanges().filter(c=>c.table==='customers').map(c=>({...c,...c.data,serverSeq:1})));
 const items=[{...line(p,2),discount:10}],payments=[{amount:50,methodCode:'cash',methodName:'Cash',tendered:60},{amount:100,methodCode:'kbzpay',methodName:'KBZPay'}];
 const soldAt='2026-09-05T06:00:00.000Z';desktop.checkout({lines:items,discount:20,customerId:c.id,paymentMethod:'cash',payments,soldAt});
 const priced=items.map(l=>mobile('src/cart/pricing.ts').priceLine({...l,listPrice:l.unitPrice}));
 await mobile('src/sales/commitSale.ts').commitSale(asyncDb(reference),{lines:priced,totals:mobile('src/cart/pricing.ts').cartTotals(priced,20),payments,customerId:c.id,deviceCode:'D',soldAt});
 for(const table of ['sales','sale_items','payments']){
   const fields=table==='sales'?['subtotal','discount','total','soldAt','customerId']:table==='sale_items'?['quantity','unitPrice','unitCost','discount','subtotal']:['amount','methodCode','methodName','tendered','paidAt'];
   const normalize=db=>rows(db,table).map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   assert.deepEqual(normalize(desktop),normalize(reference),table);
 }
 assert.equal(desktop.report(range.from,range.to).netSales,(await mobile('src/db/reports.ts').salesSummary(asyncDb(reference),range)).revenue);
});
test('report periods match mobile for month rollover and Myanmar midnight',{skip:!hasMobile},()=>{
 const desktop=load('src/shared/period.ts'),reference=mobile('src/db/reports.ts');
 for(const date of ['2026-01-01T00:30:00+06:30','2026-03-31T23:59:00+06:30'])for(const key of ['today','yesterday','thisMonth','lastMonth','week','rolling30']) assert.deepEqual(desktop.periodRange(key,new Date(date)),reference.periodRange(key,new Date(date)));
});

test('stock counts set the shelf quantity, including zero and unchanged counts', t=>{
 const db=setup(t),p=product(db);assert.equal(db.setStockTo(p.id,7).quantity,7);const before=rows(db,'stock_movements').length;
 db.setStockTo(p.id,7);assert.equal(rows(db,'stock_movements').length,before);assert.equal(db.setStockTo(p.id,0).quantity,0);assert.throws(()=>db.setStockTo(p.id,-1));
 db.adjustStock(p.id,2,'stock_in',undefined,{unitCost:0});assert.equal(rows(db,'stock_movements').at(-1).unitCost,0);
});
test('same-millisecond local edits have distinct acknowledgement versions',t=>{
 const db=setup(t),c=db.saveCustomer({name:'Before'}),sent=db.dirtyChanges();db.saveCustomer({id:c.id,name:'After'});
 db.reconcilePush(sent,{accepted:sent.map(r=>({table:r.table,id:r.id,serverSeq:1})),skipped:[]});
 assert.equal(db.dirtyChanges().find(r=>r.id===c.id).data.name,'After');
});

test('fractional quantity steps match mobile',{skip:!hasMobile},()=>{
 for(const unit of ['pcs','kg','g','ပိဿာ','l','box'])assert.equal(load('src/shared/units.ts').stepFor(unit),mobile('src/db/products.ts').stepFor(unit));
});

test('drafts persist mobile-shaped entries locally and resolve current product values',t=>{
 const db=setup(t),p=product(db),customer=db.saveCustomer({name:'Customer'});
 db.saveCartDraft({lines:[{...line(p,2),discount:5}],orderDiscount:7,customerId:customer.id,note:'Keep me',soldAt:'2026-09-01T10:00',priceLevelId:'level-retail'});
 const raw=JSON.parse(db.getState('cart.draft'));assert.deepEqual(raw.entries,[[p.id,{quantity:2,discount:5}]]);assert.equal(db.dirtyChanges().some(c=>c.table==='sync_state'),false);
 db.saveProduct({...p,price:150});const draft=db.cartDraft();assert.equal(draft.lines[0].unitPrice,150);assert.equal(draft.note,'Keep me');assert.equal(draft.customerId,customer.id);assert.equal(draft.orderDiscount,7);
 sale(db,db.listProducts()[0]);assert.equal(db.getState('cart.draft'),null);
 db.setState('cart.draft','invalid json');assert.deepEqual(db.cartDraft().lines,[]);
});
test('expired plans, legacy premium and feature toggles match mobile',t=>{
 const db=setup(t);assert.equal(db.capabilities().debt,false);db.setState('entitlement.tier','premium');db.setState('entitlement.premiumUntil','2099-01-01');assert.equal(db.capabilities().cloud,true);db.setFeature('debt',false);assert.equal(db.capabilities().debt,false);
 db.setState('device.role','cashier');assert.equal(db.capabilities().owner,false);assert.throws(()=>db.setFeature('debt',true));db.setState('entitlement.premiumUntil','2000-01-01');assert.equal(db.capabilities().effectivePlan,'free');
});
test('discounted partial return matches mobile without subtracting line discounts twice',{skip:!hasMobile},async t=>{
 const db=setup(t),p=product(db);const receipt=sale(db,p,{lines:[{...line(p,2),discount:20}],discount:10});
 const reference=await mobile('src/sales/commitReturn.ts').returnableSale(asyncDb(db),receipt.voucherId);assert.equal(reference.lines[0].refundPerUnit,85);assert.equal(db.returnableSale(receipt.voucherId)[0].refundPerUnit,85);
});

test('unallocated repayments settle receipts and refunds never appear as a new unpaid sale',{skip:!hasMobile},async t=>{
 const db=setup(t),p=product(db),c=db.saveCustomer({name:'Customer'});const receipt=sale(db,p,{customerId:c.id,payments:[]});db.collectDebt(c.id,100,'cash');assert.equal(db.receiptForSale(receipt.voucherId).outstanding,0);
 db.returnSale(receipt.voucherId,[{productId:p.id,quantity:1}],'cash');const reference=await mobile('src/db/debts.ts').outstandingBySale(asyncDb(db),c.id);
 for(const row of db.customerLedger(c.id).sales)assert.equal(row.remaining,reference.get(row.id));
});
