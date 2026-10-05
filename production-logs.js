(function(root){
  const M=typeof module==='object'?require('./ontology-model.js'):root.OntologyModel;
  const F=typeof module==='object'?require('./workflow.js'):root.PMWorkflow;
  const normalized=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s_-]/g,'');
  const aliases={traceId:['traceid','unitid','serial','barcode','batch','lote'],step:['step','stepid','process','operation','공정'],kind:['event','kind','eventkind','status'],occurredAt:['timestamp','time','occurredat','시간']};
  const kinds={arrived:'arrived',arrival:'arrived',도착:'arrived',started:'started',start:'started',시작:'started',completed:'completed',complete:'completed',finished:'completed',완료:'completed',failed:'failed',fail:'failed',held:'held',hold:'held',released:'released',release:'released'};
  function stepsForPart(project,partId){
    const ids=new Set(project.relations.filter(r=>['applies_to','consumes','produces'].includes(r.type)&&r.to===partId).map(r=>r.from));
    return project.entities.filter(e=>e.type==='Production Step'&&ids.has(e.id));
  }
  function rowError(project,partId,row){
    if(!['Part','Part Revision'].includes(M.byId(project,partId)?.type))return 'Choose a Part.';
    if(typeof row.traceId!=='string'||!row.traceId.trim()||row.traceId.length>120)return 'Record a unit serial or batch identifier.';
    if(!stepsForPart(project,partId).some(step=>step.id===row.stepId))return 'Choose an operation linked to this Part.';
    if(!M.PRODUCTION_EVENT_KINDS.includes(row.kind))return 'Choose an event kind.';
    if(!M.isTimestamp(row.occurredAt))return 'Use ISO date/time with timezone, e.g. 2026-10-04T09:00:00-06:00.';
    return '';
  }
  function preview(project,partId,text){
    if(!text.trim()||text.length>200000)throw Error('Paste a log up to 200,000 characters.');
    if(!['Part','Part Revision'].includes(M.byId(project,partId)?.type))throw Error('Choose a Part.');
    let parsed;
    try{parsed=F.parseCSV(text,text.split(/\r?\n/)[0].includes('\t')?'\t':',');}
    catch(error){return {rows:[],rawOnly:true,note:'Source will be saved as raw evidence. '+error.message};}
    const columns=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,parsed.headers.find(header=>names.includes(normalized(header)))]));
    if(Object.values(columns).some(value=>!value))return {rows:[],rawOnly:true,note:'Source will be saved as raw evidence. Map its columns later to trace ID, operation, event and timestamp.'};
    const steps=stepsForPart(project,partId);
    const rows=parsed.rows.map((input,index)=>{
      const label=input[columns.step],matches=label?.trim()?steps.filter(step=>step.id===label||normalized(step.name)===normalized(label)||step.productionStage&&normalized(step.productionStage)===normalized(label)):[];
      const row={row:index+2,traceId:input[columns.traceId],stepId:matches.length===1?matches[0].id:'',stepLabel:label,kind:kinds[normalized(input[columns.kind])]||input[columns.kind],occurredAt:input[columns.occurredAt],include:true};
      row.error=rowError(project,partId,row);return row;
    });
    return {rows,rawOnly:false,note:'Review matching operations and timestamps. Nothing has been saved yet.'};
  }
  function linkedEvents(project){
    return project.entities.filter(e=>e.type==='Event'&&e.productionEventKind&&e.traceId&&['unit','batch'].includes(e.traceKind)&&M.isTimestamp(e.occurredAt)).flatMap(event=>{
      const links=project.relations.filter(r=>r.from===event.id&&r.type==='records_on').map(r=>M.byId(project,r.to)).filter(Boolean);
      const parts=links.filter(e=>['Part','Part Revision'].includes(e.type)),steps=links.filter(e=>e.type==='Production Step');
      if(parts.length!==1||steps.length!==1||!stepsForPart(project,parts[0].id).some(step=>step.id===steps[0].id))return [];
      return [{event,partId:parts[0].id,stepId:steps[0].id,time:Date.parse(event.occurredAt),sources:project.relations.filter(r=>r.from===event.id&&r.type==='supported_by').map(r=>r.to)}];
    });
  }
  const fingerprint=item=>[item.partId,item.stepId,item.event.traceKind,item.event.traceId,item.event.productionEventKind,new Date(item.time).toISOString()].join('|');
  function append(project,{partId,text,name='',rows=[],traceKind='unit'}){
    if(!['unit','batch'].includes(traceKind))throw Error('Choose unit or batch trace.');
    if(!text.trim()||text.length>200000)throw Error('Paste a log up to 200,000 characters.');
    if(!['Part','Part Revision'].includes(M.byId(project,partId)?.type))throw Error('Choose a Part.');
    const accepted=rows.filter(row=>row.include!==false);
    for(const row of accepted){const error=rowError(project,partId,row);if(error)throw Error('Row '+row.row+': '+error);}
    const part=M.byId(project,partId),now=new Date().toISOString();
    const evidence=M.addEntity(project,{type:'Evidence',name:(name.trim()||part.name+' process log · '+now.slice(0,10)).slice(0,120),context:'Retained production log; '+accepted.length+' reviewed event rows.',rawLog:text,recordedAt:now});
    const connect=(from,type,to)=>M.addRelation(project,{from,type,to,evidence:'Reviewed production log',scopeProjectId:project.id==='library'?null:project.id});
    connect(partId,'supported_by',evidence.id);
    const seen=new Set(linkedEvents(project).map(fingerprint));let added=0,duplicates=0;
    project.workstreams||={};if(project.id!=='library')project.workstreams[evidence.id]=['production'];
    for(const row of accepted){
      const traceId=row.traceId.trim(),time=new Date(row.occurredAt).toISOString(),key=[partId,row.stepId,traceKind,traceId,row.kind,time].join('|');
      if(seen.has(key)){duplicates++;continue;}seen.add(key);
      const event=M.addEntity(project,{type:'Event',name:(part.name+' · '+row.kind+' · '+traceId).slice(0,120),productionEventKind:row.kind,occurredAt:time,occurredDate:row.occurredAt.slice(0,10),traceId,traceKind,status:'completed',context:'Reviewed log row '+row.row});
      connect(event.id,'records_on',partId);connect(event.id,'records_on',row.stepId);connect(event.id,'supported_by',evidence.id);
      if(project.id!=='library')project.workstreams[event.id]=['production'];added++;
    }
    return {evidence,added,duplicates};
  }
  function pending(project,{partIds=null,start='',end=''}={}){
    const allowed=partIds===null?null:new Set(partIds),groups=new Map(),seen=new Set();
    for(const item of linkedEvents(project)){
      const key=fingerprint(item);if(seen.has(key))continue;seen.add(key);
      if(allowed&&!allowed.has(item.partId))continue;
      const trace=[item.partId,item.event.traceKind,item.event.traceId].join('|');
      if(!groups.has(trace))groups.set(trace,[]);groups.get(trace).push(item);
    }
    const intervals=[];
    for(const items of groups.values()){
      const order={arrived:0,started:1,completed:2};items.sort((a,b)=>a.time-b.time||(order[a.event.productionEventKind]??3)-(order[b.event.productionEventKind]??3));
      const arrivals=new Map(),active=new Set();let previous=null;
      for(const item of items){
        const kind=item.event.productionEventKind;
        if(kind==='arrived'&&!active.has(item.stepId)&&!arrivals.has(item.stepId))arrivals.set(item.stepId,item);
        if(kind==='started'){
          if(active.has(item.stepId))continue;active.add(item.stepId);
          const arrival=arrivals.get(item.stepId),validPrevious=previous&&previous.stepId!==item.stepId&&project.relations.some(r=>r.type==='precedes'&&r.from===previous.stepId&&r.to===item.stepId);
          const from=arrival||(validPrevious?previous:null);arrivals.delete(item.stepId);
          const endedAt=new Date(item.time).toISOString();
          if(from&&from.time<=item.time&&(!start||endedAt.slice(0,10)>=start)&&(!end||endedAt.slice(0,10)<=end))intervals.push({partId:item.partId,stepId:item.stepId,traceId:item.event.traceId,seconds:(item.time-from.time)/1000,basis:arrival?'arrival → start':'previous completion → start',fromEventId:from.event.id,toEventId:item.event.id,endedAt,sourceIds:[...new Set([...from.sources,...item.sources])]});
          previous=null;
        }
        if(kind==='completed'){previous=item;active.delete(item.stepId);arrivals.delete(item.stepId);}
        if(kind==='failed'){active.delete(item.stepId);previous=null;}
      }
    }
    return intervals;
  }
  function metric(project,stepId,options={}){
    const intervals=pending(project,options).filter(item=>item.stepId===stepId),sorted=intervals.map(item=>item.seconds).sort((a,b)=>a-b);
    const n=sorted.length,median=n?(sorted[Math.floor(n/2)]+sorted[Math.ceil(n/2)-1])/2:null;
    return {seconds:median,count:n,intervals};
  }
  const api={stepsForPart,rowError,preview,append,linkedEvents,pending,metric};
  if(typeof module==='object')module.exports=api;else root.ProductionLogs=api;
})(globalThis);
