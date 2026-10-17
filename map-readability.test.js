const {test}=require('node:test'),a=require('node:assert/strict'),F=require('./workflow'),G=require('./map-groups');
function fixture(){
 const entity=(id,type,extra={})=>({id,type,name:id,status:'active',...extra});
 const entities=[entity('g','Part',{itemKind:'product',productFamily:'G65',productionFamily:'LDM'}),entity('q','Part',{itemKind:'product',productFamily:'LQ2',productionFamily:'LDM'}),entity('a','Production Step'),entity('b','Production Step'),entity('qa','Production Step'),entity('pcb','Part',{itemKind:'component'}),entity('foreign','Part',{itemKind:'component'}),entity('ldm','Resource',{resourceKind:'line',name:'LDM'}),entity('tem','Resource',{resourceKind:'line',name:'TEM'}),entity('storage','Resource',{resourceKind:'facility',storageRole:'material_intermediate'}),entity('machine','Resource',{resourceKind:'machine',machineSet:'Router set'}),entity('team','Organization',{name:'LDM production team'}),entity('tech','Person'),entity('leader','Person'),entity('temteam','Organization'),entity('temtech','Person')];
 const relations=[['a','applies_to','g'],['b','applies_to','g'],['qa','applies_to','q'],['a','precedes','b'],['a','requires','machine'],['qa','requires','machine'],['a','consumes','pcb'],['pcb','stored_at','storage'],['foreign','stored_at','storage'],['a','operated_in','ldm'],['qa','operated_in','ldm'],['team','supports_line','ldm'],['tech','member_of','team'],['leader','member_of','team'],['tech','reports_to','leader'],['temteam','supports_line','tem'],['temtech','member_of','temteam']].map(([from,type,to],i)=>({id:'r'+i,from,type,to}));
 return {id:'test',entities,relations,workstreams:{}};
}
test('explicit Part filtering does not expand shared storage into unrelated materials or lines',()=>{
 const p=fixture(),n=F.productionNetwork(p,{partIds:['g'],showStakeholders:true,showLineReferences:false});
 a(n.nodes.some(n=>n.id==='a'));a(!n.nodes.some(n=>['foreign','qa','tem','temteam','temtech'].includes(n.id)));a(n.nodes.some(n=>n.id==='tech'));a(n.nodes.some(n=>n.id==='storage'));
 a.equal(F.productionContextLayout(p,n).satellites.filter(s=>s.entity.id==='machine').length,1);
});
test('confirmed teams fold together and preserve contact links',()=>{
 const p=fixture(),graph={...p,context:new Set(),boundary:new Set()},open=G.universalGraph(graph),team=[...open.groups.values()].find(g=>g.name==='LDM production team');
 a(team);a.deepEqual(new Set(team.members.map(m=>m.id)),new Set(['team','tech','leader']));
 const folded=G.universalGraph(graph,[team.id]);a(!folded.entities.some(e=>e.id==='tech'));a(folded.relations.some(r=>r.from===team.id&&r.to==='ldm'));
});
test('focused Part routes are horizontal, isolated, retain satellite identities and bounds',()=>{
 const p=fixture(),n=F.productionNetwork(p,{partIds:['g','q'],showLineReferences:false,showStakeholders:true}),result=G.partRows(p,n,{showMachines:true,showComponents:true});
 const row=result.network.nodes.filter(n=>n.entity.type==='Production Step'&&n.partIds.includes('g'));
 a.equal(row.length,2);a.equal(result.layout.positions[row[0].id].y,result.layout.positions[row[1].id].y);
 a(result.layout.horizontal);a(result.layout.satellites.some(s=>s.entity.id==='machine'));
 a.equal(result.network.nodes.filter(n=>n.entity.id==='qa').length,1);
 assertBounds(result.network,result.layout);
});
function assertBounds(n,l){
 const boxes=[...n.nodes.filter(n=>l.positions[n.id]).map(n=>({...l.positions[n.id],w:194,h:60})),...(l.satellites||[]).map(s=>({...s,w:188,h:48}))];
 for(const b of boxes){a(b.x>=0&&b.y>=0);a(b.x+b.w<=l.width&&b.y+b.h<=l.height);}
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const b=boxes[i],c=boxes[j];a(b.x+b.w<=c.x||c.x+c.w<=b.x||b.y+b.h<=c.y||c.y+c.h<=b.y,JSON.stringify([b,c]));}
}
test('whole-network grouping reserves bounds on collapse and reopening',()=>{
 const p=fixture(),n=F.productionNetwork(p,{showStakeholders:true}),expanded=G.networkGroups(p,n,{collapsed:[]});
 a(expanded.layout.frames.some(f=>f.name==='G65'));a(expanded.layout.frames.some(f=>f.name==='LDM production team'));assertBounds(expanded.network,expanded.layout);
 const id=expanded.layout.frames.find(f=>f.name==='G65').id,folded=G.networkGroups(p,n,{collapsed:[id]});
 a(!folded.network.nodes.some(n=>n.entity.id==='a'));a(folded.network.edges.some(e=>e.from===id||e.to===id));assertBounds(folded.network,folded.layout);
 assertBounds(G.networkGroups(p,n,{collapsed:[]}).network,G.networkGroups(p,n,{collapsed:[]}).layout);
});
test('unknown branches reserve all satellite height, without ordering unknown main steps',()=>{
 const p=fixture();for(const id of ['pending','pending2','pending3','pending4','pending5']){p.entities.push({id,type:'Production Step',name:'Unconfirmed',status:'active'});p.relations.push({id:id+'-g',from:id,type:'applies_to',to:'g'});}
 for(let i=0;i<8;i++){p.entities.push({id:'input'+i,type:'Part',name:'input'+i,status:'active',itemKind:'component'});p.relations.push({id:'input-r'+i,from:'pending',type:i<4?'consumes':'produces',to:'input'+i});}
 const result=G.partRows(p,F.productionNetwork(p,{partIds:['g','q'],showLineReferences:false}));assertBounds(result.network,result.layout);
 const pending=result.network.nodes.find(n=>n.entity.id==='pending');a(pending.unconfirmed);a(!result.network.edges.some(e=>e.type==='precedes'&&(e.from===pending.id||e.to===pending.id)));
});
test('direct staff assignments survive strict Part filtering; other product output stays hidden',()=>{
 const p=fixture();p.entities.push({id:'assignment',type:'Assignment',name:'Assigned',status:'active'},{id:'specialist',type:'Person',name:'Specialist',status:'active'});
 p.relations.push({id:'scope',from:'assignment',type:'assignment_scope',to:'a'},{id:'assignee',from:'assignment',type:'assigned_to',to:'specialist'},{id:'other-output',from:'a',type:'produces',to:'q'});
 const n=F.productionNetwork(p,{partIds:['g'],showStakeholders:true,showLineReferences:false});a(n.nodes.some(n=>n.id==='specialist'));
 a(!F.productionContextLayout(p,n).satellites.some(s=>s.entity.id==='q'));
});
test('Global layout places product families before team context regardless of source order',()=>{
 const p=fixture();p.entities.sort((x,y)=>Number(y.type==='Person'||y.type==='Organization')-Number(x.type==='Person'||x.type==='Organization'));
 const graph=G.universalGraph(p),layout=G.universalLayout(graph,F.layout),family=layout.frames.find(f=>f.name==='G65'),team=layout.frames.find(f=>f.name==='LDM production team');
 a(family.y<team.y||family.y===team.y&&family.x<team.x);
});
test('proposed team memberships do not become confirmed groups',()=>{
 const p=fixture();p.relations.find(r=>r.from==='tech'&&r.type==='member_of').reviewState='proposed';const graph=G.universalGraph(p);a(!graph.owner.has('tech'));
});
test('shared-step order stays Part-specific when only one Part records a sequence',()=>{
 const p=fixture();p.relations.push({id:'shared-a',from:'a',type:'applies_to',to:'q'});const n=F.productionNetwork(p,{partIds:['g','q'],showLineReferences:false}),r=G.partRows(p,n);
 const g=r.network.nodes.find(n=>n.entity.id==='a'&&n.partIds.includes('g')),q=r.network.nodes.find(n=>n.entity.id==='a'&&n.partIds.includes('q'));a.equal(g.unconfirmed,false);a.equal(q.unconfirmed,true);
});
test('satellite materials keep recorded warehouse connections',()=>{
 const p=fixture(),r=G.partRows(p,F.productionNetwork(p,{partIds:['g'],showLineReferences:false}));
 a(r.network.edges.some(e=>e.type==='stored_at'&&e.to==='storage'&&e.from==='pcb'));a(r.layout.positions.pcb);
 assertBounds(r.network,r.layout);
});
module.exports={fixture,assertBounds};
