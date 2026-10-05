(function (root) {
  const M = typeof module === 'object' ? require('./ontology-model.js') : root.OntologyModel;
  const copy = value => JSON.parse(JSON.stringify(value));
  const norm = value => String(value || '').normalize('NFKD').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const aliases = {
    'supplier of': ['supplies',false], 'supplied by': ['supplies',true], 'provides': ['supplies',false],
    'belongs to part': ['revision_of',false], 'revision of': ['revision_of',false],
    'before': ['precedes',false], 'followed by': ['precedes',false], 'predecessor of': ['precedes',false],
    'applies to': ['applies_to',false], 'covers': ['applies_to',false],
    'uses component': ['consumes',false], 'input to': ['consumes',true], 'consumed by': ['consumes',true],
    'outputs': ['produces',false], 'makes': ['produces',false],
    'has influence on': ['influences',false], 'pressures': ['influences',false], 'shapes': ['influences',false],
    'logged against': ['records_on',false], 'meeting about': ['records_on',false], 'concerns': ['records_on',false]
  };
  function endpoint(project, value) {
    const exact=project.entities.find(e=>e.id===value); if(exact)return {id:exact.id,kind:'exact'};
    const key=norm(value), matches=project.entities.filter(e=>norm(e.id)===key||norm(e.name)===key);
    if(matches.length===1)return {id:matches[0].id,kind:'normalized'};
    return {id:'',kind:matches.length?'ambiguous':'missing'};
  }
  function previewRelations(project, inputRows, library=null) {
    const candidate=copy(project), outcomes=[], errors=[];
    for(const original of inputRows) {
      const id=String(original.id||'').trim(), rawType=norm(original.type), alias=aliases[rawType];
      let type=M.RELATION_TYPES.find(t=>norm(t)===rawType), reverse=false;
      if(!type&&alias)[type,reverse]=alias;
      const from=endpoint(candidate,reverse?original.to:original.from), to=endpoint(candidate,reverse?original.from:original.to);
      const resolved={id,type:type||String(original.type||'').trim(),from:from.id,to:to.id,evidence:String(original.evidence||'').trim()};
      for(const key of ['quantity','unit','basis','routePartId','reviewState'])if(original[key]!==undefined&&original[key]!=='')resolved[key]=original[key];
      if(resolved.routePartId){const route=endpoint(candidate,resolved.routePartId);if(route.id)resolved.routePartId=route.id;}
      resolved.scopeProjectId=M.defaultRelationScope(candidate,resolved,candidate.id);
      let status='ready', explanation='Exact relationship';
      if(!id||!type||from.kind==='missing'||to.kind==='missing') { status='rejected'; explanation=!type?'Unsupported relationship wording':'Endpoint not found'; }
      else if(from.kind==='ambiguous'||to.kind==='ambiguous') { status='needs_review'; explanation='Endpoint name matches multiple objects'; }
      else {
        const sameId=candidate.relations.find(r=>r.id===id), globalId=library?.relations.find(r=>r.id===id), sameEdge=candidate.relations.find(r=>r.type===type&&r.from===from.id&&r.to===to.id&&(r.scopeProjectId??null)===resolved.scopeProjectId);
        if(sameId) { status=sameEdge?.id===sameId.id?'duplicate':'conflict'; explanation=status==='duplicate'?'Relationship already exists':'Relationship ID already exists with different data'; }
        else if(globalId) { status='conflict'; explanation='Relationship ID already exists in Library; use a new ID'; }
        else if(sameEdge) { status='duplicate'; explanation='Equivalent relationship already exists'; }
        else {
          const error=M.validateRelation(candidate,resolved);
          if(error) { status='rejected'; explanation=error; }
          else {
            if(alias||reverse||from.kind!=='exact'||to.kind!=='exact'||type!==original.type) { status='normalized'; explanation='Wording, direction, or endpoint normalized'; }
            M.addRelation(candidate,resolved).id=id;
          }
        }
      }
      outcomes.push({original:copy(original),resolved,status,explanation});
      if(['rejected','needs_review','conflict'].includes(status)) errors.push(`${id||'Row'}: ${explanation}`);
    }
    return {rows:outcomes,errors,project:candidate};
  }
  const api={previewRelations};
  if(typeof module==='object')module.exports=api; else root.ImportResolver=api;
})(globalThis);
