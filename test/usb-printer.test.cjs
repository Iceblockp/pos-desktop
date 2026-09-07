const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path');
const {createLoader}=require('./helpers.cjs');const root=path.join(__dirname,'..');
const {parseUsbQueues,usbQueueName}=createLoader(root)('src/main/usb-printer.ts');
test('only local USB queues are offered for unfiltered thermal output',()=>{
 assert.deepEqual(parseUsbQueues('device for Xprinter_USB_printer_port: usb://Xprinter/USB%20printer%20port?serial=1\ndevice for Office: ipp://server/printer\ndevice for Remote: socket://192.168.1.4'),[{name:'Xprinter_USB_printer_port',uri:'usb://Xprinter/USB%20printer%20port?serial=1'}]);
});
test('USB queue names cannot inject print options or paths',()=>{
 assert.equal(usbQueueName('usb-raw:Xprinter_USB_printer_port'),'Xprinter_USB_printer_port');
 for(const name of ['usb-raw:-d','usb-raw:a\n-d other','usb-raw:../file','Xprinter'])assert.throws(()=>usbQueueName(name));
});
test('USB sends raster bytes unmodified with raw filtering explicitly enabled',{skip:process.platform!=='darwin'},async()=>{
 const calls=[];let received;
 const {sendUsb}=createLoader(root,{'node:child_process':{execFile:(file,args,options,callback)=>{
  calls.push({file,args});if(file.endsWith('lpstat')){callback(null,'device for Xprinter: usb://Xprinter/Printer','');return {};}
  return {stdin:{on:()=>{},end:data=>{received=data;callback(null,'request id is Xprinter-1','');}}};
 }}})('src/main/usb-printer.ts');
 const bytes=Buffer.from([27,64,29,118,48,0,255]);await sendUsb('usb-raw:Xprinter',bytes);
 assert.deepEqual(calls[1],{file:'/usr/bin/lp',args:['-d','Xprinter','-o','raw','-t','Store POS receipt']});assert.deepEqual(received,bytes);
});
