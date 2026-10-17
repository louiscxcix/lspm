const M=require('./ontology-model');
function readMessages(){
  const script=String.raw`
import os,json
from datetime import datetime
from zoneinfo import ZoneInfo
os.environ['KAKAOCLI_BIN']='/opt/homebrew/bin/kakaocli'
from kakaotalk_mcp.reader import KakaoReader
try:
 r=KakaoReader();messages=[]
 for name in ['LS Production 1','SMT','NEXLIDE MQ']:
  safe=name.replace("'","''")
  ids=r._query("SELECT DISTINCT chatId FROM NTChatMeta WHERE type=3 AND lower(trim(content))=lower('"+safe+"')")
  if len(ids)!=1:raise RuntimeError('Ambiguous room')
  cid=ids[0][0]
  rows=r._query('SELECT m.logId,m.authorId,COALESCE(u.displayName,\'(unknown)\'),m.sentAt,m.type,m.message FROM NTChatMessage m LEFT JOIN NTUser u ON m.authorId=u.userId WHERE m.chatId='+str(cid)+" AND m.message IS NOT NULL AND m.message != '' ORDER BY m.sentAt,m.logId")
  for v in rows:messages.append({'room':name,'chatId':str(cid),'logId':str(v[0]),'authorId':str(v[1]),'sender':v[2],'time':datetime.fromtimestamp(v[3],ZoneInfo('America/Mexico_City')).isoformat(),'type':v[4],'text':v[5]})
 print(json.dumps(messages,ensure_ascii=False))
except Exception:
 raise SystemExit('Kakao read failed; sensitive diagnostics suppressed')
`;
  return JSON.parse(require('node:child_process').execFileSync('/Users/louis/.local/share/kakaotalk-mcp/.venv/bin/python',['-c',script],{encoding:'utf8',maxBuffer:4000000,timeout:45000}));
}
function apply(p,messages){
  const before=JSON.stringify(p),events=new Map();
  const object=(id,input)=>{let e=M.byId(p,id);if(!e){e=M.addEntity(p,input);e.id=id;e.privacy='local_only';}return e;};
  const link=(a,type,b)=>{if(!a||!b)return;if(!p.relations.some(r=>r.from===a.id&&r.type===type&&r.to===b.id))M.addRelation(p,{from:a.id,type,to:b.id,scopeProjectId:null,evidence:'Private Kakao report; reported state, not independently verified'});};
  for(const msg of messages){
    const system=msg.type===0,attachment=[2,27].includes(msg.type);
    const person=system?null:object('kakao-person-'+msg.authorId,{type:'Person',name:msg.sender==='(unknown)'?'Kakao sender · '+msg.authorId:msg.sender,context:'Kakao account identity only. Display name is not proof of identity, role or employer; no automatic merge with existing people.'});
    if(person)person.kakaoAuthorId=msg.authorId;
    const raw=object('kakao-evidence-'+msg.chatId+'-'+msg.logId,{type:'Evidence',name:msg.room+' · source '+msg.logId,rawLog:msg.text,context:'Private local Kakao source. Sender/time recorded by linked report Event. Attachment content not inspected.'});
    const e=object('kakao-message-'+msg.chatId+'-'+msg.logId,{type:'Event',name:msg.room+' · '+(system?'System record':attachment?'Attachment reference':msg.text.replace(/\s+/g,' ').slice(0,75)),occurredDate:msg.time.slice(0,10),occurredAt:msg.time,recordedAt:new Date().toISOString(),context:'Message sent at '+msg.time+' (America/Mexico_City). '+(system?'System metadata, not a production occurrence.':attachment?'Attachment contents not examined; placeholder is not evidence of its content.':'Sender-reported statement; not verified actual production state. Requests/questions/plans are not completed operations.')});
    link(e,'supported_by',raw);
    e.sourceChat=msg.room;e.sourceChatId=msg.chatId;e.sourceMessageId=msg.logId;e.sourceMessageType=msg.type;
    events.set(msg.logId,e);if(person)link(e,'reported_by',person);
    if(!system&&!attachment){
      // A family mention is not evidence that the message concerns its Main route.
      p.relations=p.relations.filter(r=>!(r.from===e.id&&r.type==='records_on'&&r.to==='ls-part-g65-main'&&r.evidence==='Private Kakao report; reported state, not independently verified'));
      for(const [pattern,id] of [[/\bG65\b/i,'ls-family-g65'],[/\bG65\s+Cornering\b/i,'ls-part-g65-cornering'],[/\bT1[- ]?XL\b/i,'ls-part-t1xl'],[/\bLDM\b/i,'obj-muw1aume-munsi']])if(pattern.test(msg.text))link(e,'records_on',M.byId(p,id));
      const line=msg.room==='NEXLIDE MQ'?p.entities.find(x=>x.type==='Resource'&&x.resourceKind==='line'&&x.name==='Nexlide'):null;link(e,'records_on',line);
    }
  }
  const finding=(id,type,name,logIds,note,targetIds=[])=>{
    const obj=object('kakao-'+id,{type,name,status:type==='Work Item'?'planned':'active',context:note+' Report history preserved; no automatic live status or inventory update.'});
    for(const logId of logIds)link(events.get(logId),'records_on',obj);
    for(const target of targetIds){const e=M.byId(p,target);if(type==='Issue'&&e?.type==='Production Step')link(obj,'potentially_affects',e);}
    return obj;
  };
  finding('ldm-support','Work Item','LDM · operator support reported',['3944923640947795969'],'Raúl reported 6 support operators sent to LDM and 3 to packaging. This is an allocation report, not 9 additional confirmed permanent employees.');
  finding('lq2-heatsink-stop','Issue','LQ2 Module · heatsink irregularity / stop',['3945168490240456705'],'Alexis reported stop and heatsink lot change in progress. Exact LQ2 model and lot unknown; do not map to OPT/LWR by guess.');
  finding('t1-tray-shortage','Issue','T1-2 · 5PKQ02806A tray shortage / press stop',['3945373381980692481','3945505502886844417','3945629103655829507','3945636234720557057'],'Angel reported 50 trays, later Mane reported presses stopped due to shortage; Alexis later reported trays not received. Preserve different timestamps and reports. LOER spelling unresolved; no automatic Upper/Lower assignment.');
  finding('router2-breakage','Issue','Router 2 · repeated bit breakage',['3945719332799911938','3945719375053330433'],'Silverio reported repeated bit breakage and that it had been reported. Router 2 is a reported equipment reference; physical asset/Part allocation unconfirmed.');
  const stacking=p.entities.filter(e=>e.type==='Production Step'&&/stacking/i.test(e.productionStage||'')&&/g65/i.test(e.name)).map(e=>e.id);
  finding('g65-stacking-stop','Issue','G65 · Hot Stacking stop / tooling change',['3945725608606320641','3946066334990852097'],'10/6 10:32 Silverio reported stop. 21:49 Amaury reported tooling change complete, four variants validated (7 pcs per model) with Quality, two stations ready to resume. Ready is not an actual restart or completed production report.',stacking);
  finding('g65-stacking-validation','Work Item','G65 · tooling validation / Rodolfo support',['3946066334990852097'],'Amaury reported Upper RH/Lower RH/Upper LH/Lower LH rivet dimensions validated; one tray of 7 per model. Rodolfo Maya (Nexlide engineer, mentioned not sender) supported/trained. No cycle time or individual station assignment inferred.');
  finding('t1xl-trays','Issue','T1XL · Lower trays / magazine shortage',['3944930233221308417','3945151675339878401'],'허태주 requested large magazine and Lower trays; later magazine received but Lower trays still missing. Delivery promise is not receipt.');
  finding('u717-material-shortage','Issue','U717 · connector / LED shortage',['3944972930933483521'],'이지성 self-identified Materials team; all connectors/LED exhausted except PCB, requested 1047A/1047B first. Values reflect reported condition at message time.');
  finding('smt-inventory-discrepancy','Issue','Starpro · system stock versus physical availability',['3945052376656693249','3945066090771578881','3945068288856442881','3945103615874091009'],'Upper PCB reportedly not received; system quantities 9,776 and 25,376 cited, based on previous-month count. Do not use system values as confirmed physical WIP.');
  finding('smt-plan-requests','Work Item','Starpro SMT · daily production plan request',['3944972300260630529','3944995779451949058','3944999037038413826','3945636757244076034','3945641634070286340'],'Sehyeon, BY Jeong and Félix requested plans; BY Jeong requested daily before 08:00. ^_^ reported plan emailed and later pending material confirmation. Do not schedule an automation or infer actual recipient identity.');
  finding('t1xl-plan-v1','Work Item','T1XL · requested plan 10/6 14:39',['3945849848139608065'],'Requested: RH Lower97C 1500; RH Upper97C3000; LH Lower97D500; RH Lower97D500 on10/7 or8; LH97E1500. Plan request, not actual output.');
  finding('t1xl-plan-v2','Work Item','T1XL · revised quantities 10/6 14:51',['3945856229647314945'],'Revised requested RH Lower97C1000, LH97E1000; other quantities retained. 1.5K sets and A/B1K reported. Keep this version separately; SKU/rank codes not automatically aliased.');
  finding('t1xl-plan-v3','Work Item','T1XL · revised sequence 10/6 16:16',['3945898952761370626'],'Latest explicit request: 10/6 RH Lower97C1000; 10/7 RH Lower97D500, RH Upper97C3000, LH Lower97D500; 10/8 LH Lower97E1000. E-line request OPT OB RH, then LH, then STD IB RH. No actual machine change or acceptance implied.');
  finding('rekit','Issue','SMT · quantity change requires new kitting',['3945853300896714753','3945854274646331393','3945857023651893249','3945857361184313345'],'^_^ reported quantity mismatch and need to re-kit because material issuance quantities change. Person behind ^_^ unknown.');
  finding('nxd-stop','Issue','NXD · line stop from material shortage',['3945772662466301953','3945772904905461761','3945873868362633217'],'^_^ reported material-shortage stop, repeated at15:27. NXD alias/physical line unresolved; do not automatically equate this supplier-side line to internal Nexlide.');
  finding('connector-transfer','Work Item','Material transfer · external warehouse to Kaizen',['3945875053490978817','3945876060358819841','3945876697598525442','3945905026482716673'],'신성종 reported78K moving from external warehouse to Kaizen; Quality/Purchasing/SCM checking system issue. Departure reported16:28. Exact SKU, destination receipt and duration unknown.');
  finding('iqc-shipping-delay','Issue','IQC · shipment blocked pending inspection',['3945975570268268545','3945996391012812803'],'신성종:047B/281B/109A IQC result at least4h away, cannot ship now; later shipment planned around20:00. Planned departure does not confirm dispatch.');
  finding('urgent-materials','Work Item','T1 H2 SMK · urgent material request',['3945968837273196545'],'이지성 requested3PCR03675A RH PCB additional1100EA;3COR00128A minimum3000EA;2OPD00056C minimum4000EA by night vehicle. Request quantities, not inventory. T1 H2 SMK not mapped to T1XL without confirmation.');
  finding('nexlide-staff','Work Item','Nexlide · staffing / coating report',['3945631825685106689'],'Raúl reported19 operators and2 maintenance technicians, U717 LH on coating. No named worker assignments, capacity or per-machine staff count inferred.');
  finding('nexlide-eol3-stop','Issue','Nexlide · EOL #3 adjustment stop',['3945633039449575425'],'Raúl reported EOL#3 stopped for Korean-team adjustments. Physical asset identity and later restart unknown.');
  finding('nexlide-packing','Work Item','Nexlide · reported packed quantities',['3944954216316659713','3945694247615713281'],'10/5:U717 LH2 pallets/RH11 boxes.10/6:U717 LH8 boxes/RH1 pallet;P702 RH6 boxes/LH1 box. Units preserved; pieces per box/pallet unknown. Do not sum or convert to pieces.');
  M.validateStore(p);return {changed:before!==JSON.stringify(p),messages:messages.length,events:events.size};
}
module.exports={apply,readMessages};
if(require.main===module){const d=require('./local-store').openStore('../.local-data/ontology.sqlite');try{const messages=readMessages(),w=d.load();require('node:fs').copyFileSync('../.local-data/ontology.sqlite','../.local-data/ontology-before-kakao-'+Date.now()+'.sqlite');const result=apply(w.library,messages);if(result.changed)d.save(w,'library',w.revision);console.log(JSON.stringify({...result,revision:d.load().revision,privacy:'local_only',projectMembershipsChanged:false}));}finally{d.close();}}
