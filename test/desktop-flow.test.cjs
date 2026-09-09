const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createLoader}=require('./helpers.cjs'),{desktopHarness}=require('./desktop-harness.cjs');
const root=path.join(__dirname,'..'),{PosDatabase}=createLoader(root)('src/main/database.ts');
test('preload and main IPC carry dates, drafts, split payments, returns and repayments end to end',async t=>{
 const db=new PosDatabase(':memory:');t.after(()=>db.sqlite.close());
 db.setState('entitlement.tier','cloud_pro');db.setState('entitlement.premiumUntil','2099-01-01');
 const {api,printed}=desktopHarness(root,db);
 await api.pos.savePaymentMethod({name:'Cash',code:'cash'});await api.pos.savePaymentMethod({name:'Wallet',code:'wallet'});
 const product=await api.pos.saveProduct({name:'Rice',price:100,cost:40,quantity:10}),customer=await api.pos.saveCustomer({name:'Customer'});
 const line={productId:product.id,name:'Rice',unit:'pcs',unitPrice:100,unitCost:40,quantity:2,discount:20};
 await api.pos.saveCartDraft({lines:[line],orderDiscount:10,customerId:customer.id,note:'Draft',soldAt:'2026-09-05T10:00',priceLevelId:'level-retail'});
 assert.equal((await api.pos.cartDraft()).note,'Draft');
 const receipt=await api.pos.checkout({lines:[line],discount:10,customerId:customer.id,paymentMethod:'cash',payments:[{methodCode:'cash',amount:50,tendered:60},{methodCode:'wallet',amount:100}],soldAt:'2026-09-05T03:30:00.000Z'});
 assert.equal(receipt.total,170);assert.equal(receipt.change,10);assert.equal(receipt.outstanding,20);assert.deepEqual((await api.pos.cartDraft()).lines,[]);
 assert.equal((await api.pos.sales('', '2026-09-06T00:00:00.000Z','2026-09-06T23:59:59.999Z')).length,0);
 assert.equal((await api.pos.sales('', '2026-09-05T00:00:00.000Z','2026-09-05T23:59:59.999Z')).length,1);
 const original=db.sqlite.prepare('SELECT id FROM sales').get();
 await api.pos.collectDebt(customer.id,20,'wallet',undefined,original.id,'2026-09-05T04:00:00.000Z');assert.equal((await api.pos.customerLedger(customer.id)).balance,0);
 const returned=await api.pos.returnSale(receipt.voucherId,[{productId:product.id,quantity:1}],'wallet','Partial return',85);
 assert.equal(returned.total,-85);assert.equal((await api.pos.products())[0].quantity,9);
 const report=await api.pos.report('2000-01-01','2099-12-31');assert.equal(report.netSales,85);assert.equal(report.grossProfit,45);
 await api.printer.printReceipt(returned);assert.equal(printed[0].voucherId,returned.voucherId);
});

test('editing product cost updates initial stock movement and recomputes average cost consistently', async t => {
  const db = new PosDatabase(':memory:'); t.after(() => db.sqlite.close());
  const { api } = desktopHarness(root, db);
  // Create product with initial inventory at cost 500
  const created = await api.pos.saveProduct({ name: 'Coffee Bean', price: 1000, cost: 500, quantity: 10 });
  assert.equal(created.cost, 500);

  const initialMovement = db.sqlite.prepare(
    "SELECT unitCost FROM stock_movements WHERE productId = ? AND reason = 'Initial desktop inventory'"
  ).get(created.id);
  assert.equal(initialMovement.unitCost, 500);

  // Edit cost to 650
  const updated = await api.pos.saveProduct({ ...created, cost: 650 });
  assert.equal(updated.cost, 650);

  // Verify stock movement unitCost updated
  const updatedMovement = db.sqlite.prepare(
    "SELECT unitCost FROM stock_movements WHERE productId = ? AND reason = 'Initial desktop inventory'"
  ).get(created.id);
  assert.equal(updatedMovement.unitCost, 650);

  // Trigger another stock recomputation via stock count or delivery to prove cost doesn't revert
  await api.pos.setStockTo(created.id, 10, 'Count check');
  const afterCount = (await api.pos.products()).find(p => p.id === created.id);
  assert.equal(afterCount.cost, 650);

  // Verify activity log recorded
  const log = db.sqlite.prepare(
    "SELECT action, amount FROM activity_log WHERE referenceId = ? AND action = 'adjustment'"
  ).get(created.id);
  assert.ok(log);
  assert.equal(log.amount, 650);
});
