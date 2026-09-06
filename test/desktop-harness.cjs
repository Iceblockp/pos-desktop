const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {createLoader}=require('./helpers.cjs');
function desktopHarness(root,db,overrides={}) {
 const source=fs.readFileSync(path.join(root,'src/main/main.ts'),'utf8');
 const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const selected=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['assertTrustedSender','registerIpc'].includes(node.name?.text)).map(node=>node.getText(ast)).join('\n');
 const js=ts.transpileModule(selected,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const handlers=new Map(),printed=[];
 const state=()=>({status:'idle',pending:db.countDirty(),lastSyncedAt:null,error:null,shopName:'QA Shop',deviceName:'QA Desktop',deviceId:'qa-device',deviceCode:'Q',role:db.capabilities().owner?'owner':'cashier',apiUrl:'http://localhost:3000/api',dataRevision:0});
 const cloud={state,syncNow:async()=>state(),devices:async()=>[{id:'qa-device',name:'QA Desktop',deviceCode:'Q',role:state().role,isCurrent:true,lastSyncedAt:null}],billingStatus:async()=>({tier:'cloud_pro',premiumUntil:'2099-01-01'}),listSlips:async()=>[],...overrides.cloud};
 const notifications={preferences:()=>({lowStock:false,dailyEnabled:false,hour:20,minute:0,supported:false}),afterSale:async()=>{},...overrides.notifications};
 const printer=()=>({deviceName:null,paperWidth:80,autoPrint:false});
 const names=['ipcMain','database','cloud','notifications','app','getPrinterSettings','printReceipt','listPrinters','printTestReceipt','savePrinterSettings'];
 new Function(...names,js+'\nregisterIpc();')({handle:(key,fn)=>handlers.set(key,fn)},db,cloud,notifications,{getVersion:()=> 'QA'},printer,async(_db,receipt)=>printed.push(receipt),async()=>[],async()=>{},(_db,input)=>input);
 let api;
 createLoader(root,{electron:{contextBridge:{exposeInMainWorld:(_name,value)=>api=value},ipcRenderer:{invoke:async(key,...args)=>{const handler=handlers.get(key);if(!handler)throw Error('Missing IPC '+key);return handler({senderFrame:{url:'file://qa'}},...args);},on:()=>{},removeListener:()=>{}}}})('src/preload/preload.ts');
 return {api,handlers,printed};
}
module.exports={desktopHarness};
