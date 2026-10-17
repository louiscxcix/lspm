'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const LS='project-e35a946f-5e00-42b3-a76d-7158a2f395e1';
const demo={enabled:true,start:'2026-10-01',end:'2026-10-07',kind:'',basis:'occurred',verification:'',person:''};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
  const subject={id:'step',type:'Production Step',name:'Router',status:'active'};
  const person={id:'person',type:'Person',name:'Reporter',status:'active'};
  const events=[
    ['before','2026-09-30','disruption','critical','business'],
    ['first','2026-10-01','response','normal','business'],
    ['last','2026-10-07','resolution','normal','business'],
    ['after','2026-10-08','risk','attention','business'],
    ['wip','2026-10-09','progress','critical','production_log']
  ].map(([id,occurredDate,kind,importance,recordClass])=>({id,type:'Event',name:id,context:'Original '+id+' report',eventRecord:{
    schemaVersion:1,recordClass,kind,importance,occurredDate,recordedAt:occurredDate+'T18:00:00Z',
    reportedAt:occurredDate+'T18:00:00Z',lifecycle:'active',statementMode:'reported_fact',verification:'reported',
    timePrecision:'date',scope:{kind:'shared',projectIds:[]},facets:['production']
  }}));
  const library={id:'library',entities:[subject,person,...events],relations:events.flatMap(e=>[
    {id:e.id+'-subject',from:e.id,to:subject.id,type:'records_on',historyRole:'subject'},
    {id:e.id+'-reporter',from:e.id,to:person.id,type:'reported_by'}
  ])};
  const project={id:LS,status:'active',entities:[subject,person],relations:[],workstreams:{step:['production']}};
  return {revision:1,library,projects:[project,{...project,id:'other'}],viewSettings:{}};
}

test('mounted Event History defaults, legacy preference and explicit date filtering',{
  skip:!fs.existsSync(chromePath),timeout:60000
},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-default-range-'));
  const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
  let socket;
  t.after(async()=>{
    socket?.close();chrome.kill();
    if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  });
  let port;
  for(let i=0;i<100;i++){
    const file=path.join(dir,'DevToolsActivePort');
    if(fs.existsSync(file)){port=Number(fs.readFileSync(file,'utf8').split('\n')[0]);break;}
    if(chrome.exitCode!==null)throw Error('Chrome exited before CDP became available');
    await pause(100);
  }
  a.ok(port,'Chrome CDP port');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map(),errors=[];
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,replMode:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  for(const file of ['history.js','cloud-domain.js','history-view.js'])await evaluate(fs.readFileSync(path.join(__dirname,file),'utf8'));
  const fresh=async({saved,scope=LS,viewKey='lens-production',kind='overview'}={})=>{
    const workspace=fixture();
    if(saved)workspace.viewSettings[scope]={eventHistory:{[viewKey]:saved}};
    await evaluate(`
      document.body.innerHTML='<input id="dateStart" value="2026-10-01"><input id="dateEnd" value="2026-10-07"><div id="mapStage"><svg><g data-select="step"><rect width="194"/></g></svg></div><div id="productionMapStage"><svg><g data-select="step"><rect width="194"/></g></svg></div>';
      window.workspace=${JSON.stringify(workspace)};window.writes=[];window.queries=[];
      window.originalHistory=JSON.stringify(workspace.library);
      window.LocalAPI={
        settings:async(...args)=>writes.push(structuredClone(args)),
        historyJobs:async()=>[],
        historyQuery:async q=>{queries.push(structuredClone(q));return CloudDomain.query(workspace,q);}
      };
      window.ui=new HistoryView(()=>{});
      window.ctx={workspace,store:workspace.projects.find(p=>p.id===${JSON.stringify(scope)}),kind:${JSON.stringify(kind)},viewKey:${JSON.stringify(viewKey)},selection:new Set(),workstream:'production'};
      ui.update(ctx);await ui.fetch();
    `);
  };
  const dates=()=>evaluate("['start','end'].map(key=>ui.view.bar.querySelector('[data-h=\"'+key+'\"]').value)");
  const change=values=>evaluate(`
    for(const [key,value] of Object.entries(${JSON.stringify(values)})){
      const control=ui.view.bar.querySelector('[data-h="'+key+'"]');
      if(control.type==='checkbox')control.checked=value;else control.value=value;
    }
    ui.view.bar.dispatchEvent(new Event('change',{bubbles:true}));await ui.fetch();
  `);
  const rows=async()=>evaluate("ui.view.bar.querySelector('[data-list]').click();[...ui.view.panel.querySelectorAll('[data-history-event]')].map(e=>e.dataset.historyEvent)");

  for(const kind of ['overview','production'])await t.test(kind+': new context has blank inputs and no hidden date range',async()=>{
    await fresh({kind});a.deepEqual(await dates(),['','']);
    await change({enabled:true});a.deepEqual(await rows(),['after','last','first','before']);
    a.deepEqual(await evaluate('queries.at(-1).start'), '');a.equal(await evaluate('queries.at(-1).end'),'');
    a.equal(await evaluate('ui.data.totalDistinct'),4);
    a.equal(await evaluate("ui.view.stage.querySelector('.event-history-badge').dataset.priority"),'critical');
    a.equal(await evaluate('JSON.stringify(workspace.library)===originalHistory'),true);
    await evaluate("ui.update({...ctx,viewKey:'new-context'});await ui.fetch()");
    a.deepEqual(await dates(),['','']);
  });

  await t.test('only known LS production demo preference normalizes, without automatic writes',async()=>{
    await fresh({saved:demo});a.deepEqual(await dates(),['','']);
    a.deepEqual(await rows(),['after','last','first','before']);
    a.deepEqual(await evaluate('workspace.viewSettings[ctx.store.id].eventHistory[ctx.viewKey]'),demo);
    a.equal(await evaluate('writes.length'),0);
    a.equal(await evaluate('JSON.stringify(workspace.library)===originalHistory'),true);
  });

  await t.test('arbitrary ranges, one-sided bounds and other saved filters survive reopening',async()=>{
    for(const saved of [
      {...demo,start:'2026-09-30',end:'2026-10-08'},
      {...demo,start:'2026-10-07',end:''},
      {...demo,start:'',end:'2026-10-01'},
      {...demo,kind:'risk',verification:'reported',person:'person',basis:'reported'}
    ]){
      await fresh({saved});a.deepEqual(await dates(),[saved.start,saved.end]);
      for(const key of ['kind','verification','person','basis'])a.equal(await evaluate('ui.settings.'+key),saved[key]);
    }
    for(const context of [{scope:'other'},{viewKey:'overview'},{viewKey:'production'}]){
      await fresh({...context,saved:demo});a.deepEqual(await dates(),[demo.start,demo.end]);
    }
  });

  await t.test('explicit filtering remains inclusive and reset clears and persists both dates',async()=>{
    await fresh();await change({enabled:true,start:demo.start,end:demo.end});
    a.deepEqual(await rows(),['last','first']);
    a.equal(await evaluate('ui.data.priorities.step'),'resolved');
    await evaluate('ui.update(ctx);await ui.fetch()');a.deepEqual(await dates(),[demo.start,demo.end]);
    // A deliberately chosen demo-shaped range must remain valid after reopening.
    await fresh({saved:await evaluate('writes.at(-1)[2][ctx.viewKey]')});
    a.deepEqual(await dates(),[demo.start,demo.end]);a.deepEqual(await rows(),['last','first']);
    await change({kind:'resolution',verification:'reported',person:'person',basis:'recorded'});
    await evaluate("ui.view.bar.querySelector('[data-reset]').click();await ui.fetch()");
    a.deepEqual(await dates(),['','']);a.deepEqual(await rows(),['after','last','first','before']);
    a.deepEqual(await evaluate("Object.fromEntries(['start','end','kind','verification','person','basis'].map(key=>[key,ui.settings[key]]))"),{start:'',end:'',kind:'',verification:'',person:'',basis:'occurred'});
    const persisted=await evaluate('writes.at(-1)[2][ctx.viewKey]');
    a.equal(persisted.enabled,true);a.equal(persisted.start,'');a.equal(persisted.end,'');
    await fresh({saved:persisted});a.deepEqual(await dates(),['','']);a.deepEqual(await rows(),['after','last','first','before']);
    a.equal(await evaluate('JSON.stringify(workspace.library)===originalHistory'),true);
  });
  a.deepEqual(errors,[]);
});
