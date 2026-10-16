(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AnalysisViews=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const LEVEL={low:18,medium:50,high:82};
  const ENGAGEMENT=['unaware','resistant','neutral','supportive','leading'];
  function quadrant(entity){return LEVEL[entity.power]&&LEVEL[entity.influence]?{x:LEVEL[entity.influence],y:100-LEVEL[entity.power]}:null;}
  function engagementTrack(entity){const current=ENGAGEMENT.indexOf(entity.currentEngagement),desired=ENGAGEMENT.indexOf(entity.desiredEngagement);return current<0||desired<0?null:{current,desired};}
  function influenceMatrix(store,selectedIds=null){
    const stakeholders=store.entities.filter(e=>['Person','Organization'].includes(e.type)&&(!selectedIds||selectedIds.has(e.id)));
    const ids=new Set(stakeholders.map(e=>e.id)),cells=new Map();
    store.relations.filter(r=>r.type==='influences'&&ids.has(r.from)&&ids.has(r.to)).forEach(r=>cells.set(r.from+':'+r.to,true));
    return {stakeholders,cells};
  }
  function stakeholderGroups(people){
    const labels={office:'Office',factory:'Factory',external:'External',unknown:'Unclassified'};
    const areas=new Map();
    for(const person of people){
      const name=person.type==='Organization'?'Organizations':labels[person.workArea]||'Unclassified';
      const department=person.type==='Organization'?'Organizations':person.department||'Department not recorded';
      const role=person.type==='Organization'?'Organization':person.workerRole||person.title||'Role not recorded';
      if(!areas.has(name))areas.set(name,new Map());
      const departments=areas.get(name);if(!departments.has(department))departments.set(department,new Map());
      const roles=departments.get(department);if(!roles.has(role))roles.set(role,[]);
      roles.get(role).push(person);
    }
    const order=['Office','Factory','External','Unclassified','Organizations'];
    return [...areas].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0])).map(([name,departments])=>({name,
      departments:[...departments].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,roles])=>({name,
        roles:[...roles].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,people])=>({name,people:people.sort((a,b)=>a.name.localeCompare(b.name))}))
      }))
    }));
  }
  function reportingTree(store,people){
    const persons=people.filter(e=>e.type==='Person'),nodes=new Map(persons.map(entity=>[entity.id,{entity,reports:[]}])),roots=[];
    for(const node of nodes.values()){
      const managerId=store.relations.find(r=>r.type==='reports_to'&&r.from===node.entity.id)?.to;
      const manager=nodes.get(managerId);
      if(manager)manager.reports.push(node);else roots.push(node);
    }
    const sort=items=>items.sort((a,b)=>a.entity.name.localeCompare(b.entity.name)).forEach(item=>sort(item.reports));
    sort(roots);return roots;
  }
  function raciMatrix(store){
    const assignments=store.entities.filter(e=>e.type==='Assignment');
    const assignmentIds=new Set(assignments.map(e=>e.id));
    const scopeIds=new Set(store.relations.filter(r=>r.type==='assignment_scope'&&assignmentIds.has(r.from)).map(r=>r.to));
    const stakeholderIds=new Set(store.relations.filter(r=>r.type==='assigned_to'&&assignmentIds.has(r.from)).map(r=>r.to));
    const stakeholders=store.entities.filter(e=>stakeholderIds.has(e.id));
    const rows=store.entities.filter(e=>scopeIds.has(e.id)).map(scope=>{
      const cells=new Map();
      for(const assignment of assignments.filter(a=>store.relations.some(r=>r.type==='assignment_scope'&&r.from===a.id&&r.to===scope.id))){
        for(const relation of store.relations.filter(r=>r.type==='assigned_to'&&r.from===assignment.id)){
          if(assignment.raci)cells.set(relation.to,[cells.get(relation.to),assignment.raci].filter(Boolean).join('/'));
        }
      }
      const roles=[...cells.values()].flatMap(value=>value.split('/'));
      const accountable=roles.filter(role=>role==='A').length,responsible=roles.filter(role=>role==='R').length;
      const review=[accountable===0?'Missing A':accountable>1?'Multiple A':accountable+' accountable',responsible===0?'Missing R':''].filter(Boolean).join(' · ');
      return {scope,cells,review};
    });
    return {stakeholders,rows};
  }
  return {ENGAGEMENT,quadrant,engagementTrack,influenceMatrix,stakeholderGroups,reportingTree,raciMatrix};
});
