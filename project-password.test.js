const {test}=require('node:test'),a=require('node:assert/strict');
test('four digit project password supports Firebase while retaining existing long passwords',()=>{
 const credential=require('./project-password');
 a(credential('project-a','0000').length>=6);
 a.notEqual(credential('project-a','0000'),credential('project-b','0000'));
 a.equal(credential('project-a','test-password'),'test-password');
 for(const value of ['123','',null,'x'.repeat(257)])a.throws(()=>credential('project-a',value),/4/);
});
