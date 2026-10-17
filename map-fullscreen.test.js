const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{spawn}=require('node:child_process');
const Projects=require('./projects'),Model=require('./ontology-model');
const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('map fullscreen: real app and native Chrome API, with in-memory data only',{
 skip:!fs.existsSync(chromePath),timeout:60000
},async t=>{
 const library=Projects.create('Fullscreen fixture');library.id='library';
 const part=Model.addEntity(library,{type:'Part',name:'Fullscreen Part'});
 const step=Model.addEntity(library,{type:'Production Step',name:'Fullscreen step',processLevel:'main'});
 Model.addRelation(library,{from:step.id,type:'applies_to',to:part.id});
 const destination={...structuredClone(library),id:'fullscreen-destination',name:'Saved zoom destination'};
 const workspace={version:2,revision:1,projects:[destination],library,viewSettings:{[destination.id]:{overview:{zoom:.43}}}};
 const writes=[];
 const server=http.createServer((req,res)=>{
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname.startsWith('/api/')){
     res.setHeader('Content-Type','application/json');
     if(req.method!=='GET'&&pathname!=='/api/history/query'&&!pathname.startsWith('/api/settings/'))writes.push(req.method+' '+pathname);
     const value=pathname==='/api/workspace'?workspace:pathname==='/api/health'?{}:
       pathname.startsWith('/api/history/query')?{items:[],counts:{},priorities:{}}:
       pathname==='/api/changes'?{items:[]}:[];
     res.end(JSON.stringify(value));return;
   }
   const filename=pathname==='/'?'index.html':pathname.slice(1);
   if(!/^[\w.-]+\.(html|js|css)$/.test(filename)){res.writeHead(404);res.end();return;}
   try{res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(__dirname,filename)));}
   catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/#/library';
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'map-fullscreen-'));
 const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=1440,900','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
 let socket;
 t.after(async()=>{
   socket?.close();chrome.kill();
   if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
   await new Promise(resolve=>server.close(resolve));
   fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
 });
 let port;
 for(let i=0;i<100;i++){
   const portFile=path.join(dir,'DevToolsActivePort');
   if(fs.existsSync(portFile)){port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);break;}
   if(chrome.exitCode!==null)throw Error('Chrome exited before CDP became available');
   await pause(100);
 }
 assert.ok(port,'Chrome CDP port');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 let serial=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{
   const message=JSON.parse(event.data);
   if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
   const callback=pending.get(message.id);
   if(callback){pending.delete(message.id);message.error?callback.reject(Error(message.error.message)):callback.resolve(message.result);}
 });
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
   return result.result.value;
 };
 const until=async expression=>{
   for(let i=0;i<40;i++){if(await evaluate(expression))return;await pause(50);}
   assert.fail('State missing: '+expression+'; '+errors.join(' | '));
 };
 const click=async selector=>{
   await until(`document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);
   await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`);
   await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))');
   const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 };
 const hit=selector=>evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}),r=element.getBoundingClientRect();return r.width>0&&r.height>0&&element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`);
 let run=0;
 const fresh=async(kind='overview')=>{
   const search='?fullscreen-test='+ ++run;
   await send('Page.navigate',{url:url.replace('/#/','/'+search+'#/')});
   await until(`location.search===${JSON.stringify(search)}&&typeof store!=='undefined'&&store?.id==='library'&&document.querySelector('.map-fullscreen-button')`);
   await evaluate(`activeTab=${JSON.stringify(kind==='production'?'Production':'Overview')};render();zoom=.72;productionZoom=.91;applyZoom();applyProductionZoom();mapSelectedIds.add(${JSON.stringify(step.id)});decorateMapSelection()`);
 };
 await send('Runtime.enable');await send('Page.enable');

 for(const kind of ['overview','production'])await t.test(kind+': native panel, controls, selection and browser exit restore zoom',async()=>{
   await fresh(kind);
   const panel=kind==='production'?'#productionView':'.map-panel';
   await click(panel+' .map-fullscreen-button');
   await until(`document.fullscreenElement===document.querySelector('${panel}')`);
   await until(`document.querySelector('${panel} .map-fullscreen-button').getAttribute('aria-pressed')==='true'`);
   assert.equal(await evaluate(`document.querySelector('${panel} .map-fullscreen-button').textContent`),'Exit full screen');
   assert.equal(await evaluate(`document.querySelector('${panel}').clientHeight===innerHeight&&document.querySelector('${panel}').clientWidth===innerWidth`),true,'Native panel fills the screen');
   assert.equal(await evaluate(`document.querySelector('${panel} .map-stage').clientHeight>innerHeight/3`),true,'Map retains usable space alongside its controls');
   assert.equal(await evaluate(`mapSelectedIds.has(${JSON.stringify(step.id)})`),true);
   const clear=kind==='production'?'#productionClearSelection':'#clearSelection';
   assert.equal(await evaluate(`document.querySelector('${clear}').getClientRects().length>0`),true,'Clear selection remains available in fullscreen');
   await click(clear);
   assert.equal(await evaluate('mapSelectedIds.size'),0);
   await evaluate(`mapSelectedIds.add(${JSON.stringify(step.id)});decorateMapSelection()`);
   await click(kind==='production'?'#productionZoomIn':'#zoomIn');
   await evaluate('document.exitFullscreen()');
   await until("!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate(kind==='production'?'productionZoom':'zoom'),kind==='production'?.91:.72);
   assert.equal(await evaluate("document.body.classList.contains('map-fullscreen-open')"),false);
   assert.equal(await evaluate(`mapSelectedIds.has(${JSON.stringify(step.id)})`),true);
 });

 await t.test('native exit button and Escape leave unrelated UI alone',async()=>{
   await fresh();await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await click('.map-panel .map-fullscreen-button');
   await until("!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
   await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await evaluate("$('#inspector').hidden=false;window.assistantCloses=0;mapAssistantUI.openPanel=true;mapAssistantUI.close=()=>{window.assistantCloses++}");
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
   await until("!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate("$('#inspector').hidden"),false);
   assert.equal(await evaluate('window.assistantCloses'),0);
   assert.equal(await evaluate('zoom'),.72);
 });

 for(const kind of ['overview','production'])await t.test(kind+': navigating away clears fullscreen',async()=>{
   await fresh(kind);const panel=kind==='production'?'#productionView':'.map-panel';
   await click(panel+' .map-fullscreen-button');
   await until(`document.fullscreenElement===document.querySelector('${panel}')`);
   await evaluate("activeTab='Parts';render()");
   await until("!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate(kind==='production'?'productionZoom':'zoom'),kind==='production'?.91:.72);
 });

 for(const kind of ['overview','production'])for(const mode of ['rejected','unsupported'])await t.test(kind+' '+mode+': labelled viewport fallback, Escape and zoom restoration',async()=>{
   await fresh(kind);const panel=kind==='production'?'#productionView':'.map-panel';
   await evaluate(`document.querySelector('${panel}').requestFullscreen=`+(mode==='rejected'?"()=>Promise.reject(Error('Permission denied'))":"undefined"));
   await click(panel+' .map-fullscreen-button');
   await until(`document.querySelector('${panel}').classList.contains('map-fullscreen')`);
   assert.equal(await evaluate('document.fullscreenElement'),null);
   assert.match(await evaluate(`document.querySelector('${panel} .map-fullscreen-status')?.textContent||''`),mode==='rejected'?/Permission denied/:/not supported/i);
   assert.match(await evaluate(`document.querySelector('${panel} .map-fullscreen-button').textContent`),/Exit expanded view/);
   await evaluate("$('#inspector').hidden=false;window.assistantCloses=0;mapAssistantUI.openPanel=true;mapAssistantUI.close=()=>{window.assistantCloses++};document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
   await until("!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate(kind==='production'?'productionZoom':'zoom'),kind==='production'?.91:.72);
   assert.equal(await evaluate("$('#inspector').hidden"),false);
   assert.equal(await evaluate('window.assistantCloses'),0);
 });

 await t.test('failed native exit explains recovery and keeps exit control active',async()=>{
   await fresh();await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await evaluate("window.nativeExit=document.exitFullscreen.bind(document);document.exitFullscreen=()=>Promise.reject(Error('Exit blocked'))");
   await click('.map-panel .map-fullscreen-button');
   await until("document.querySelector('.map-panel .map-fullscreen-status').textContent.includes('Exit blocked')");
   assert.equal(await evaluate("document.querySelector('.map-panel .map-fullscreen-status').hidden"),false);
   assert.equal(await evaluate("document.querySelector('.map-panel .map-fullscreen-button').getAttribute('aria-pressed')"),'true');
   await evaluate('document.exitFullscreen=window.nativeExit');
   await click('.map-panel .map-fullscreen-button');
   await until("!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
 });

 await t.test('viewport fallback exit button and navigation restore layout',async()=>{
   await fresh();await evaluate("document.querySelector('.map-panel').requestFullscreen=undefined");
   await click('.map-panel .map-fullscreen-button');
   await until("document.querySelector('.map-fullscreen')");
   await click('.map-panel .map-fullscreen-button');
   await until("!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate('zoom'),.72);
   await click('.map-panel .map-fullscreen-button');
   await until("document.querySelector('.map-fullscreen')");
   await evaluate("activeTab='Parts';render()");
   await until("!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate("document.body.classList.contains('map-fullscreen-open')"),false);
 });

 await t.test('pending rejected request cannot reopen a panel after navigation',async()=>{
   await fresh();
   await evaluate("document.querySelector('.map-panel').requestFullscreen=()=>new Promise((resolve,reject)=>{window.rejectFullscreen=()=>reject(Error('Late denial'))})");
   await click('.map-panel .map-fullscreen-button');
   await evaluate("activeTab='Parts';render()");
   await evaluate('window.rejectFullscreen()');
   await until("!document.querySelector('.map-panel .map-fullscreen-button').disabled");
   assert.equal(await evaluate("document.querySelector('.map-fullscreen')"),null);
   assert.equal(await evaluate('zoom'),.72);
 });

 for(const kind of ['overview','production'])await t.test(kind+': question mark opens clickable inspector inside native panel and restores its position',async()=>{
   await fresh(kind);const panel=kind==='production'?'#productionView':'.map-panel';
   await evaluate("window.inspectorParent=$('#inspector').parentNode;window.inspectorNext=$('#inspector').nextSibling");
   await click(panel+' .map-fullscreen-button');
   await until(`document.fullscreenElement===document.querySelector('${panel}')`);
   const detail=panel+' [data-open-detail="'+step.id+'"]';
   assert.equal(await hit(detail),true,'Question mark can receive a pointer click');
   await click(detail);
   await until("!$('#inspector').hidden");
   assert.equal(await evaluate('document.fullscreenElement.contains($("#inspector"))'),true,'Inspector belongs to fullscreen top layer');
   assert.equal(await hit('#closeInspector'),true,'Inspector close button can receive a pointer click');
   await click('#closeInspector');
   assert.equal(await evaluate("$('#inspector').hidden"),true);
   await evaluate('document.exitFullscreen()');
   await until("!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate("$('#inspector').parentNode===window.inspectorParent&&$('#inspector').nextSibling===window.inspectorNext"),true,'Original inspector position restored');
 });

 await t.test('production scope line selector remains usable and returns to lens header',async()=>{
   await fresh();
   await evaluate("selectedWorkstream='production';render();window.lineParent=$('#mapProductionLineControl').parentNode;window.lineNext=$('#mapProductionLineControl').nextSibling");
   await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   assert.equal(await hit('#mapProductionLine'),true,'Scoped line selector is above fullscreen top layer');
   assert.equal(await evaluate("document.fullscreenElement.contains($('#mapProductionLineControl'))"),true);
   await click('#mapProductionLine');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
   await evaluate("$('#mapProductionLine').value='SMT';$('#mapProductionLine').dispatchEvent(new Event('change',{bubbles:true}))");
   assert.equal(await evaluate("$('#mapProductionLine').value"),'SMT','Scoped line change survives render');
   assert.equal(await evaluate("document.fullscreenElement===document.querySelector('.map-panel')"),true);
   await evaluate('document.exitFullscreen()');
   await until("!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate("$('#mapProductionLineControl').parentNode===window.lineParent&&$('#mapProductionLineControl').nextSibling===window.lineNext"),true);
 });

 for(const kind of ['overview','production'])await t.test(kind+': map AI drawer is clickable within native fullscreen',async()=>{
   await fresh(kind);const panel=kind==='production'?'#productionView':'.map-panel';
   await click(panel+' .map-fullscreen-button');
   await until(`document.fullscreenElement===document.querySelector('${panel}')`);
   await click(panel+' .map-ai-button');
   await until(`!document.querySelector('${panel} .map-assistant-drawer').hidden`);
   assert.equal(await hit(panel+' .map-assistant-question textarea'),true);
   await click(panel+' [data-ai-close]');
   await evaluate('document.exitFullscreen()');
   await until("!document.querySelector('.map-fullscreen')");
 });

 await t.test('overview Layers dropdown options below toolbar receive real clicks',async()=>{
   await fresh();await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await click('.map-panel .layer-menu summary');
   await evaluate("document.querySelector('.map-panel .layer-content').scrollTop=10000");
   assert.equal(await hit('#showSubprocesses'),true,'Options below the toolbar remain hit-testable');
   await evaluate("document.querySelector('.map-panel .layer-content').scrollTop=0");
   const option='#typeFilters input';
   assert.equal(await hit(option),true,'Layer checkbox is not clipped by toolbar');
   const before=await evaluate("document.querySelector('#typeFilters input').checked");
   await click(option);
   assert.equal(await evaluate("document.querySelector('#typeFilters input').checked"),!before);
   assert.equal(await evaluate("$('#mapStage').clientHeight>innerHeight/3"),true,'Opening menu does not consume map space');
   await evaluate('document.exitFullscreen()');await until("!document.querySelector('.map-fullscreen')");
 });

 for(const kind of ['overview','production'])await t.test(kind+': Part dropdown options below toolbar receive real clicks',async()=>{
   await fresh(kind);const panel=kind==='production'?'#productionView':'.map-panel',picker=kind==='production'?'#productionPartMulti':'#mapPartMulti';
   await click(panel+' .map-fullscreen-button');
   await until(`document.fullscreenElement===document.querySelector('${panel}')`);
   await click(picker+' summary');
   const option=picker+' input[type=checkbox]';
   assert.equal(await hit(option),true,'Part checkbox is not clipped by toolbar');
   const before=await evaluate(`document.querySelector('${option}').checked`);
   await click(option);
   assert.equal(await evaluate(`document.querySelector('${option}').checked`),!before);
   assert.equal(await evaluate(`document.querySelector('${panel} .map-stage').clientHeight>innerHeight/3`),true);
   await evaluate('document.exitFullscreen()');await until("!document.querySelector('.map-fullscreen')");
 });

 await t.test('actual hash navigation preserves destination saved zoom while native exit completes',async()=>{
   await fresh();await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await evaluate("location.hash='#/projects/fullscreen-destination'");
   await until("store?.id==='fullscreen-destination'&&!document.fullscreenElement&&!document.querySelector('.map-fullscreen')");
   assert.equal(await evaluate('zoom'),.43,'Departing .72 zoom cannot overwrite destination .43');
 });
 await t.test('map History panel remains visible when explicitly opened in fullscreen',async()=>{
   await fresh();await click('.map-panel .map-fullscreen-button');
   await until("document.fullscreenElement===document.querySelector('.map-panel')");
   await evaluate("eventHistoryUI.view.panel.hidden=false;eventHistoryUI.view.panel.textContent='Selected object history';");
   assert.equal(await evaluate("getComputedStyle(eventHistoryUI.view.panel).display!=='none'&&document.fullscreenElement.contains(eventHistoryUI.view.panel)"),true);
   await click('.map-panel .map-fullscreen-button');
   await until("!document.fullscreenElement");
 });
 assert.deepEqual(writes,[],'Fullscreen never saves graph or evidence');
 assert.deepEqual(errors,[],'No browser exceptions');
});
