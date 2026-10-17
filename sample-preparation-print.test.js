'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const S=require('./sample-preparation');
function view(){
 const context=vm.createContext({SamplePreparation:S,URL,document:{baseURI:'https://example.test/',querySelector:()=>null}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'sample-preparation-view.js'),'utf8'),context);
 return new context.SamplePreparationView(()=>{});
}
function fixture(partId='tem-part-p768-a2'){
 const project={id:'sample',name:'MOBIS + HELLA',projectType:'sample',entities:[{id:partId,name:'Sample <model>',type:'Part'},{id:'person',name:'Private owner',type:'Person',privacy:'local_only'},{id:'risk',name:'Detailed BOM provenance risk',type:'Risk'}],relations:[{type:'potentially_affects',from:'risk',to:partId}]};
 const sheet=S.create(project,{partId,runName:'Trial',sampleDate:'2026-10-15',sampleQuantity:120,memo:'Short <memo>'});
 sheet.version=1;sheet.answers[0]={questionId:'product',status:'verified',note:'Secret evidence already checked.',ownerId:'person',referenceIds:['risk']};
 return {project,sheet};
}
test('paper worksheet has simple checks and blank handwritten Status, never stored answers or risk dumps',()=>{
 const {project,sheet}=fixture(),before=JSON.stringify(sheet),html=view().printHTML({store:project},sheet);
 a.equal((html.match(/class="sample-preparation-status-blank"/g)||[]).length,15);
 a.match(html,/Is machine cleaning planned/);a.match(html,/>Status<\/th>/);a.match(html,/Fill in Status by hand/);
 a.match(html,/2026-10-15/);a.match(html,/120/);a.match(html,/Sample &lt;model&gt;/);a.match(html,/Short &lt;memo&gt;/);
 a.doesNotMatch(html,/Unknown|Verified|Secret evidence|Private owner|Evidence \/ reason|Current risk references|BOM|provenance|reconciled|<select|<textarea|<input/);
 a.equal(JSON.stringify(sheet),before,'Printing must not change saved answers.');
});
test('paper keeps internal PCB source and limited press cleaning context without changing frozen templates',()=>{
 for(const id of ['ls-part-t1-2-uplevel','smt-g65-pcb']){
  const {project,sheet}=fixture(id),html=view().printHTML({store:project},sheet);
  a.match(html,/PCB made in-house/);a.doesNotMatch(html,/Starpro/);
  if(id==='ls-part-t1-2-uplevel')a.match(html,/Press 3 and 4 if used/);
 }
 const {project,sheet}=fixture();sheet.templateVersion='sample-preparation-v1';sheet.answers=sheet.answers.slice(0,14);
 a.equal((view().printHTML({store:project},sheet).match(/class="sample-preparation-status-blank"/g)||[]).length,14);
 a.match(S.QUESTIONS[1].question,/BOM/,'Legacy template definitions stay unchanged.');
});
