(function(root){
 const groups={assembly:'조립·체결',coating:'코팅',electrical:'PCB·LED·전기',appearance:'외관·자재',identification:'식별 코드',traceability:'LOT·MES',reference:'기존 파트 관련 문제'};
 function augment(project,network,layout,expanded=new Set(),{showPeople=true}={}){
  const byId=new Map(project.entities.map(e=>[e.id,e])),nodes=[...network.nodes],edges=[...network.edges],positions={...layout.positions},policies=project.entities.filter(e=>e.qualityKind==='policy'),byPart=new Map(project.relations.filter(r=>r.type==='applies_to'&&byId.get(r.from)?.qualityKind==='policy').map(r=>[r.to,byId.get(r.from)]));
  if(!policies.length)return{network,layout};
  const width=Math.max(layout.width,800),gap=28,cardW=194,rowH=88;let x=24,y=layout.height+48,shelfHeight=0,maxX=width,maxY=layout.height;
  const refs=id=>project.relations.filter(r=>r.type==='quality_reference'&&r.from===id).map(r=>byId.get(r.to)).filter(Boolean);
  for(const part of network.parts||[]){const policy=byPart.get(part.id);if(!policy)continue;const open=expanded.has(policy.id),local=[],links=[],blockPositions={};let bottom=60;
   const add=(entity,key,px,py,kind,label,subtitle='',toggle='')=>{const id=policy.id+'-view-'+key;local.push({id,entity,partIds:[part.id],qualityViewKind:kind,qualityLabel:label||entity.name,qualitySubtitle:subtitle,qualityToggle:toggle,qualityExpanded:expanded.has(toggle)});blockPositions[id]={x:px,y:py};bottom=Math.max(bottom,py+60);return id;};
   const edge=(from,to,label,condition='')=>links.push({id:'quality-view-'+from+'-'+to,from,to,type:'quality_reference',partIds:[part.id],qualityEdge:true,evidence:condition||label,label});
   const cases=new Set(project.relations.filter(r=>r.type==='quality_case_of'&&r.to===policy.id&&byId.get(r.from)?.qualityKind==='case'&&!['resolved','completed','cancelled','archived'].includes(byId.get(r.from).status)).map(r=>r.from));
   const rootId=add(policy,'root',0,0,'policy',part.name+' · 불량',cases.size?cases.size+' 미해결 발생 건':open?'발생 건수 미등록 · 접기':'발생 건수 미등록 · 펼치기',policy.id);
   let blockWidth=cardW;
   if(open){blockWidth=4*(cardW+gap)-gap;const visual=refs(policy.id).find(e=>e.qualityKind==='visual'),storage=visual&&project.relations.filter(r=>r.from===visual.id&&r.type==='precedes').map(r=>byId.get(r.to)).find(e=>e?.qualityKind==='storage');
    const visualId=visual?add(visual,'visual',cardW+gap,0,'visual',visual.name,'제품군별 확인'):null,storageId=storage?add(storage,'storage',2*(cardW+gap),0,'storage','Storage · 처리 판정','Madian · 실제 장소 미확정'):null;
    if(visualId)edge(rootId,visualId,'문제 발견 시');if(visualId&&storageId)edge(visualId,storageId,'Visual 확인 후 Storage');
    if(visual)for(const operation of refs(visual.id).filter(e=>e.type==='Production Step')){const existing=network.nodes.find(n=>n.entity.id===operation.id&&n.partIds?.includes(part.id));if(existing)edge(existing.id,visualId,'해당 제품군 Visual 확인');}
    if(storage&&showPeople){const assignments=project.relations.filter(r=>r.type==='assignment_scope'&&r.to===storage.id).map(r=>r.from),manager=project.relations.filter(r=>r.type==='assigned_to'&&assignments.includes(r.from)).map(r=>byId.get(r.to)).find(Boolean);if(manager){const id=add(manager,'manager',3*(cardW+gap),0,'contact',manager.name,'Storage 처리 담당');edge(storageId,id,'담당');}}
    const definitions=refs(policy.id).filter(e=>e.qualityKind==='defect'||['Risk','Issue'].includes(e.type));let routeY=rowH;
    for(const route of refs(policy.id).filter(e=>e.qualityKind==='route')){
     const routeKey=policy.id+':'+route.id,routeOpen=expanded.has(routeKey),routeId=add(route,'route-'+route.id,0,routeY,'route',route.name,routeOpen?'조건·문제 접기':'조건·문제 펼치기',routeKey);edge(storageId||rootId,routeId,'판정 후 선택',route.context);
     if(routeOpen){const applicable=definitions.filter(e=>(e.qualityDisposition||'hold')===route.qualityDisposition),buckets=new Map();for(const e of applicable){const key=e.qualityGroup||'reference';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(e);}let childY=routeY;
      if(!applicable.length)add(route,'condition-'+route.id,cardW+gap,childY,'condition','사례별 판정 필요','코드별 처리 경로 미확정');
      for(const [group,items]of buckets){const key=routeKey+':'+group,catId=add(policy,'category-'+route.id+'-'+group,cardW+gap,childY,'category',groups[group]||group,items.length+' 기준·참조 · '+(expanded.has(key)?'접기':'펼치기'),key);edge(routeId,catId,'문제 유형');
       if(expanded.has(key)){items.forEach((e,i)=>{const defId=add(e,'def-'+route.id+'-'+e.id,2*(cardW+gap)+(i%2)*(cardW+gap),childY+Math.floor(i/2)*rowH,'defect',e.name,e.qualityColor?(e.qualityColor==='red'?'빨강':'노랑')+' · '+(e.qualityDocument?'LQ2 참고·적용 확인 필요':'발생 기록 아님'):'기존 참조 · 실제 발생 별도');edge(catId,defId,'기준·참조');});childY+=Math.max(1,Math.ceil(items.length/2))*rowH;}else childY+=rowH;
      }
      const targets=refs(route.id).filter(e=>e.type==='Production Step');for(const [i,t]of targets.entries()){const id=add(t,'target-'+route.id+'-'+t.id,cardW+gap,childY+i*rowH,'target',t.name,'조건 충족·승인 후만');edge(routeId,id,'조건부 처리 대상',route.context);}childY+=targets.length*rowH;
      if(showPeople){const assignments=project.relations.filter(r=>r.type==='assignment_scope'&&r.to===route.id).map(r=>r.from),contacts=project.relations.filter(r=>r.type==='assigned_to'&&assignments.includes(r.from)).map(r=>byId.get(r.to)).filter(Boolean);contacts.forEach((e,i)=>{const id=add(e,'contact-'+route.id+'-'+e.id,cardW+gap+(i%3)*(cardW+gap),childY+Math.floor(i/3)*rowH,'contact',e.name,'LOT 생성 문의 · 승인권 미확정');edge(routeId,id,'문의');});childY+=Math.ceil(contacts.length/3)*rowH;}
      routeY=Math.max(childY,routeY+rowH)+rowH;
     }else routeY+=rowH;
    }
   }
   if(x>24&&x+blockWidth>width){y+=shelfHeight+gap;x=24;shelfHeight=0;}
   for(const n of local){const p=blockPositions[n.id];positions[n.id]={x:x+p.x,y:y+p.y};}nodes.push(...local);edges.push(...links);
   const anchor=network.nodes.find(n=>n.entity.type==='Production Step'&&n.partIds?.includes(part.id)&&/visual/i.test(n.entity.productionStage||n.entity.name))||network.nodes.find(n=>n.entity.type==='Production Step'&&n.partIds?.includes(part.id)&&!n.entity.branchKind);
   if(anchor)edges.push({id:'quality-part-anchor-'+policy.id,from:anchor.id,to:rootId,type:'quality_reference',partIds:[part.id],qualityEdge:true,label:'관련 파트 불량·대응',evidence:'Response context only; not an extra production step or automatic transfer.'});
   x+=blockWidth+gap;shelfHeight=Math.max(shelfHeight,bottom);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y+bottom+gap);
  }
  return{network:{...network,nodes,edges},layout:{...layout,positions,width:maxX,height:maxY}};
 }
 const api={augment};if(typeof module==='object')module.exports=api;else root.QualityMap=api;
})(globalThis);
