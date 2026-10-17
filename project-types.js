(function(root){
  'use strict';
  const TYPES=Object.freeze([
    {id:'program',label:'Program'}, {id:'sample',label:'Sample'}, {id:'npi',label:'NPI'},
    {id:'improvement',label:'Improvement'}, {id:'shared',label:'Shared'}
  ].map(Object.freeze));
  function validate(type){
    if(type!==undefined&&!TYPES.some(item=>item.id===type))throw Error('Invalid project type. Choose program, sample, npi, improvement or shared.');
    return type;
  }
  function kind(project){
    if(project?.projectType!==undefined)return validate(project.projectType);
    const name=String(project?.name||'').trim().toLowerCase();
    if(name==='ls')return 'program';
    if(['mobis + hella','smt','t1-2','t1-2 sample'].includes(name))return 'sample';
    if(['knowledge 360','knowledge360'].includes(name))return 'shared';
    return 'improvement';
  }
  const api={TYPES,kind,validate};
  if(typeof module==='object')module.exports=api;
  else root.ProjectTypes=api;
})(globalThis);
