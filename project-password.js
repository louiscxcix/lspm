(function(root){
 function credential(projectId,password){
  if(typeof password!=='string'||password.length<4||password.length>256)throw Error('프로젝트 비밀번호는 4~256자로 입력하세요.');
  // Short PIN compatibility only; this does not increase password strength.
  return password.length<6?'pm-view-v1:'+projectId+':'+password:password;
 }
 if(typeof module==='object')module.exports=credential;else root.ProjectPassword=credential;
})(globalThis);
