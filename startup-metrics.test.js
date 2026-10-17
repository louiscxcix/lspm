const {test}=require('node:test'),a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('./app.js','utf8');
test('initial metrics load concurrently, render once and discard stale navigation results',async()=>{
  a(source.includes('async function loadProjectMetrics('),'A batched initial metrics loader is required');
  const fn=source.slice(source.indexOf('async function loadProjectMetrics('),source.indexOf('async function loadWip('));
  let renders=0;const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};},wip=deferred(),staff=deferred(),production=deferred();
  const ctx={store:{id:'LS'},metricLoadSerial:0,selectedWipSnapshotId:'',LocalAPI:{wipList:()=>wip.promise,staffingList:()=>staff.promise,productionStaffingList:()=>production.promise},render(){renders++;},$:()=>({textContent:''})};
  vm.createContext(ctx);vm.runInContext(fn,ctx);const work=vm.runInContext('loadProjectMetrics()',ctx);wip.resolve({selected:'s',counts:[]});staff.resolve([{count:2}]);production.resolve([{count:3}]);await work;a.equal(renders,1);a.equal(ctx.staffingData[0].count,2);
  const slow=deferred();ctx.LocalAPI.wipList=()=>slow.promise;const stale=vm.runInContext('loadProjectMetrics()',ctx);ctx.metricLoadSerial++;ctx.store={id:'other'};slow.resolve({selected:'old',counts:[]});await stale;a.equal(renders,1);a.equal(ctx.selectedWipSnapshotId,'s');
});
