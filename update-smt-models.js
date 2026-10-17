const M=require('./ontology-model');
function apply(p){
 const before=JSON.stringify(p),evidence='IMG_4149.HEIC; user confirmed SMT outputs are PCB models, downstream product mapping deferred.';
 const ensure=(id,input)=>{let e=M.byId(p,id);if(!e){e=M.addEntity(p,input);e.id=id;}(p.workstreams||={})[id]=['production'];return e;};
 const link=(from,type,to)=>{if(!p.relations.some(r=>r.from===from&&r.type===type&&r.to===to))M.addRelation(p,{from,type,to,scopeProjectId:null,evidence});};
 const root=M.byId(p,'ls-smt-source-line');if(!root)throw Error('Existing SMT line required.');
 for(const n of [1,2]){const line=ensure('smt-line-'+n,{type:'Resource',name:'SMT · Line '+n,resourceKind:'line',tier:'SMT / Line '+n,context:evidence+' Detailed process sequence, machines, model cycle times and individual assignments unconfirmed.'});link(line.id,'part_of',root.id);}
 for(const [id,name,label,line,side] of [['smt-g65-pcb','G65 PCB','G65',2,''],['smt-jp-rh-pcb','JP-RH PCB','JP-RH',2,'RH'],['smt-lq2-hb-pcb','LQ2-HB PCB','LQ2-HB',1,''],['smt-lq2-lh-pcb','LQ2-LH PCB','LQ2-LH',1,'LH'],['smt-lq2-rh-pcb','LQ2-RH PCB','LQ2-RH',1,'RH']]){
  const pcb=ensure(id,{type:'Part',name,itemKind:'component',productionFamily:'SMT',sourcePartName:label,...(side?{side}:{}),context:evidence+' PCB identity label only, not a manufacturer SKU. Downstream finished product and Unit Time unconfirmed.'});if(!M.isComponentPart(pcb))throw Error('PCB identity requires review.');link('smt-line-'+line,'produces',pcb.id);
 }
 M.validateStore(p);return before!==JSON.stringify(p);
}
module.exports={apply};
if(require.main===module){(async()=>{const path=require('node:path'),db=require('./local-store').openStore(path.join(__dirname,'..','.local-data','ontology.sqlite'));try{await db.backup(path.join(__dirname,'..','.local-data','backups','before-smt-models-'+Date.now()+'.sqlite'));let w=db.load(),p=w.projects.find(p=>p.name==='SMT'&&p.status==='active');if(!p)throw Error('SMT project required.');if(apply(p))w=db.save(w,p.id,w.revision);console.log(JSON.stringify({revision:w.revision,privacy:'no-private-chat-upload',models:w.projects.find(x=>x.id===p.id).entities.filter(e=>e.id.startsWith('smt-')&&M.isComponentPart(e)).map(e=>e.name)}));}finally{db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});}
