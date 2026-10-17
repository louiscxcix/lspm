const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('public owner button opens one valid password dialog with close control',()=>{
  let dialog,opened=false;const element=()=>({setAttribute(){},prepend(){},after(){},remove(){},close(){},showModal(){opened=true;},focus(){},addEventListener(){},querySelector(selector){if(selector==='[data-close]')return this.innerHTML?.includes('data-close')?element():null;return element();}});
  const document={body:{dataset:{},append(d){dialog=d;}},querySelector(){return element();},createElement(tag){const e=element();if(tag==='button')document.button=e;return e;}};
  const window={PUBLIC_READ_ONLY:true,addEventListener(){}};vm.runInNewContext(fs.readFileSync(require.resolve('./access-ui.js'),'utf8'),{window,document});
  window.OwnerAccess.init({enabled:true,mode:'basic'},{whole(){},production(){}});
  assert.doesNotThrow(()=>document.button.onclick());assert(opened);assert.equal((dialog.innerHTML.match(/name="password"/g)||[]).length,1);assert(dialog.innerHTML.includes('</form>'));
});
test('cloud owner dialog uses password and user-triggered setup, not Google popup',()=>{
 let dialog;const element=()=>({setAttribute(){},prepend(){},after(){},remove(){},close(){},showModal(){},focus(){},addEventListener(){},querySelector(){return element();}});
 const document={body:{dataset:{},append(d){dialog=d;}},querySelector:element,createElement(tag){const e=element();if(tag==='button')document.button=e;return e;}};
 const window={CLOUD_OWNER_LOGIN:true,addEventListener(){}};vm.runInNewContext(fs.readFileSync(require.resolve('./access-ui.js'),'utf8'),{window,document});
 window.OwnerAccess.init({enabled:true,mode:'basic'},{whole(){},production(){}});document.button.onclick();
 assert.equal((dialog.innerHTML.match(/name="password"/g)||[]).length,1);assert(dialog.innerHTML.includes('minlength="6"'));assert(dialog.innerHTML.includes('data-reset-password'));assert(!dialog.innerHTML.includes('Google로 로그인'));
});
