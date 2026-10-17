'use strict';
const H=require('./history');
function peopleContext(graph){
 const byId=new Map(graph.entities.map(e=>[e.id,e]));
 return graph.entities.filter(e=>e.type==='Person').map(person=>{
  const identity=H.personIdentity(graph,person.id),outgoing=graph.relations.filter(r=>r.from===person.id);
  const links=types=>outgoing.filter(r=>types.includes(r.type)).map(r=>({id:r.to,name:byId.get(r.to)?.name||r.to,relation:r.type,...(r.sourceId?{sourceId:r.sourceId}:{})}));
  return {id:person.id,name:person.name,title:person.title||'',department:person.department||'',workArea:person.workArea||'',...(person.kakaoAuthorId?{kakaoAuthorId:person.kakaoAuthorId}:{}),...(identity.canonicalId?{canonicalId:identity.canonicalId,canonicalName:identity.canonicalName}:{}),affiliations:links(['member_of','works_at']),lineAndWorkLinks:links(['supports_line','works_on','assignment_scope']),reporting:links(['reports_to','reports_via']),identityStatus:person.identityMatch?.status||'not_mapped'};
 });
}
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),base=path.resolve(__dirname,'../.local-data');
 const db=new DatabaseSync(process.env.PM_DB_PATH||path.join(base,'ontology.sqlite'),{readOnly:true});
 const graph={entities:db.prepare('SELECT data_json FROM entities').all().map(r=>JSON.parse(r.data_json)),relations:db.prepare('SELECT data_json FROM relations').all().map(r=>JSON.parse(r.data_json))};
 const people=peopleContext(graph),references=[];
 for(const s of db.prepare("SELECT id,content,metadata_json FROM sources WHERE mime_type<>'application/pdf'").all()){
  const metadata=JSON.parse(s.metadata_json||'{}');if(!['kakao','kakao-group'].includes(metadata.provider))continue;
  const text=Buffer.from(s.content).toString('utf8');try{if(JSON.parse(text)?.cdrToken)continue;}catch{}
  const authorId=metadata.senderId||metadata.authorId,candidates=people.filter(p=>p.name.trim().length>=2&&text.includes(p.name)).map(p=>p.id),accounts=people.filter(p=>p.kakaoAuthorId&&p.kakaoAuthorId===String(authorId)).map(p=>({id:p.id,...(p.canonicalId?{canonicalId:p.canonicalId}:{}),matchBasis:'recorded_author_id'}));
  if(candidates.length||accounts.length)references.push({sourceId:s.id,roomId:metadata.roomId,logId:metadata.externalId,authorId,senderName:metadata.senderName,sentAt:metadata.sentAt,senderAccounts:accounts,nameMatchCandidates:candidates,identityConfirmedByNameMatch:false});
 }
 db.close();const file=path.join(base,'people-context-review.json');fs.writeFileSync(file,JSON.stringify({generatedAt:new Date().toISOString(),people,references,policy:'Name mentions are candidates, not confirmed identity or employment. Use the original sources before adding facts.'},null,2),{mode:0o600});
 console.log(JSON.stringify({peopleReviewed:people.length,confirmedAccountMappings:people.filter(p=>p.canonicalId).length,sourceReferencesForReview:references.length,privateReviewFile:file,databaseModified:false}));
}
module.exports={peopleContext};
