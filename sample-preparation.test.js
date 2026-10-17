'use strict';
const {test}=require('node:test');
const a=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function domain(){a.ok(fs.existsSync(path.join(__dirname,'sample-preparation.js')),'Sample Preparation domain exists');return require('./sample-preparation');}
function project(){return {id:'sample-project',name:'Sample',projectType:'sample',status:'active',entities:[{id:'part-a',type:'Part',name:'Model A'},{id:'part-b',type:'Part',name:'Model B'},{id:'owner-a',type:'Person',name:'Project owner'},{id:'team-a',type:'Organization',name:'Technical support'},{id:'ref-a',type:'Requirement',name:'Approved drawing'},{id:'private-evidence',type:'Evidence',name:'Local reference',privacy:'local_only'}],relations:[]};}
function sheet(S,p=project()){return S.create(p,{partId:'part-a',runName:'Trial 1'});}

test('14 immutable English preparation questions preserve source scope and the single explicit P0',()=>{
 const S=domain();a.equal(S.QUESTIONS.length,14);a.equal(new Set(S.QUESTIONS.map(q=>q.id)).size,14);
 a.ok(Object.isFrozen(S.QUESTIONS));a.ok(S.QUESTIONS.every(Object.isFrozen));
 a.equal(S.QUESTIONS.filter(q=>q.priority==='P0').length,1);
 const text=S.QUESTIONS.map(q=>q.question+' '+q.guidance).join(' ');
 for(const term of ['revision','BOM','supplier','expiry','MES','QR','calibration','spares','Pressing 3','Pressing 4','first-piece','retest','trained','escalation','packing'])a.match(text,new RegExp(term,'i'));
 a.ok(S.QUESTIONS.every(q=>q.question.endsWith('?')&&!/[가-힣]/.test(q.question)));
 a.match(S.QUESTIONS.find(q=>q.priority==='P0').question,/LOT.*MES.*QR/);
});
test('explicit project type wins; only confirmed legacy sample names qualify',()=>{
 const S=domain();for(const name of ['MOBIS + HELLA','SMT','T1-2'])a.equal(S.isSample({name}),true);
 for(const name of ['LS','Sample idea','SMT experiment','T1-2 Base'])a.equal(S.isSample({name}),false);
 a.equal(S.isSample({name:'SMT',projectType:'program'}),false);a.equal(S.isSample({name:'Other',projectType:'sample'}),true);a.equal(S.isSample(null),false);
 a.equal(S.isSample({name:'SMT',projectType:''}),false);a.equal(S.isSample({name:'SMT',projectType:false}),false);
});
test('new runs start unknown with no inferred model, owner, reference or approval',()=>{
 const S=domain(),p=project(),before=structuredClone(p),blank=S.create(p),first=sheet(S,p),second=sheet(S,p);
 a.equal(blank.partId,'');a.equal(blank.runName,'');a.equal(blank.version,0);a.notEqual(first.id,second.id);
 a.ok(first.templateVersion);a.equal(first.answers.length,15);
 a.ok(first.answers.every(x=>x.status==='unknown'&&x.note===''&&x.ownerId===null&&x.referenceIds.length===0));
 first.answers[0].note='One run only';a.equal(second.answers[0].note,'');a.deepEqual(p,before);
 a.throws(()=>S.create({...p,projectType:'program'}),/sample/i);
});
test('validation returns a normalized whitelist and accepts only project owners/references',()=>{
 const S=domain(),p=project(),s=sheet(S,p);a.equal(S.normalize,S.validate);s.runName=' Trial 1 ';s.admin=true;s.answers[0]={...s.answers[0],status:'verified',note:' Approved drawing rev B reviewed. ',ownerId:'owner-a',referenceIds:['ref-a','ref-a'],rawLog:'private'};
 const before=structuredClone(s),out=S.validate(p,s);a.equal(out.runName,'Trial 1');a.equal(out.answers[0].note,'Approved drawing rev B reviewed.');a.deepEqual(out.answers[0].referenceIds,['ref-a']);a.equal(out.admin,undefined);a.equal(out.answers[0].rawLog,undefined);a.deepEqual(s,before);
 out.answers[0].ownerId='team-a';a.doesNotThrow(()=>S.validate(p,out));
 for(const ownerId of ['external-person','part-a']){const bad=structuredClone(s);bad.answers[0].ownerId=ownerId;a.throws(()=>S.validate(p,bad),/owner/i);}
 const bad=structuredClone(s);bad.answers[0].referenceIds=['outside-reference'];a.throws(()=>S.validate(p,bad),/reference/i);
});
test('verified needs substantive evidence; not applicable needs a reason; unknown stays unknown',()=>{
 const S=domain(),p=project();
 for(const status of ['unknown','in_progress','issue']){const s=sheet(S,p);s.answers[0].status=status;a.equal(S.validate(p,s).answers[0].status,status);}
 for(const [status,notes]of [['verified',['','   ','OK','..........','verified']],['not_applicable',['','   ','N/A']]])for(const note of notes){const s=sheet(S,p);Object.assign(s.answers[0],{status,note});a.throws(()=>S.validate(p,s),/evidence|reason/i);}
 const s=sheet(S,p);Object.assign(s.answers[0],{status:'not_applicable',note:'This run has no supplier PCB.'});a.equal(S.validate(p,s).answers[0].status,'not_applicable');
});
test('validation rejects malformed identity, status, template, evidence and oversized input',()=>{
 const S=domain(),p=project(),mutations=[s=>s.id='../bad',s=>s.partId='outside-part',s=>s.partId='ref-a',s=>s.runName='',s=>s.runName='x'.repeat(181),s=>s.templateVersion='future',s=>s.version=-1,s=>s.version=1.5,s=>s.answers.pop(),s=>s.answers[0].questionId='outside-question',s=>s.answers[0].questionId=s.answers[1].questionId,s=>s.answers[0].status='approved',s=>s.answers[0].note={},s=>s.answers[0].note='x'.repeat(4001),s=>s.answers[0].referenceIds='ref-a',s=>s.answers[0].referenceIds=Array(21).fill('ref-a')];
 for(const mutate of mutations){const s=sheet(S,p);mutate(s);a.throws(()=>S.validate(p,s));}
 a.throws(()=>S.validate(p,null));a.throws(()=>S.validate({...p,projectType:'program'},sheet(S,p)),/sample/i);
});
test('summary counts every status without deriving production release',()=>{
 const S=domain(),s=sheet(S);a.deepEqual(S.summary(s),{total:15,unknown:15,in_progress:0,verified:0,issue:0,not_applicable:0,complete:false,p0Status:'unknown'});
 s.answers.forEach(x=>{x.status='verified';x.note='Reviewed supporting evidence.';});s.answers[0].status='not_applicable';a.equal(S.summary(s).complete,true);
 s.answers[4].status='issue';a.equal(S.summary(s).issue,1);a.equal(S.summary(s).p0Status,'issue');a.equal(S.summary(s).complete,false);a.equal(S.summary(s).approved,undefined);
});
test('P0 not applicable is a recorded reason, never a production start approval',()=>{
 const S=domain(),p=project(),s=sheet(S,p);s.answers.forEach(x=>Object.assign(x,{status:'verified',note:'Supporting requirement reviewed.'}));
 Object.assign(s.answers.find(x=>x.questionId==='traceability'),{status:'not_applicable',note:'Engineering review states this isolated trial does not use QR.'});
 const out=S.validate(p,s),summary=S.summary(out);a.equal(summary.p0Status,'not_applicable');a.equal(summary.complete,true);
 for(const key of ['approved','startApproved','gateDecision','released']){a.equal(summary[key],undefined);a.equal(out[key],undefined);}
});
test('latest snapshots group by sheet identity and choose version before workspace revision',()=>{
 const S=domain(),s=sheet(S),other={...sheet(S),runName:'Trial 2'},old={...s,version:1,recordRevision:99},newer={...s,version:2,recordRevision:2};
 a.deepEqual(S.latest([newer,old,other]),[newer,other]);a.deepEqual(S.latest([]),[]);
});
test('viewer projection retains visible status/notes but strips private metadata and link IDs',()=>{
 const S=domain(),s=sheet(S);s.sourceId='secret-source';s.rawLog='raw chat';s.answers[0].ownerId='owner-a';s.answers[0].referenceIds=['private-evidence'];s.answers[0].note='<img src=x onerror=alert(1)>';s.answers[0].rawLog='hidden';
 const safe=S.sanitize(s);a.equal(safe.answers[0].note,s.answers[0].note);a.equal(safe.sourceId,undefined);a.equal(safe.rawLog,undefined);a.equal(safe.answers[0].ownerId,undefined);a.equal(safe.answers[0].referenceIds,undefined);a.equal(safe.answers[0].rawLog,undefined);a.doesNotThrow(()=>S.validate(project(),safe));a.notEqual(safe.answers,s.answers);
});
test('domain and view expose the specified browser globals',()=>{
 domain();a.ok(fs.existsSync(path.join(__dirname,'sample-preparation-view.js')),'Sample Preparation view exists');
 const ctx=vm.createContext({crypto:globalThis.crypto});vm.runInContext(fs.readFileSync(path.join(__dirname,'sample-preparation.js'),'utf8'),ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'sample-preparation-view.js'),'utf8'),ctx);
 a.equal(typeof ctx.SamplePreparation.create,'function');a.equal(typeof ctx.SamplePreparationView,'function');
});

test('browser: owner creation/save, visible evidence, XSS, viewer lock, mobile layout and async scope guards',{timeout:30000,skip:!fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')},async t=>{
 domain();a.ok(fs.existsSync(path.join(__dirname,'sample-preparation-view.js')),'Sample Preparation view exists');
 const http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process'),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/sample-preparation.css"><main id="checks"></main><aside id="other"></aside><script src="/sample-preparation.js"></script><script src="/sample-preparation-view.js"></script>');return;}
  const file={'/sample-preparation.js':'sample-preparation.js','/sample-preparation-view.js':'sample-preparation-view.js','/sample-preparation.css':'sample-preparation.css'}[req.url];
  if(!file||!fs.existsSync(path.join(__dirname,file))){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',(file.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,file)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sample-preparation-browser-'));
 const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});let socket;
 t.after(async()=>{socket?.close();chrome.kill();if(chrome.exitCode===null)await new Promise(r=>chrome.once('exit',r));fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 let port;for(let i=0;i<100;i++){const file=path.join(dir,'DevToolsActivePort');if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break;}await pause(50);}a.ok(port,'Chrome starts');
 const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let serial=0;const pending=new Map(),exceptions=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression:expression.includes('await ')?'(async()=>{'+expression+'})()':expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 for(let i=0;i<100;i++){if(await evaluate('!!globalThis.SamplePreparationView'))break;await pause(30);}
 await evaluate(`globalThis.p=${JSON.stringify(project())};globalThis.workspace={revision:0,projects:[p],access:{enabled:true,mode:'owner'}};globalThis.records=[];globalThis.saved=[];globalThis.refreshed=0;globalThis.LocalAPI={samplePreparationList:async()=>structuredClone(records),samplePreparationSave:async input=>{saved.push(input);const sheet={...input.sheet,version:input.sheet.version+1};records.push(sheet);return {workspace:{...workspace,revision:workspace.revision+1},sheet};}};globalThis.ctx={workspace,store:p,container:document.querySelector('#checks'),readOnly:false};globalThis.ui=new SamplePreparationView(async result=>{refreshed++;workspace=result.workspace;ctx={...ctx,workspace};await ui.update(ctx);});await ui.update(ctx);`);
 a.equal(await evaluate("!!document.querySelector('[data-sample-new]')"),true);
 await evaluate("document.querySelector('[data-sample-new]').click()");
 a.equal(await evaluate("document.querySelectorAll('[data-question]').length"),15);a.equal(await evaluate("[...document.querySelectorAll('[data-status]')].every(el=>el.value==='unknown')"),true);
 a.equal(await evaluate("document.querySelector('[data-sample-online]').open"),false);
 a.equal(await evaluate("document.querySelectorAll('#checks .sample-preparation-paper .sample-preparation-status-blank').length"),15);
 a.equal(await evaluate("document.querySelector('[data-sample-date]').value"),'');a.equal(await evaluate("document.querySelector('[data-sample-prepared]').readOnly"),true);
 await evaluate("document.querySelector('[data-sample-date]').value='2099-10-18';document.querySelector('[data-sample-date]').dispatchEvent(new Event('input',{bubbles:true}));");
 a.match(await evaluate("document.querySelector('[data-sample-timing]').textContent"),/Today \(Mexico City\).*until the planned sample/);
 a.equal(await evaluate("!!document.querySelector('[data-sample-print]')"),true);
 a.equal(await evaluate("!!document.querySelector('[data-sample-date]') && !!document.querySelector('[data-sample-quantity]') && !!document.querySelector('[data-sample-memo]')"),true);
 a.match(await evaluate("document.querySelector('#checks').textContent"),/Saved evidence notes and reasons are visible to project viewers/);
 a.equal(await evaluate("[...document.querySelectorAll('[data-owner]')].every(el=>el.value==='')"),true);
 await evaluate("document.querySelector('[data-sample-part]').value='part-a';document.querySelector('[data-sample-name]').value='Trial <script>alert(1)</script>';document.querySelector('[data-status]').value='verified';document.querySelector('[data-sample-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
 a.equal(await evaluate('saved.length'),0);a.match(await evaluate("document.querySelector('[data-sample-error]').textContent"),/evidence/i);
 await evaluate("document.querySelector('[data-note]').value='<img src=x onerror=globalThis.hacked=true> Drawing rev B reviewed.';document.querySelector('[data-sample-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
 for(let i=0;i<100;i++){if(await evaluate('refreshed===1 && !!document.querySelector("[data-sample-save]")'))break;await pause(20);}
 a.equal(await evaluate('saved.length'),1);a.equal(await evaluate('saved[0].revision'),0);a.equal(await evaluate('saved[0].sheet.version'),0);a.equal(await evaluate('refreshed'),1);
 await evaluate("document.querySelector('[data-sample-date]').value='2026-10-15';document.querySelector('[data-sample-quantity]').value='120';document.querySelector('[data-sample-memo]').value='Trial memo <script>bad</script>.';");
 const print=await evaluate("ui.printHTML(ctx,ui.collect(ui.scope))");
 a.match(print,/2026-10-15/);a.match(print,/120/);a.match(print,/Model A/);a.doesNotMatch(print,/Verified|Drawing rev B reviewed/);a.equal((print.match(/class="sample-preparation-status-blank"/g)||[]).length,15);a.match(print,/Trial memo &lt;script&gt;bad&lt;\/script&gt;/);a.doesNotMatch(print,/<script>|<img|<select|<textarea/);
 a.equal(await evaluate('saved.length'),1,'Preparing a PDF must not save records.');
 a.equal(await evaluate("document.querySelector('[data-status]').value"),'verified');a.equal(await evaluate('!!globalThis.hacked'),false);a.equal(await evaluate("document.querySelectorAll('#checks img,#checks script').length"),0);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});a.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await evaluate("globalThis.listCalls=0;LocalAPI.samplePreparationList=async()=>{listCalls++;return structuredClone(records)};workspace.revision=2;await ui.update(ctx);");a.equal(await evaluate('listCalls'),1);
 await evaluate("p.projectType='program';await ui.update(ctx)");a.equal(await evaluate("document.querySelector('#checks').textContent"),'');await evaluate("p.projectType='sample';await ui.update(ctx)");
 await evaluate("p.entities.find(e=>e.id==='part-a').status='archived';workspace.revision=3;await ui.update(ctx)");a.equal(await evaluate("document.querySelector('[data-sample-part]').value"),'part-a');
 await evaluate("await ui.update({...ctx,workspace:{...workspace,revision:2,access:{enabled:true,mode:'project'}},readOnly:true})");
 a.equal(await evaluate("document.querySelectorAll('[data-sample-save],[data-sample-new]').length"),0);a.equal(await evaluate("document.querySelectorAll('textarea:not([readonly]),select:not([disabled])').length"),0);a.match(await evaluate("document.querySelector('#checks').textContent"),/Drawing rev B/);
 a.equal(await evaluate("!!document.querySelector('[data-sample-print]')"),true);
 await evaluate("await ui.update({...ctx,workspace:{...workspace,revision:3,access:{enabled:true,mode:'project'}},readOnly:false})");a.equal(await evaluate("document.querySelectorAll('[data-sample-save],[data-sample-new]').length"),0);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});a.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await evaluate("globalThis.late=new Promise(resolve=>globalThis.finishLate=resolve);LocalAPI.samplePreparationList=()=>late;globalThis.oldLoad=ui.update({...ctx,workspace:{...workspace,revision:4}});await ui.update({...ctx,store:{...p,id:'other-project',projectType:'program'},container:document.querySelector('#other')});finishLate(records);await oldLoad;");
 a.equal(await evaluate("document.querySelector('#checks').textContent+document.querySelector('#other').textContent"),'');
 await evaluate("LocalAPI.samplePreparationList=async()=>{throw Error('List failed <img>')};await ui.update({...ctx,workspace:{...workspace,revision:5}})");a.match(await evaluate("document.querySelector('#checks').textContent"),/List failed/);a.equal(await evaluate("document.querySelectorAll('#checks img').length"),0);
 await evaluate("LocalAPI.samplePreparationList=async()=>structuredClone(records);await ui.update({...ctx,workspace:{...workspace,revision:6}});globalThis.saveResult=new Promise(resolve=>globalThis.finishSave=resolve);LocalAPI.samplePreparationSave=()=>saveResult;document.querySelector('[data-sample-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await ui.update({...ctx,readOnly:true,workspace:{...workspace,revision:7}});finishSave({workspace:{...workspace,revision:8},sheet:records[0]});");
 await pause(30);a.equal(await evaluate('refreshed'),1);a.equal(await evaluate("document.querySelectorAll('[data-sample-save],[data-sample-new]').length"),0);
 await evaluate("LocalAPI.samplePreparationSave=async()=>{throw Error('SHEET_VERSION_CONFLICT')};await ui.update({...ctx,workspace:{...workspace,revision:9}});document.querySelector('[data-note]').value='Rechecked drawing rev C.';document.querySelector('[data-sample-form]').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));");await pause(20);
 a.match(await evaluate("document.querySelector('[data-sample-error]').textContent"),/SHEET_VERSION_CONFLICT/);a.equal(await evaluate("document.querySelector('[data-note]').value"),'Rechecked drawing rev C.');a.equal(await evaluate("document.querySelector('[data-sample-save]').disabled"),false);
 await evaluate("await ui.update(null)");a.equal(await evaluate("document.querySelector('#checks').textContent"),'');
 await evaluate("p.entities[0].id='ls-part-t1-2-uplevel';p.entities[0].name='T1-2 Uplevel';p.entities[0].status='active';records=[];LocalAPI.samplePreparationList=async()=>[];await ui.update({...ctx,workspace:{...workspace,revision:10}});document.querySelector('[data-sample-new]').click();document.querySelector('[data-note]').value='Initial preparation evidence.';document.querySelector('[data-sample-part]').value='ls-part-t1-2-uplevel';document.querySelector('[data-sample-part]').dispatchEvent(new Event('change',{bubbles:true}));");
 a.equal(await evaluate('ui.scope.sheet.profile'),'t1-2');a.match(await evaluate("document.querySelector('[data-question=pcb-provenance]').textContent"),/made in-house/);
 a.equal(await evaluate("document.querySelector('[data-note]').value"),'Initial preparation evidence.','Choosing the first model must retain already typed evidence.');
 await evaluate("document.querySelector('[data-sample-memo]').value='Unsaved model memo.';document.querySelector('[data-sample-memo]').dispatchEvent(new Event('input',{bubbles:true}));await ui.update({...ctx,workspace:{...workspace,revision:11}})");
 a.equal(await evaluate("document.querySelector('[data-note]').value"),'Initial preparation evidence.');a.equal(await evaluate("document.querySelector('[data-sample-memo]').value"),'Unsaved model memo.');
 await evaluate("LocalAPI.samplePreparationList=()=>new Promise(resolve=>globalThis.finishDraftReload=resolve);globalThis.draftReload=ui.update({...ctx,workspace:{...workspace,revision:12}});void 0");
 a.equal(await evaluate("document.querySelector('[data-note]').matches(':disabled') && document.querySelector('[data-sample-save]').matches(':disabled')"),true,'A pending list may not race new edits or saves.');
 await evaluate('await ui.save(ui.scope);return true;');a.equal(await evaluate('saved.length'),1);
 await evaluate('finishDraftReload([]);await draftReload;');a.equal(await evaluate("document.querySelector('[data-note]').value"),'Initial preparation evidence.');
 await evaluate("document.querySelector('[data-sample-part]').value='part-b';document.querySelector('[data-sample-part]').dispatchEvent(new Event('change',{bubbles:true}));");
 a.equal(await evaluate("document.querySelector('[data-note]').value"),'','Do not carry another model evidence into a new model.');
 await evaluate("document.querySelector('[data-sample-part]').value='ls-part-t1-2-uplevel';document.querySelector('[data-sample-part]').dispatchEvent(new Event('change',{bubbles:true}));");
 a.equal(await evaluate("document.querySelector('[data-note]').value"),'Initial preparation evidence.','Returning to the previous model restores its draft.');
 await evaluate("document.querySelector('[data-sample-name]').value='T1-2 trial';document.querySelector('[data-sample-date]').value='2026-10-15';document.querySelector('[data-sample-date]').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-sample-quantity]').value='120';document.querySelector('[data-sample-memo]').value='Preparation review only. Quantity 120 pcs; no production release.';document.querySelector('[data-note]').value='Drawing revision checked.\\nSecond line of evidence.';document.querySelector('[data-status]').value='in_progress';");
 if(process.env.PM_SAMPLE_CAPTURE_DIR){
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  const capture=process.env.PM_SAMPLE_CAPTURE_DIR;fs.mkdirSync(capture,{recursive:true});
  const screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(capture,'sample-preparation-app.png'),Buffer.from(screen.data,'base64'));
 }
 await evaluate("globalThis.createElementBeforePrint=document.createElement.bind(document);document.createElement=(...args)=>{const element=createElementBeforePrint(...args);if(args[0]==='iframe')element.addEventListener('load',()=>{element.contentWindow.print=()=>{element.contentWindow.printRequested=true}});return element;}");
 await evaluate("document.querySelector('[data-sample-print]').click()");
 for(let i=0;i<100;i++){if(await evaluate('!!ui.printFrame?.contentWindow.printRequested'))break;await pause(20);}
 a.equal(await evaluate('ui.printFrame.contentWindow.printRequested'),true);a.match(await evaluate('ui.printFrame.contentDocument.body.textContent'),/T1-2 Uplevel/);a.match(await evaluate('ui.printFrame.contentDocument.body.textContent'),/Fill in Status by hand/);
 a.equal(await evaluate('saved.length'),1,'Printing must not add a saved run.');
 if(process.env.PM_SAMPLE_CAPTURE_DIR){
  const markup=await evaluate('ui.printFrame.contentDocument.documentElement.outerHTML');
  await evaluate("ui.printFrame.contentWindow.dispatchEvent(new Event('afterprint'))");a.equal(await evaluate('ui.printFrame'),null);
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await pause(100);
  const tree=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:'<!doctype html>'+markup});
  for(let i=0;i<100;i++){if(await evaluate("[...document.querySelectorAll('link[rel=stylesheet]')].every(link=>!!link.sheet)"))break;await pause(20);}
  await send('Emulation.setEmulatedMedia',{media:'print'});await evaluate('await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return true;');
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:1000,deviceScaleFactor:1,mobile:false});
  const capture=process.env.PM_SAMPLE_CAPTURE_DIR;fs.mkdirSync(capture,{recursive:true});
  const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});fs.writeFileSync(path.join(capture,'sample-preparation-preview.pdf'),Buffer.from(pdf.data,'base64'));
  const png=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(capture,'sample-preparation-preview.png'),Buffer.from(png.data,'base64'));
 }else await evaluate("ui.printFrame.contentWindow.dispatchEvent(new Event('afterprint'))");
 a.deepEqual(exceptions,[]);
});
