const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('every published script including cloud login gets a release version',()=>{
 const written=new Map(),fakeFs={mkdirSync(){},copyFileSync(){},writeFileSync:(file,text)=>written.set(file,text),readFileSync:()=>'<link rel="stylesheet" href="styles.css?v=old"><link rel="stylesheet" href="sample-preparation.css"><script src="access-ui.js?v=old"></script><script src="app.js?v=old"></script>'};
 const db={load:()=>({projects:[]}),close(){}},context={__dirname:__dirname,process:{env:{}},console:{log(){}},require(name){return name==='node:fs'?fakeFs:name==='node:path'?path:name==='./local-store'?{openStore:()=>db}:{removePrivateRecords:x=>x};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./build-public.js'),'utf8'),context);
 const html=written.get(path.join(__dirname,'public-build','index.html')),scripts=[...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]);
 assert(scripts.some(s=>s.startsWith('cloud-api.js')));assert(scripts.every(s=>/\.js\?v=\d+$/.test(s)),scripts.join(', '));
 assert.match(html,/href="sample-preparation\.css\?v=\d+"/);
});
test('public artifact contains catalog only, not project graph or observations',()=>{
 const written=new Map(),fakeFs={mkdirSync(){},copyFileSync(){},writeFileSync:(file,text)=>written.set(file,text),readFileSync:()=>'<script src="app.js?v=old"></script>'};
 const p={id:'project-a',name:'A',status:'active',entities:[{id:'secret',name:'Do not publish'}],relations:[]},empty=()=>({snapshots:[],rows:[],counts:[]}),db={load:()=>({projects:[p],library:{entities:p.entities,relations:[]}}),close(){},listWip:empty,listProgress:empty,listStaffing:()=>[],listProductionStaffing:()=>[]};
 const context={__dirname,process:{env:{}},console:{log(){}},require(name){return name==='node:fs'?fakeFs:name==='node:path'?path:name==='./local-store'?{openStore:()=>db}:name==='./project-types'?require(name):{removePrivateRecords:x=>x};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('./build-public.js'),'utf8'),context);const json=JSON.parse(written.get(path.join(__dirname,'public-build','public-workspace.json')));assert.equal(json.workspace.projects[0].name,'A');assert.equal(json.workspace.projects[0].entities.length,0);assert.equal(json.workspace.projects[0].viewPending,true);assert.equal(Object.keys(json.production).length,0);assert(!JSON.stringify(json).includes('Do not publish'));
});
