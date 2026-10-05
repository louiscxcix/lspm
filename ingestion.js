(function(root){
  const M=typeof module==='object'?require('./ontology-model.js'):root.OntologyModel;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function buildPrompt(project,sourceMeta){
    const index=project.entities.map(e=>({id:e.id,type:e.type,name:e.name}));
    return `Extract project facts from the supplied source as strict JSON. Do not invent missing facts.\nSource: ${JSON.stringify(sourceMeta)}\nExisting ontology: ${JSON.stringify(index)}\nAllowed entity types: ${M.ENTITY_TYPES.filter(t=>t!=='Project').join(', ')}\nAllowed relationship types: ${M.RELATION_TYPES.join(', ')}\nReturn {summary,objects,relationships,unresolved}. Each object needs candidateId,suggestedAction(create|link_existing),type,name,confidence,sourceExcerpt. Each relationship needs candidateId,type,from,to,confidence,sourceExcerpt. Use YYYY-MM-DD dates. For production material flow, classify route Parts as itemKind=product and every physical input/output as a separate Part with itemKind=component. Use one consumes or produces relationship per Component; never combine Router outputs into a text bundle. If stated, include positive integer quantity, unit, basis, and routePartId (existing ID or candidateId) on that relationship. Quantity is yield per basis, not live WIP. Put unknown machine IDs, LH yield, route order, and missing quantities in unresolved rather than inventing them. Production scans are Event occurrences, not new operation definitions: use productionEventKind (arrived|started|completed|failed|held|released), occurredAt (ISO timestamp with explicit timezone), traceId and traceKind (unit|batch) only when present in the source. Connect a timing Event with records_on to exactly one Part and one Production Step; preserve source evidence. Missing serial/batch IDs, timezone, or Part/Step identity stay unresolved; never infer pending time or equate a Component trace with a finished product trace.`;
  }
  function validateDraft(project,output){
    const errors=[],ids=new Set(),objects=Array.isArray(output?.objects)?copy(output.objects):[],relationships=Array.isArray(output?.relationships)?copy(output.relationships):[];
    for(const item of [...objects,...relationships]){
      if(!item.candidateId||ids.has(item.candidateId))errors.push('Missing or duplicate candidate ID.');
      ids.add(item.candidateId);
    }
    for(const item of objects){
      if(!['create','link_existing'].includes(item.suggestedAction))errors.push(`${item.candidateId}: invalid action.`);
      if(item.suggestedAction==='create'&&(!M.ENTITY_TYPES.includes(item.type)||item.type==='Project'||!String(item.name||'').trim()))errors.push(`${item.candidateId}: invalid object.`);
      if(item.suggestedAction==='link_existing'){
        const existing=M.byId(project,item.matchedObjectId);
        if(!existing)errors.push(`${item.candidateId}: existing object not found.`);
        else if(existing.type!==item.type)errors.push(`${item.candidateId}: existing object type mismatch.`);
      }
    }
    const refs=new Set([...project.entities.map(e=>e.id),...objects.map(o=>o.candidateId)]);
    for(const item of relationships){
      if(!refs.has(item.from)||!refs.has(item.to)||!M.RELATION_TYPES.includes(item.type))errors.push(`${item.candidateId}: invalid relationship reference.`);
      if(item.routePartId&&!refs.has(item.routePartId))errors.push(`${item.candidateId}: route Part reference not found.`);
      if(item.quantity!==undefined&&item.quantity!==''&&(!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<=0))errors.push(`${item.candidateId}: material quantity must be a positive whole number.`);
    }
    return {summary:String(output?.summary||''),objects,relationships,unresolved:Array.isArray(output?.unresolved)?copy(output.unresolved):[],errors};
  }
  function applySelected(project,draft,selected,meta){
    const next=copy(project),map=new Map(),now=new Date().toISOString();
    const provenance={createdBy:'ai_suggested',confirmedBy:meta.confirmedBy,confirmedAt:now,sourceIds:[meta.sourceId],extractionJobId:meta.extractionJobId||'',sourceExcerpt:''};
    for(const item of draft.objects){
      if(!selected.has(item.candidateId))continue;
      if(item.suggestedAction==='link_existing'){
        if(!M.byId(next,item.matchedObjectId)){
          const existing=meta.library?.entities.find(e=>e.id===item.matchedObjectId);
          if(!existing)throw Error('Reviewed Library object is missing: '+item.matchedObjectId);
          next.entities.push({...existing,projectId:next.id});
        }
        map.set(item.candidateId,item.matchedObjectId);continue;
      }
      const entity=M.addEntity(next,item); entity.sourceExcerpt=String(item.sourceExcerpt||''); Object.assign(entity,provenance,{sourceExcerpt:entity.sourceExcerpt}); map.set(item.candidateId,entity.id);
    }
    if(meta.addEvidence){
      const evidence=M.addEntity(next,{type:'Evidence',name:meta.filename||'Retained source',status:'active',context:'Retained local source'});
      Object.assign(evidence,provenance,{sourceId:meta.sourceId});
    }
    for(const item of draft.relationships){
      if(!selected.has(item.candidateId))continue;
      const from=map.get(item.from)||M.byId(next,item.from)?.id,to=map.get(item.to)||M.byId(next,item.to)?.id;
      if(!from||!to)throw Error(item.candidateId+': selected relationship has an unselected endpoint. Select its objects or deselect this relationship.');
      try{
        const routePartId=item.routePartId?(map.get(item.routePartId)||M.byId(next,item.routePartId)?.id):undefined;
        if(item.routePartId&&!routePartId)throw Error('selected route Part has an unselected endpoint.');
        const scoped={...item,from,to,routePartId,scopeProjectId:M.defaultRelationScope(next,{...item,from,to},next.id)};
        const relation=M.addRelation(next,scoped);Object.assign(relation,provenance,{sourceExcerpt:String(item.sourceExcerpt||'')});
      }
      catch(error){throw Error(item.candidateId+': '+error.message);}
    }
    return {project:next,skipped:[]};
  }
  const api={buildPrompt,validateDraft,applySelected};
  if(typeof module==='object')module.exports=api;else root.Ingestion=api;
})(globalThis);
