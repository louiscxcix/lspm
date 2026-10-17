const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pm-history-bench-')),file=path.join(folder,'test.sqlite'),store=require('./local-store').openStore(file),writer=new DatabaseSync(file);
try{
  const record={schemaVersion:1,recordClass:'business',kind:'observation',statementMode:'reported_fact',verification:'reported',lifecycle:'active',importance:'normal',timePrecision:'unknown',timezone:'America/Mexico_City',reportedAt:'2026-10-06T12:00:00-06:00',recordedAt:'2026-10-06T13:00:00-06:00',scope:{kind:'unassigned',projectIds:[]},facets:[]};
  const insert=writer.prepare('INSERT INTO entities VALUES(?,?,?)'),rel=writer.prepare('INSERT INTO relations VALUES(?,?,?,?,?,?)');let previous=0;
  insert.run('target','Resource',JSON.stringify({id:'target',type:'Resource',name:'Fixture machine',status:'active'}));
  for(const count of [10000,100000]){
    writer.exec('BEGIN');for(let i=previous;i<count;i++){const id='event-'+i;insert.run(id,'Event',JSON.stringify({id,type:'Event',name:'Observation '+i,context:'Fixture only',eventRecord:record,privacy:'local_only'}));rel.run('link-'+i,'records_on',id,'target',null,JSON.stringify({id:'link-'+i,type:'records_on',from:id,to:'target'}));}writer.exec('COMMIT');previous=count;
    const start=performance.now(),result=store.history.list({scope:'library',limit:50}),elapsed=Math.round(performance.now()-start);assert.equal(result.items.length,50);assert.equal(result.totalDistinct,count);assert.equal(result.counts.target.length,count);console.log(count+' Events: full-period counts + first page '+elapsed+' ms');
  }
}finally{writer.close();store.close();fs.rmSync(folder,{recursive:true,force:true});}
