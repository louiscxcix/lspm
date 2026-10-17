const{test}=require('node:test'),a=require('node:assert/strict');
test('project reader publication strips private history and unrelated projects',()=>{
 const V=require('./project-view'),p={id:'project-a',name:'A',status:'active',entities:[{id:'part',type:'Part',name:'PCB'},{id:'private',type:'Person',name:'Private',privacy:'local_only'},{id:'event',type:'Event',name:'Chat'}],relations:[{id:'r',from:'part',to:'private'}],changes:[{secret:true}]};
 const v=V.publish(p,{hourly:[{partId:'part',actual:1,sourceId:'secret'},{partId:'private',actual:2}],progress:{snapshots:[],rows:[]}},{});a.equal(v.project.entities.length,1);a.equal(v.project.relations.length,0);a.equal(v.project.changes.length,0);a.equal(v.production.hourly.length,1);a.equal(v.production.hourly[0].sourceId,undefined);a.equal(V.workspace(v).access.mode,'project');a.equal(V.workspace(v).projects.length,1);
});
test('large project views round-trip compressed without dropping graph or production records',async()=>{
 const V=require('./project-view'),view={schemaVersion:1,project:{id:'large',name:'LS',entities:Array.from({length:6000},(_,i)=>({id:'p'+i,name:'G65 부품 '+i,context:'Confirmed context '.repeat(20)})),relations:[]},production:{hourly:[{partId:'p0',target:500,actual:400,reason:'자재 부족'}]},settings:{features:{wip:true}}};
 a(Buffer.byteLength(JSON.stringify(view))>900000);const encoded=await V.encode(view);a(Buffer.byteLength(encoded)<=900000);a.equal(JSON.parse(encoded).encoding,'gzip-base64');a.deepEqual(await V.decode(encoded),view);
});
test('legacy payload stays compatible; malformed and oversized encoded views fail closed',async()=>{
 const V=require('./project-view'),view={schemaVersion:1,project:{id:'old'},production:{},settings:{}};a.equal(await V.encode(view),JSON.stringify(view));a.deepEqual(await V.decode(JSON.stringify(view)),view);
 await a.rejects(V.decode(JSON.stringify({encoding:'gzip-base64',data:'invalid!'})));await a.rejects(V.decode(JSON.stringify({encoding:'unknown',data:'a'})),/encoding/i);
 const bomb=require('node:zlib').gzipSync(Buffer.alloc(16*1024*1024+1,97)).toString('base64');await a.rejects(V.decode(JSON.stringify({encoding:'gzip-base64',schemaVersion:1,data:bomb})),/expanded size/i);
});
