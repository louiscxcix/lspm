'use strict';
const {test}=require('node:test'),a=require('node:assert/strict');
const H=require('./history'),C=require('./cloud-domain'),M=require('./ontology-model'),{openStore}=require('./local-store');

function graph(){
  const g={id:'library',name:'Global Library',status:'active',version:2,entities:[],relations:[]};
  const add=(id,data)=>Object.assign(M.addEntity(g,data),data,{id});
  add('account',{type:'Person',name:'Kakao display name',privacy:'local_only',kakaoAuthorId:'3944923640947795969',identityMatch:{
    status:'confirmed',personId:'person',authorId:'3944923640947795969',evidenceSourceIds:['private-source-1'],reason:'Audited sender identification.'
  }});
  add('person',{type:'Person',name:'Canonical person'});
  add('candidate',{type:'Person',name:'Canonical person',privacy:'local_only',kakaoAuthorId:'candidate-author',identityMatch:{
    status:'candidate',personId:'person',authorId:'candidate-author',evidenceSourceIds:['private-source-2'],reason:'Unconfirmed name similarity.'
  }});
  add('org',{type:'Organization',name:'Organization'});
  add('step',{type:'Production Step',name:'Router'});
  for(const [id,author] of [['report','account'],['unconfirmed-report','candidate']]){
    add(id,{type:'Event',name:id,privacy:'local_only',sourceMessageId:id,context:'Original report by '+author,eventRecord:H.validateEvent({
      schemaVersion:1,recordClass:'business',kind:'disruption',statementMode:'reported_fact',verification:'reported',
      lifecycle:'active',importance:'normal',timePrecision:'exact',reportedAt:'2026-10-06T10:32:00-06:00',
      recordedAt:'2026-10-06T11:00:00-06:00',scope:{kind:'unassigned',projectIds:[]},reporterLabel:'Original '+author
    })});
    M.addRelation(g,{from:id,to:author,type:'reported_by'});
    M.addRelation(g,{from:id,to:'step',type:'records_on'});
  }
  for(const [type,to] of [['performed_by','account'],['requested_from','account'],['requested_from','org']])M.addRelation(g,{from:'report',to,type});
  return g;
}
const original={id:'account',name:'Kakao display name'};

test('confirmed private Kakao identity decorates without changing original ID or name',()=>{
  const g=graph(),before=JSON.stringify(g);
  a.deepEqual(H.personIdentity(g,'account'),{...original,canonicalId:'person',canonicalName:'Canonical person'});
  a.equal(JSON.stringify(g),before);
});

test('self-mapping is valid and identity resolution never follows a chain',()=>{
  const g=graph(),account=g.entities.find(e=>e.id==='account'),person=g.entities.find(e=>e.id==='person');
  account.identityMatch.personId='account';
  a.deepEqual(H.personIdentity(g,'account'),{...original,canonicalId:'account',canonicalName:original.name});
  account.identityMatch.personId='person';
  Object.assign(person,{privacy:'local_only',kakaoAuthorId:'another-author',identityMatch:{...account.identityMatch,authorId:'another-author',personId:'candidate'}});
  a.equal(H.personIdentity(g,'account').canonicalId,'person');
});

test('candidate identity and matching display names never infer a person',()=>{
  const g=graph();
  a.deepEqual(H.personIdentity(g,'candidate'),{id:'candidate',name:'Canonical person'});
  a.deepEqual(H.personIdentity(g,'person'),{id:'person',name:'Canonical person'});
  a.deepEqual(H.personIdentity(g,'missing'),{id:'missing',name:'missing'});
  a.deepEqual(H.personIdentity(g,'org'),{id:'org',name:'Organization'});
});

test('identity resolution rejects incomplete or invalid confirmation',()=>{
  const cases={
    'missing metadata':account=>delete account.identityMatch,
    'unconfirmed metadata':account=>account.identityMatch.status='candidate',
    'nonprivate source':account=>delete account.privacy,
    'public source':account=>account.privacy='public',
    'non-Person source':account=>account.type='Organization',
    'missing account author':account=>delete account.kakaoAuthorId,
    'missing metadata author':account=>delete account.identityMatch.authorId,
    'empty author IDs':account=>account.kakaoAuthorId=account.identityMatch.authorId='',
    'whitespace author IDs':account=>account.kakaoAuthorId=account.identityMatch.authorId=' ',
    'different author':account=>account.identityMatch.authorId='other-author',
    'numeric author is not string author':account=>account.identityMatch.authorId=3944923640947795969,
    'missing target ID':account=>delete account.identityMatch.personId,
    'missing target':account=>account.identityMatch.personId='missing',
    'non-Person target':account=>account.identityMatch.personId='org',
    'inactive target':(_account,g)=>g.entities.find(e=>e.id==='person').status='archived',
    'missing target status':(_account,g)=>delete g.entities.find(e=>e.id==='person').status,
    'missing evidence':account=>delete account.identityMatch.evidenceSourceIds,
    'empty evidence':account=>account.identityMatch.evidenceSourceIds=[],
    'non-array evidence':account=>account.identityMatch.evidenceSourceIds='private-source-1',
    'invalid evidence ID':account=>account.identityMatch.evidenceSourceIds=[null],
    'empty evidence ID':account=>account.identityMatch.evidenceSourceIds=[' ']
  };
  for(const [label,mutate] of Object.entries(cases)){
    const g=graph();mutate(g.entities.find(e=>e.id==='account'),g);
    a.deepEqual(H.personIdentity(g,'account'),original,label);
  }
});

test('local/cloud participants and canonical/original filters agree while original Event author stays intact',()=>{
  const store=openStore(':memory:');
  try{
    let w=store.load();w.library=graph();store.save(w,'library',w.revision);w=store.load();
    const before=JSON.stringify(w),revision=w.revision;
    for(const personId of ['', 'person','account','candidate','org','missing']){
      const query={scope:'library',personId},local=store.history.list(query),cloud=C.query(w,query);
      a.deepEqual(local,cloud,personId||'unfiltered');
      a.deepEqual(local.items.map(e=>e.id),personId==='candidate'?['unconfirmed-report']:personId==='missing'?[]:personId?['report']:['report','unconfirmed-report']);
    }
    const report=store.history.list({personId:'person'}).items[0];
    for(const role of ['reported_by','performed_by','requested_from'])a.deepEqual(report.participants.find(p=>p.id==='account'&&p.role===role),{
      ...original,canonicalId:'person',canonicalName:'Canonical person',role
    });
    a.deepEqual(report.participants.find(p=>p.id==='org'),{id:'org',name:'Organization',role:'requested_from'});
    const detail=store.history.detail('report');
    a.equal(detail.event.eventRecord.reporterLabel,'Original account');
    a.equal(detail.event.context,'Original report by account');
    a.equal(detail.links.find(r=>r.type==='reported_by').to,'account');
    a.equal(detail.links.find(r=>r.type==='reported_by').toName,original.name);
    a.equal(C.detail(w,'report').links.find(r=>r.type==='reported_by').to,'account');
    a.equal(JSON.stringify(w),before);a.deepEqual(store.load(),w);a.equal(store.load().revision,revision);
  }finally{store.close();}
});
