const {readFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const ts=require('typescript');
function createLoader(root,overrides={}) {
  const cache=new Map();
  function load(file) {
    const filename=path.resolve(root,file);
    if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const output=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,experimentalDecorators:true},fileName:filename}).outputText;
    const localRequire=spec=>{
      if(spec in overrides)return overrides[spec];
      if(spec.startsWith('.')||spec.startsWith('@/')) {
        let next=spec.startsWith('@/')?path.join(root,'src',spec.slice(2)):path.resolve(path.dirname(filename),spec);
        if(!path.extname(next))next+='.ts';
        return load(next);
      }
      return createRequire(filename)(spec);
    };
    const fn=vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+output+'\n})',{filename});
    fn(localRequire,module,module.exports,filename,path.dirname(filename));
    return module.exports;
  }
  return load;
}
function asyncDb(database) {
  const sqlite=database.sqlite;
  const params=args=>args.length===1&&Array.isArray(args[0])?args[0]:args;
  return {
    getFirstAsync:async(sql,...args)=>sqlite.prepare(sql).get(...params(args))??null,
    getAllAsync:async(sql,...args)=>sqlite.prepare(sql).all(...params(args)),
    runAsync:async(sql,...args)=>sqlite.prepare(sql).run(...params(args)),
    execAsync:async(sql)=>sqlite.exec(sql),
    withTransactionAsync:async(fn)=>{sqlite.exec('BEGIN');try{await fn();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}},
  };
}
module.exports={createLoader,asyncDb};
