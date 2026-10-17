function removePrivateRecords(workspace){
  const privateIds=new Set([workspace.library,...workspace.projects].flatMap(p=>p.entities.filter(e=>e.privacy==='local_only').map(e=>e.id)));
  for(const p of [workspace.library,...workspace.projects]){
    p.entities=p.entities.filter(e=>!privateIds.has(e.id));
    p.relations=p.relations.filter(r=>!privateIds.has(r.from)&&!privateIds.has(r.to));
    if(p.workstreams)for(const id of privateIds)delete p.workstreams[id];
    delete p.changes;
  }
  return workspace;
}
module.exports={removePrivateRecords};
