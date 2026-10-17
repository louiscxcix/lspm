(function(root){
 'use strict';
 const S=root.SamplePreparation;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={unknown:'Unknown',in_progress:'In progress',verified:'Verified',issue:'Issue',not_applicable:'Not applicable'};
 root.SamplePreparationView=class{
  constructor(refresh){this.refresh=refresh;this.scope=null;this.printFrame=null;}
  async update(ctx){
   const old=this.scope;
   if(!ctx?.container||!S.isSample(ctx.store)){this.scope=null;this.printFrame?.remove();this.printFrame=null;if(old)old.ctx.container.replaceChildren();if(ctx?.container)ctx.container.replaceChildren();return;}
   const readOnly=!!(ctx.readOnly||root.PUBLIC_READ_ONLY||ctx.store.status==='archived'||ctx.workspace.access?.enabled&&ctx.workspace.access.mode!=='owner');
   if(old&&old.projectId===ctx.store.id&&old.ctx.container===ctx.container&&old.revision===ctx.workspace.revision&&old.readOnly===readOnly){old.ctx=ctx;return;}
   const preserve=old&&old.projectId===ctx.store.id&&old.ctx.container===ctx.container&&!readOnly&&!old.readOnly&&old.dirty&&!old.saving;
   const draft=preserve&&old.sheet?this.collect(old):null;
   this.scope=null;this.printFrame?.remove();this.printFrame=null;if(old)old.ctx.container.replaceChildren();
   const scope={ctx,projectId:ctx.store.id,revision:ctx.workspace.revision,readOnly,records:[],sheet:draft,dirty:!!draft,modelDrafts:preserve?old.modelDrafts:new Map(),loading:true,saving:false,error:'',message:draft?'Unsaved draft retained after project refresh.':''};this.scope=scope;this.render(scope);
   try{
    const records=await root.LocalAPI.samplePreparationList(ctx.store.id);if(this.scope!==scope)return;
    if(!Array.isArray(records))throw Error('Invalid sample preparation response.');
    scope.records=S.latest(records).filter(s=>ctx.store.entities.some(e=>e.id===s.partId&&e.type==='Part'));
    const selected=old?.ctx.store.id===ctx.store.id?old.sheet?.id:null;
    scope.sheet=draft||structuredClone(scope.records.find(s=>s.id===selected)||scope.records[0]||null);
    if(draft&&scope.records.some(s=>s.id===draft.id&&s.version!==draft.version))scope.error='A newer saved version exists. Your draft is retained; choose the saved run to reload it before saving.';
   }catch(error){if(this.scope!==scope)return;scope.error=error.message;}
   if(this.scope!==scope)return;scope.loading=false;this.render(scope);
  }
  render(scope){
   if(this.scope!==scope)return;
   const {ctx,readOnly,records,sheet,loading,saving}=scope,container=ctx.container;
   const entity=id=>ctx.store.entities.find(e=>e.id===id),name=id=>entity(id)?.name||'Unknown',options=(entities,selected)=>entities.map(e=>'<option value="'+esc(e.id)+'"'+(selected===e.id?' selected':'')+'>'+esc(e.name||e.id)+'</option>').join('');
   const parts=ctx.store.entities.filter(e=>e.type==='Part'&&(e.status!=='archived'||e.id===sheet?.partId)),owners=ctx.store.entities.filter(e=>['Person','Organization'].includes(e.type)),refs=ctx.store.entities,list=S.questions(sheet),worksheet=sheet?S.worksheet(ctx.store,sheet):null;
   container.innerHTML='<section class="sample-preparation" aria-label="Sample Preparation Checksheet"><header class="sample-preparation-heading"><h2>Sample Preparation Checksheet</h2><div class="sample-preparation-actions">'+(sheet?'<button class="button" type="button" data-sample-print'+(saving?' disabled':'')+'>Print / Save PDF</button>':'')+(!readOnly?'<button class="button" type="button" data-sample-new'+(loading||saving?' disabled':'')+'>New sample run</button>':'')+'</div></header><p>Sample planning only. Saving this worksheet does not approve production.</p><p data-sample-message role="status">'+esc(loading?'Loading sample runs…':scope.message)+'</p><p data-sample-error role="alert">'+esc(scope.error)+'</p>'+
    '<p>Prepare before the planned sample date. Print the worksheet and fill in Status by hand.</p>'+
    (scope.error&&!sheet?'<button class="button" type="button" data-sample-retry>Retry loading</button>':'')+
    '<nav class="sample-preparation-runs" aria-label="Sample runs">'+records.map(s=>'<button type="button" class="text-button" data-sample-run="'+esc(s.id)+'" aria-pressed="'+(sheet?.id===s.id)+'"'+(saving?' disabled':'')+'>'+esc(s.runName)+' · '+esc(name(s.partId))+' · version '+esc(s.version)+'</button>').join('')+'</nav>'+
    (!sheet&&!loading?'<p>No sample run selected.'+(readOnly?'':' Create a run to record preparation.')+'</p>':'')+
    (sheet?'<form data-sample-form><fieldset class="sample-preparation-form"'+(loading||saving?' disabled':'')+'><div class="sample-preparation-run-fields">'+
     (readOnly?'<p>Run: '+esc(sheet.runName)+'</p><p>Model: '+esc(name(sheet.partId))+'</p>':'<label>Run name<input data-sample-name maxlength="180" required value="'+esc(sheet.runName)+'"'+(sheet.version||saving?' disabled':'')+'></label><label>Model<select data-sample-part required'+(sheet.version||saving?' disabled':'')+'><option value="">Unknown — choose model</option>'+options(parts,sheet.partId)+'</select></label>')+
     (readOnly?'<p>Prepared on: '+esc(sheet.preparationDate||'Not recorded')+'</p><p>Planned sample date: '+esc(sheet.sampleDate||'Not set')+' (Mexico City)</p><p>Sample quantity: '+esc(sheet.sampleQuantity??'Not recorded')+' pcs</p><p class="sample-preparation-note">Memo: '+esc(sheet.memo||'Not recorded')+'</p>':'<label>Prepared on (Mexico City)<input type="date" data-sample-prepared readonly value="'+esc(sheet.preparationDate||'')+'"></label><label>Planned sample date (Mexico City)<input type="date" data-sample-date value="'+esc(sheet.sampleDate||'')+'"></label><label>Sample quantity (pcs)<input type="number" data-sample-quantity min="1" step="1" max="9007199254740991" placeholder="Unknown" value="'+esc(sheet.sampleQuantity??'')+'"></label><label class="sample-preparation-wide">Short memo<textarea data-sample-memo rows="2" maxlength="1000">'+esc(sheet.memo||'')+'</textarea></label>')+
     '</div><div data-sample-timing aria-live="polite">'+this.timingHTML(worksheet.timing)+'</div>'+this.contextHTML(worksheet.context)+this.tableHTML(worksheet.questions)+
     '<details class="sample-preparation-online" data-sample-online><summary>Online checks / previous records (optional)</summary><p>Template '+esc(sheet.templateVersion)+' · '+(sheet.version?'version '+esc(sheet.version):'unsaved run')+'</p><p>Saved evidence notes and reasons are visible to project viewers. Keep private source text out of notes.</p><p data-sample-summary>'+esc(this.summary(sheet))+'</p><div class="sample-preparation-questions">'+
     list.map((q,i)=>{
      const answer=sheet.answers.find(a=>a.questionId===q.id)||{status:'unknown',note:'',ownerId:null,referenceIds:[]},status=labels[answer.status]||labels.unknown;
      const group=i===0||list[i-1].group!==q.group?'<h3>'+esc(q.group)+'</h3>':'';
      const visibleOwner=entity(answer.ownerId),visibleRefs=(answer.referenceIds||[]).map(entity).filter(e=>e&&e.privacy!=='local_only');
      return group+'<fieldset data-question="'+q.id+'"'+(saving?' disabled':'')+'><legend>'+(i+1)+'. '+esc(q.question)+(q.priority?' · '+q.priority:'')+'</legend><p class="sample-preparation-guidance">'+esc(q.guidance)+'</p>'+
       (readOnly?'<p>Status: '+esc(status)+'</p><p class="sample-preparation-note">'+esc(answer.note||'No evidence note recorded.')+'</p>'+(visibleOwner&&visibleOwner.privacy!=='local_only'?'<p>Owner: '+esc(visibleOwner.name)+'</p>':'')+(visibleRefs.length?'<p>References: '+esc(visibleRefs.map(e=>e.name).join(', '))+'</p>':''):
        '<label>Status<select data-status>'+S.STATUSES.map(s=>'<option value="'+s+'"'+(s===answer.status?' selected':'')+'>'+labels[s]+'</option>').join('')+'</select></label><label>Evidence note / reason<textarea data-note rows="3" maxlength="4000">'+esc(answer.note)+'</textarea></label><div class="sample-preparation-links"><label>Owner<select data-owner><option value="">Unknown / unassigned</option>'+options(owners,answer.ownerId)+'</select></label><label>Project references<select data-references multiple size="3">'+refs.map(e=>'<option value="'+esc(e.id)+'"'+(answer.referenceIds?.includes(e.id)?' selected':'')+'>'+esc(e.name||e.id)+'</option>').join('')+'</select></label></div>')+'</fieldset>';
     }).join('')+'</div><p>Verified requires an evidence note of at least 10 characters; not applicable requires a reason of at least 5 characters.</p></details><details class="sample-preparation-online"><summary>Related risks (optional)</summary>'+this.riskHTML(ctx.store,sheet.partId)+'</details>'+(!readOnly?'<button type="submit" class="button primary" data-sample-save'+(loading||saving?' disabled':'')+'>'+(saving?'Saving…':'Save worksheet')+'</button>':'<p>Read-only project view.</p>')+'</fieldset></form>':'')+'</section>';
   const current=()=>this.scope===scope;
   container.querySelector('[data-sample-print]')?.addEventListener('click',()=>{if(current()&&!saving)this.print(scope);});
   container.querySelector('[data-sample-new]')?.addEventListener('click',()=>{if(!current()||readOnly||saving)return;scope.sheet=S.create(ctx.store);scope.modelDrafts=new Map();scope.dirty=false;scope.error='';scope.message='';this.render(scope);});
   container.querySelector('[data-sample-retry]')?.addEventListener('click',()=>{if(!current())return;this.scope=null;this.update(ctx);});
   for(const button of container.querySelectorAll('[data-sample-run]'))button.addEventListener('click',()=>{if(!current()||loading||saving)return;scope.sheet=structuredClone(records.find(s=>s.id===button.dataset.sampleRun));scope.modelDrafts=new Map();scope.dirty=false;scope.error='';scope.message='';this.render(scope);});
   const form=container.querySelector('[data-sample-form]');
   if(!readOnly&&form){
    form.addEventListener('submit',event=>{event.preventDefault();if(current())this.save(scope);});
    form.addEventListener('input',()=>{if(current()){scope.dirty=true;container.querySelector('[data-sample-timing]').innerHTML=this.timingHTML(S.worksheet(ctx.store,this.collect(scope)).timing);}});
    form.addEventListener('change',event=>{
     if(!current())return;scope.dirty=true;
     if(event.target.matches('[data-sample-part]')&&!sheet.version&&event.target.value!==sheet.partId){
      const value=this.collect(scope),fresh=S.create(ctx.store,{partId:value.partId,runName:value.runName,preparationDate:value.preparationDate,sampleDate:value.sampleDate,sampleQuantity:value.sampleQuantity,memo:value.memo});
      scope.modelDrafts.set(sheet.partId,{...value,partId:sheet.partId});
      const previous=scope.modelDrafts.get(value.partId);
      scope.sheet={...fresh,id:sheet.id,answers:previous?.answers||(!sheet.partId?value.answers:fresh.answers)};
      scope.message=previous?'Previous model draft restored.':!sheet.partId?'Model selected. Existing answers retained for review.':'New model selected. Its answers start unknown; the previous model draft is retained if you switch back.';scope.error='';this.render(scope);return;
     }
     container.querySelector('[data-sample-summary]').textContent=this.summary(this.collect(scope));
     container.querySelector('[data-sample-timing]').innerHTML=this.timingHTML(S.worksheet(ctx.store,this.collect(scope)).timing);
    });
   }
  }
  summary(sheet){const s=S.summary(sheet);return s.verified+' verified · '+s.not_applicable+' not applicable · '+s.in_progress+' in progress · '+s.issue+' issue · '+s.unknown+' unknown';}
  collect(scope){
   const container=scope.ctx.container,partId=container.querySelector('[data-sample-part]').value,quantity=container.querySelector('[data-sample-quantity]').value;
   return {...scope.sheet,runName:container.querySelector('[data-sample-name]').value,partId,...(scope.sheet.templateVersion===S.TEMPLATE_VERSION?{profile:S.newProfileFor(scope.ctx.store,partId)}:{}),...(scope.sheet.preparationDate!==undefined?{preparationDate:container.querySelector('[data-sample-prepared]').value}:{}),sampleDate:container.querySelector('[data-sample-date]').value,sampleQuantity:quantity===''?null:Number(quantity),memo:container.querySelector('[data-sample-memo]').value,
    answers:[...container.querySelectorAll('[data-question]')].map(row=>({questionId:row.dataset.question,status:row.querySelector('[data-status]').value,note:row.querySelector('[data-note]').value,ownerId:row.querySelector('[data-owner]').value||null,referenceIds:[...row.querySelector('[data-references]').selectedOptions].map(o=>o.value)}))};
  }
  timingHTML(t){
   const message=t.state==='not_set'?'Planned sample date not set.':t.state==='past'?'Planned sample date passed '+Math.abs(t.daysUntilSample)+' day(s) ago. Check the plan; this does not mean production happened.':t.state==='today'?'Sample planned for today.':t.daysUntilSample+' day(s) until the planned sample.';
   return '<p class="sample-preparation-timing'+(t.state==='past'||t.preparedAfterSample?' sample-preparation-date-warning':'')+'">Today (Mexico City): <strong>'+esc(t.today)+'</strong> · '+esc(message)+(t.preparedAfterSample?' Preparation date is after the planned sample date. Check both dates.':'')+'</p>';
  }
  contextHTML(context){
   const names=list=>list.length?list.map(e=>esc(e.name)+(e.role?' ('+esc(e.role)+')':'')+(e.unconfirmed?' (unconfirmed reference)':'')).join(', '):'Not confirmed - check before the sample';
   return '<div class="sample-preparation-context"><p><strong>Line references:</strong> '+names(context.lines)+'</p><p><strong>PCB source references:</strong> '+names(context.pcbSources)+'</p>'+(context.pcbOutput?'<p><strong>Incoming material source references:</strong> '+names(context.inputSuppliers)+'</p>':'')+'<small>Current setup references only. Confirm the actual line, source and availability for this run.</small></div>';
  }
  tableHTML(list){return '<table class="sample-preparation-paper"><thead><tr><th scope="col">#</th><th scope="col">Check</th><th scope="col">Status</th></tr></thead><tbody>'+list.map((q,i)=>'<tr><td>'+(i+1)+'</td><th scope="row">'+esc(q.question)+(q.id==='line-clearance'&&/Press 3 and 4/.test(q.guidance)?'<small>Check Press 3 and 4 if used.</small>':'')+'</th><td class="sample-preparation-status-blank" aria-label="Status to fill by hand">&nbsp;</td></tr>').join('')+'</tbody></table>';}
  riskHTML(project,partId,printing=false){
   const review=S.riskReview(project,partId);
   if(!partId)return '<p>Choose a model to see its preparation profile and current risk links.</p>';
   const rows=items=>items.map(({risk,targets,mitigations})=>'<div class="sample-preparation-risk"><strong>'+esc(risk.name)+'</strong><p>Related objects: '+esc(targets.map(e=>e.name||e.id).join(', ')||'No confirmed target')+'</p>'+mitigations.map(action=>'<p>Mitigation reference ('+esc(action.status||'status unknown')+'): '+esc(action.name)+'</p>').join('')+'</div>').join('');
   return '<section class="sample-preparation-risk-review"><h3>Current risk references</h3><p>Current ontology context, not saved run evidence. A risk reference does not assert an incident; a proposed mitigation is not completed work.</p>'+
    (review.linked.length?'<details'+(!printing&&review.linked.length>4?'':' open')+'><summary>Linked model / process / equipment risks · '+review.linked.length+'</summary>'+rows(review.linked)+'</details>':'<p>No explicitly linked risk found for this model. Review the checklist; this does not mean risk-free.</p>')+
    (review.references.length?(printing?'<p>'+review.references.length+' other project risk references require applicability review; not included as model risks.</p>':'<details><summary>Other project risk references · '+review.references.length+' · applicability unconfirmed</summary><p>Do not apply these to the selected model without confirming its actual process and equipment.</p>'+rows(review.references)+'</details>'):'')+'</section>';
  }
  printHTML(ctx,sheet){
   const entity=id=>ctx.store.entities.find(e=>e.id===id),worksheet=S.worksheet(ctx.store,sheet),stylesheet=root.document.querySelector('link[href*="sample-preparation.css"]')?.href||new URL('sample-preparation.css',root.document.baseURI).href,blank='________________';
   return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+esc((entity(sheet.partId)?.name||'Sample')+' - Preparation Checksheet - '+(sheet.sampleDate||'undated'))+'</title><link rel="stylesheet" href="'+esc(stylesheet)+'"></head><body class="sample-preparation-print"><main class="sample-preparation"><header class="sample-preparation-heading"><h2>Sample Preparation Checksheet</h2></header><div class="sample-preparation-run-fields"><p>Project: '+esc(ctx.store.name||ctx.store.id)+'</p><p>Model: '+esc(entity(sheet.partId)?.name||blank)+'</p><p>Prepared on: '+esc(sheet.preparationDate||blank)+'</p><p>Planned sample date: '+esc(sheet.sampleDate||blank)+'</p><p>Sample quantity: '+esc(sheet.sampleQuantity??blank)+' pcs</p><p>Run: '+esc(sheet.runName||blank)+'</p></div><p class="sample-preparation-note">Memo: '+esc(sheet.memo||'____________________________________________________________')+'</p>'+this.timingHTML(worksheet.timing)+this.contextHTML(worksheet.context)+'<p>Fill in Status by hand: OK / Not OK / N/A. This blank worksheet does not approve production.</p>'+this.tableHTML(worksheet.questions)+'</main></body></html>';
  }
  print(scope){
   try{
    const sheet=scope.readOnly?scope.sheet:this.collect(scope);
    // Print metadata with blank handwritten statuses, never save or copy stored answers.
    const frame=root.document.createElement('iframe');this.printFrame?.remove();this.printFrame=frame;frame.className='sample-preparation-print-frame';frame.title='Sample preparation PDF preview';
    frame.addEventListener('load',async()=>{
     if(this.scope!==scope||this.printFrame!==frame)return;
     await frame.contentDocument.fonts.ready;
     if(this.scope!==scope||this.printFrame!==frame)return;
     frame.contentWindow.addEventListener('afterprint',()=>{frame.remove();if(this.printFrame===frame)this.printFrame=null;},{once:true});
     frame.contentWindow.focus();frame.contentWindow.print();
    },{once:true});
    frame.srcdoc=this.printHTML(scope.ctx,sheet);root.document.body.appendChild(frame);
   }catch(error){scope.ctx.container.querySelector('[data-sample-error]').textContent='Could not prepare PDF: '+error.message;}
  }
  async save(scope){
   if(this.scope!==scope||scope.readOnly||scope.loading||scope.saving)return;
   let value;try{value=S.validate(scope.ctx.store,this.collect(scope));}catch(error){scope.ctx.container.querySelector('[data-sample-error]').textContent=error.message;return;}
   scope.sheet=value;scope.saving=true;scope.error='';scope.message='';this.render(scope);
   let result;
   try{result=await root.LocalAPI.samplePreparationSave({projectId:scope.projectId,revision:scope.revision,sheet:value});}
   catch(error){if(this.scope!==scope)return;scope.saving=false;scope.error=error.message;this.render(scope);return;}
   if(this.scope!==scope)return;
   scope.sheet=result.sheet;scope.records=S.latest([...scope.records,result.sheet]);scope.ctx={...scope.ctx,workspace:result.workspace};scope.revision=result.workspace.revision;scope.saving=false;scope.dirty=false;scope.message='Preparation saved.';this.render(scope);
   try{await this.refresh(result);}catch(error){if(this.scope===scope){scope.error='Saved; refresh failed: '+error.message;this.render(scope);}}
  }
 };
})(globalThis);
