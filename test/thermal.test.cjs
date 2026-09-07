const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path');
const {createLoader}=require('./helpers.cjs');
const {rasterCommands,serialPath}=createLoader(path.join(__dirname,'..'))('src/main/thermal.ts');
test('serial selection accepts macOS callout ports and rejects arbitrary files',()=>{
 assert.equal(serialPath('serial:/dev/cu.printer001'),'/dev/cu.printer001');
 for(const value of ['serial:/tmp/test','serial:/dev/cu.x/../../file','/dev/cu.printer001','serial:/dev/cu.x\n'])assert.throws(()=>serialPath(value));
});
test('thermal raster packs leftmost pixels first and leaves white paper clear',()=>{
 const data=Buffer.alloc(384*4,255);data.fill(0,0,3);data.fill(0,7*4,7*4+3);data.fill(0,8*4,8*4+3);
 const result=rasterCommands(data,384,1);assert.deepEqual([...result.subarray(5,13)],[29,118,48,0,48,0,1,0]);assert.equal(result[13],129);assert.equal(result[14],128);assert.equal(result[15],0);assert.deepEqual([...result.subarray(-3)],[27,100,3]);
});
test('long receipts split into bounded raster bands without dropping the last row',()=>{
 const data=Buffer.alloc(576*129*4,255);data.fill(0,576*128*4,576*128*4+3);
 const result=rasterCommands(data,576,129),second=5+8+72*128;
 assert.deepEqual([...result.subarray(second,second+8)],[29,118,48,0,72,0,1,0]);assert.equal(result[second+8],128);
});
test('invalid raster buffers are rejected before printing',()=>{
 assert.throws(()=>rasterCommands(Buffer.alloc(4),384,1));assert.throws(()=>rasterCommands(Buffer.alloc(4),1,1));
});
