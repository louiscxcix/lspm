const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {createServer}=require('./server'),{openStore}=require('./local-store'),P=require('./projects'),M=require('./ontology-model');
const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',pause=ms=>new Promise(r=>setTimeout(r,ms));
test('hourly overlay preserves routes, filters dates and keeps demo out of SQLite',{skip:!fs.existsSync(chromePath)},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-map-ai-')),dbPath=path.join(dir,'db.sqlite'),db=openStore(dbPath),ws=db.load(),p=P.create('SMT');
 const secondPart=M.addEntity(p,{type:'Part',name:'JP-RH PCB',itemKind:'component'});secondPart.id='smt-jp-rh-pcb';
 const part=M.addEntity(p,{type:'Part',name:'G65 PCB',productionFamily:'SMT',itemKind:'product'}),step=M.addEntity(p,{type:'Production Step',name:'Router',productionStage:'Router'});M.addRelation(p,{type:'applies_to',from:step.id,to:part.id});p.workstreams={[step.id]:['production'],[part.id]:['production']};ws.projects.push(p);const created=db.save(ws,null,ws.revision);created.projects[0]=p;const saved=db.save(created,p.id,created.revision);db.hourlySave({projectId:p.id,revision:saved.revision,rows:[{partId:part.id,stepId:step.id,unit:'pcs',start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:220,target:300,reasons:[{category:'material',text:'Test material delay',response:'Check delivery',verification:'reported'}]}]});db.close();
 const modelDb=openStore(dbPath);modelDb.hourlySave({projectId:p.id,revision:modelDb.load().revision,rows:[{measurementKind:'model',partId:part.id,unit:'pcs',start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:220,target:240,reasons:[{category:'material',text:'Model material delay',response:'Check delivery',verification:'reported'}]}]});
 const ls=P.create('LS'),lsParts=['LDM finished RH','TEM finished LH'].map((name,i)=>M.addEntity(ls,{type:'Part',name,itemKind:'product',productionFamily:i?'TEM':'LDM'}));
 M.addEntity(ls,{type:'Part',name:'Assembly material',itemKind:'component'});ls.workstreams=Object.fromEntries(lsParts.map(p=>[p.id,['production']]));
 let fixture=modelDb.load();fixture.projects.push(ls);fixture=modelDb.save(fixture,null,fixture.revision);fixture.projects[fixture.projects.findIndex(p=>p.id===ls.id)]=ls;modelDb.save(fixture,ls.id,fixture.revision);
 modelDb.hourlySave({projectId:ls.id,revision:modelDb.load().revision,rows:lsParts.map((part,i)=>({measurementKind:'model',partId:part.id,unit:'pcs',start:'2026-10-09T10:00:00-06:00',end:'2026-10-09T11:00:00-06:00',actual:i?900:13,target:i?1000:20}))});
 modelDb.featureSave({projectId:p.id,revision:modelDb.load().revision,features:{wip:true,hourly:true}});const lsBefore=modelDb.listHourly(ls.id);modelDb.close();
 const app=createServer({dbPath,port:0,accessPath:path.join(dir,'access.json'),initialPassword:'test-owner-password',geminiKey:'fake-key',geminiFetch:async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({answer:'Synthetic test: Router is linked to G65.',objectIds:[step.id,'invalid-id']})}]}}]})})}),url=await app.listen();
 const profile=path.join(dir,'chrome'),chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});let socket;
 t.after(async()=>{socket?.close();chrome.kill();if(chrome.exitCode===null)await new Promise(r=>chrome.once('exit',r));await app.close();fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 let port;for(let i=0;i<100;i++){const f=path.join(profile,'DevToolsActivePort');if(fs.existsSync(f)){port=Number(fs.readFileSync(f,'utf8').split('\n')[0]);break;}await pause(100);}a(port);
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let serial=0;const pending=new Map(),exceptions=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(100);}throw Error(expression+' failed '+exceptions.join(' | '));};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
 await until("document.body.dataset.access==='basic' && !!document.querySelector('#ownerAccessButton')");a.equal(await evaluate("[...document.querySelectorAll('.map-ai-button')].every(b=>b.hidden)"),true);
 await evaluate("document.querySelector('#ownerAccessButton').click();document.querySelector('.access-dialog input').value='test-owner-password';document.querySelector('.access-dialog form').requestSubmit()");await until("document.body.dataset.access==='owner'");

 await evaluate("[...document.querySelectorAll('#projectList a')].find(a=>a.textContent==='SMT').click()");await until("store?.name==='SMT'");await evaluate("activeTab='Production';productionMode='Process map';render()");await until("!!document.querySelector('[data-hourly-toggle]')");
 a.equal(await evaluate("hourlyUI.toggleButton===document.querySelector('[data-hourly-toggle]')"),true);
 a.equal(await evaluate("hourlyUI.toggleButton.parentElement.classList.contains('production-mode-toolbar') && !hourlyUI.toggleButton.parentElement.hidden"),true);
 await evaluate("document.querySelector('[data-hourly-toggle]').click()");await until("document.querySelector('[data-hourly-summary]')?.textContent.includes('220')");a.equal(await evaluate("document.querySelector('[data-hourly-summary]').textContent.includes('91.7%')"),true);
 a.equal(await evaluate("document.querySelectorAll('.hourly-badge').length"),0);
 await until("document.querySelectorAll('#productionNodes .flow-node').length>0");
 a.equal(await evaluate("document.querySelector('[data-hourly-status]').textContent.includes('공정별')"),true);
 a.equal(await evaluate("hourlyUI.toggleButton.getAttribute('aria-pressed')==='true' && !hourlyUI.toggleButton.hidden && !hourlyUI.bar.contains(hourlyUI.toggleButton)"),true);
 a.equal(await evaluate("document.querySelector('.hourly-reason-list')?.textContent.includes('Model material delay')"),true);
 a.equal(await evaluate("document.querySelectorAll('.hourly-point.has-reason').length"),1);
 a.equal(await evaluate("document.querySelector('.hourly-range').hidden && document.querySelector('.hourly-records').hidden && !document.querySelector('[data-hourly-detail-body]').textContent"),true);
 a.equal(await evaluate("document.querySelectorAll('[data-hourly-part][type=radio]').length===2 && document.querySelectorAll('[data-hourly-part]:checked').length===1 && !document.querySelector('[data-hourly-part][type=checkbox]')"),true);
 await evaluate("document.querySelector('[data-hourly-input]').click()");await until("!!document.querySelector('.hourly-input-dialog[open]')");
 a.equal(await evaluate("document.querySelector('[data-hourly-input-date]').value===HourlyProduction.day(new Date())"),true);
 await evaluate("document.querySelector('[data-hourly-input-date]').value='2026-10-09';document.querySelector('[data-hourly-input-text]').value='12pm 30 20 확인 필요';document.querySelector('.hourly-input-dialog form').dispatchEvent(new Event('input',{bubbles:true}))");
 a.equal(await evaluate("document.querySelector('[data-hourly-input-status]').textContent.includes('11:00–12:00')"),true);
 await evaluate("document.querySelector('.hourly-input-dialog form').requestSubmit()");await until("!document.querySelector('.hourly-input-dialog') && hourlyUI.rows.length===3");
 await evaluate("document.querySelector('[data-hourly-interval=\"3\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))");a.equal(await evaluate("document.querySelector('[data-hourly-detail-body]').textContent.includes('Model material delay')"),true);
 await evaluate("document.querySelector('[data-hourly-demo]').click()");await until("document.querySelectorAll('[data-hourly-interval]').length===24");a.equal(await evaluate("hourlyUI.demo"),true);
 a.equal(await evaluate("hourlyUI.intervals.length===24 && new Date(hourlyUI.intervals.at(-1).end)-new Date(hourlyUI.intervals[0].start)===86400000"),true);
 a.equal(await evaluate("document.querySelector('[data-hourly-summary]').textContent.includes('3,420')"),true);
 await evaluate("document.querySelector('[data-hourly-mode=\"cumulative\"]').click()");a.equal(await evaluate("document.querySelectorAll('.hourly-cumulative-line').length"),2);
 await evaluate("document.querySelector('[data-hourly-mode=\"hourly\"]').click();const el=document.querySelector('[data-hourly-from]');el.value=3;el.dispatchEvent(new Event('input',{bubbles:true}));const to=document.querySelector('[data-hourly-through]');to.value=4;to.dispatchEvent(new Event('input',{bubbles:true}))");
 a.equal(await evaluate("document.querySelector('[data-hourly-summary]').textContent.includes('선택 구간')"),true);
 await evaluate("document.querySelector('[data-hourly-part=\"smt-jp-rh-pcb\"]').click()");
 a.equal(await evaluate("document.querySelectorAll('.hourly-model-chart').length===1 && document.querySelector('.hourly-model-chart h4').textContent.includes('JP-RH PCB') && document.querySelectorAll('[data-hourly-part]:checked').length===1 && hourlyUI.range===null && hourlyUI.selected===null"),true);
 await evaluate("document.querySelector('[data-hourly-part=\"smt-jp-rh-pcb\"]').click()");a.equal(await evaluate("document.querySelectorAll('[data-hourly-part]:checked').length===1"),true);
 await evaluate("document.querySelector('[data-hourly-part=\""+part.id+"\"]').click()");
 await evaluate("document.querySelector('[data-hourly-interval=\"5\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");a.equal(await evaluate("document.querySelector('[data-hourly-detail-body]').textContent.includes('자재 도착 지연')"),true);
 await evaluate("document.querySelector('[data-hourly-next=\"1\"]').click()");a.equal(await evaluate("document.querySelector('[data-hourly-detail-body]').textContent.includes('13:00')"),true);
 await evaluate("{const date=document.querySelector('[data-hourly-date]');date.value='2026-10-10';date.dispatchEvent(new Event('change',{bubbles:true}));}");
 a.equal(await evaluate("document.querySelectorAll('.hourly-model-chart').length===0 && document.querySelectorAll('[data-hourly-part]:checked').length===1 && hourlyUI.range===null && hourlyUI.selected===null && !document.querySelector('[data-hourly-detail-body]').textContent"),true);
 await evaluate("{const date=document.querySelector('[data-hourly-date]');date.value='2026-10-09';date.dispatchEvent(new Event('change',{bubbles:true}));}");
 a.equal(await evaluate("document.querySelectorAll('.hourly-model-chart').length===1 && document.querySelectorAll('[data-hourly-interval]').length===24"),true);
 await evaluate("document.querySelector('#keepSavedChange')?.click();document.querySelector('.hourly-toolbar').scrollIntoView({block:'start'})");
 a.equal(await evaluate("document.querySelector('.hourly-toolbar').parentElement===document.querySelector('#productionMapStage').closest('.event-history-layout').parentElement"),true);
 const capture=async filename=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,filename),Buffer.from(r.data,'base64'));};await capture('hourly-desktop.png');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await capture('hourly-mobile.png');
 a.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('[data-hourly-unit-time]').click();document.querySelector('[data-rate-seconds]').value=6;document.querySelector('[data-rate-date]').value='2026-10-09';document.querySelector('[data-rate-seconds]').closest('form').requestSubmit()");await until("!document.querySelector('dialog[open]') && workspace.viewSettings[store.id].hourlyRates?.length===1");
 a.equal(await evaluate("document.querySelector('.hourly-capacity').textContent.includes('510') && document.querySelector('[data-hourly-summary]').textContent.includes('6,120')"),true);
 await evaluate("document.querySelector('[data-hourly-toggle]').click()");a.equal(await evaluate("hourlyUI.active"),false);a.equal(await evaluate("document.querySelectorAll('.hourly-value').length"),0);
 await evaluate("openWorkstream('production')");await until("activeTab==='Overview' && selectedWorkstream==='production'");
 a.equal(await evaluate("hourlyUI.toggleButton.parentElement.classList.contains('production-mode-toolbar') && !hourlyUI.toggleButton.parentElement.hidden && !hourlyUI.toggleButton.hidden && hourlyUI.bar.parentElement===document.querySelector('#mapStage').closest('.event-history-layout').parentElement"),true);
 await evaluate("document.querySelector('[data-hourly-toggle]').click()");await until("document.querySelector('[data-hourly-summary]')?.textContent.includes('1,020')");
 await evaluate("document.querySelector('[data-hourly-toggle]').click()");
 const bothModes="hourlyUI.toggleButton.parentElement===progressUI.toggleButton.parentElement && hourlyUI.toggleButton.parentElement.classList.contains('production-mode-toolbar') && [hourlyUI.toggleButton,progressUI.toggleButton].every(b=>!b.hidden && b.getClientRects().length>0)";
 for(const id of [ls.id,p.id]){
  await evaluate("store=workspace.projects.find(p=>p.id==="+JSON.stringify(id)+");activeTab='Production';productionMode='Process map';render()");
  for(const kind of ['production','overview']){
   if(kind==='overview')await evaluate("openWorkstream('production')");
   a.equal(await evaluate(bothModes),true);
   await evaluate("hourlyUI.toggleButton.click()");await until("hourlyUI.active && !hourlyUI.loading && document.querySelectorAll('.hourly-model-chart').length===1");
   a.equal(await evaluate("!progressUI.active && "+bothModes),true);
   a.equal(await evaluate("document.querySelectorAll('[data-hourly-part]:checked').length===1 && hourlyUI.selectedParts.length===1"),true);
   a.equal(await evaluate("hourlyUI.rows.every(r=>store.entities.some(p=>p.id===r.partId))"),true);
   if(id===ls.id){
    // Equal-time rows have no model ordering guarantee; select the model being asserted.
    await evaluate("hourlyUI.bar.querySelector('[data-hourly-part=\""+lsParts[0].id+"\"]').click()");
    a.equal(await evaluate("document.querySelectorAll('[data-hourly-part]').length===2 && document.querySelector('[data-hourly-summary]').textContent.includes('13')"),true);
    await evaluate("hourlyUI.bar.querySelectorAll('[data-hourly-part]')[1].click()");
    a.equal(await evaluate("document.querySelectorAll('.hourly-model-chart').length===1 && document.querySelectorAll('[data-hourly-part]:checked').length===1 && document.querySelector('[data-hourly-summary]').textContent.includes('900') && !document.querySelector('[data-hourly-summary]').textContent.includes('913')"),true);
   }
   await evaluate("progressUI.toggleButton.click()");a.equal(await evaluate("progressUI.active && !hourlyUI.active && hourlyUI.table.hidden && "+bothModes),true);
   await evaluate("hourlyUI.toggleButton.click()");a.equal(await evaluate("hourlyUI.active && !progressUI.active && "+bothModes),true);
   await evaluate("hourlyUI.toggleButton.click()");
  }
 }
 await evaluate("document.querySelector('#projectFeatures').click();document.querySelector('[data-wip]').checked=true;document.querySelector('[data-hourly]').checked=false;document.querySelector('dialog [data-save]').click()");await until("workspace.viewSettings[store.id]?.features?.hourly===false");a.equal(await evaluate("hourlyUI.bar.hidden"),true);
 a.equal(await evaluate("hourlyUI.toggleButton.hidden"),true);
 const check=openStore(dbPath);a.equal(check.listHourly(p.id).length,3);a.deepEqual(check.listHourly(ls.id),lsBefore);a.equal(check.load().projects.find(x=>x.id===p.id).entities.length,3);check.close();a.deepEqual(exceptions,[]);
});
