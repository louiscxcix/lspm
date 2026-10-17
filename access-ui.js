(function(root){
  const api=async(action,input)=>{if(root.PublicMenuAccess)return root.PublicMenuAccess(action,input);const response=await fetch('/api/access/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input||{})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
  const changed=()=>{localStorage.setItem('pm-access-changed',String(Date.now()));location.reload();};
  root.OwnerAccess={
    init(access,views){
      if(!access?.enabled)return;
      document.querySelector('#ownerAccessButton')?.remove();document.querySelector('#basicMapTabs')?.remove();
      document.body.dataset.access=access.mode;
      const actions=document.querySelector('.header-actions'),button=document.createElement('button');button.id='ownerAccessButton';button.className='button';button.textContent=access.mode==='owner'?'내 전용 · 접속 관리':'🔒 내 전용';actions.prepend(button);
      const nav=document.createElement('nav');nav.id='basicMapTabs';nav.className='tabs';nav.setAttribute('aria-label','LS maps');nav.innerHTML=access.mode==='basic'?'<button data-basic-map="production" aria-current="page">Production Map</button>':'<button data-basic-map="whole" aria-current="page">LS 전체 Process Map</button><button data-basic-map="production">Production Map</button>';document.querySelector('#projectBar').after(nav);
      nav.onclick=e=>{const target=e.target.closest('[data-basic-map]');if(!target)return;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b===target?'page':'false'));target.dataset.basicMap==='production'?views.production():views.whole();};
      button.onclick=()=>{
        const d=document.createElement('dialog');d.className='access-dialog';
        const login='<p>'+(root.PUBLIC_READ_ONLY?'비밀번호를 입력하면 공개판 전체 메뉴가 열립니다.':'비밀번호 한 번 입력하면 모든 메뉴·수정·History·AI가 열립니다.')+'</p><label>비밀번호<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button class="button primary" type="submit">내 전용으로 열기</button>';
        const owner=root.PUBLIC_READ_ONLY?'<p>공개판 전체 메뉴가 열려 있습니다. 접속은 최대 30일 유지됩니다.</p><button class="button" type="button" data-logout>기본 모드로 돌아가기</button>':'<p>전체 기능이 열려 있습니다. 인증은 최대 30일 유지됩니다.</p><details><summary>비밀번호 변경</summary><label>현재 비밀번호<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"></label><label>새 비밀번호 · 4자 이상<input name="password" type="password" autocomplete="new-password" required minlength="4" maxlength="256"></label><label>새 비밀번호 확인<input name="confirm" type="password" autocomplete="new-password" required minlength="4" maxlength="256"></label><button class="button primary" type="submit">비밀번호 변경</button></details><button class="button" type="button" data-logout>기본 모드로 돌아가기 · 로그아웃</button>';
        d.innerHTML='<form><div class="access-heading"><h2>'+(access.mode==='owner'?'내 전용 접속':'내 전용 로그인')+'</h2><button type="button" data-close class="text-button" aria-label="닫기">✕</button></div>'+(access.mode==='owner'?owner:login)+'<p class="form-error" role="alert"></p></form>';
        if(root.CLOUD_OWNER_LOGIN){
          d.innerHTML='<form><div class="access-heading"><h2>내 전용 '+(access.mode==='owner'?'접속':'로그인')+'</h2><button type="button" data-close class="text-button" aria-label="닫기">✕</button></div>'+(access.mode==='owner'?'<p>내 전용으로 접속 중입니다. History와 저장 데이터는 비공개로 유지됩니다.</p><button class="button" type="button" data-logout>기본 모드로 돌아가기 · 로그아웃</button>':'<label>비밀번호<input name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="256"></label><button class="button primary" type="submit">내 전용으로 열기</button>')+'<details><summary>비밀번호를 잊으셨나요?</summary><button class="text-button" type="button" data-reset-password>비밀번호 재설정 메일 받기</button></details><p role="status" aria-live="polite"></p><p class="form-error" role="alert"></p></form>';
        }
        document.body.append(d);d.querySelector('[data-close]').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();d.querySelector('input')?.focus();
        const error=e=>d.querySelector('[role=alert]').textContent=e.message;
        d.querySelector('[data-reset-password]')?.addEventListener('click',async e=>{const reset=e.currentTarget;reset.disabled=true;try{const result=await api('reset');d.querySelector('[role=status]').textContent=result.message;}catch(e){error(e);}finally{reset.disabled=false;}});
        d.querySelector('[data-logout]')?.addEventListener('click',async()=>{try{await api('logout');changed();}catch(e){error(e);}});
        d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target),submit=d.querySelector('[type=submit]');submit.disabled=true;try{const password=form.get('password');if(access.mode==='owner'&&password!==form.get('confirm'))throw Error('새 비밀번호 확인이 맞지 않습니다.');await api(access.mode==='owner'?'password':'login',{password,currentPassword:form.get('currentPassword')});changed();}catch(e){error(e);submit.disabled=false;}};
      };
      window.addEventListener('storage',e=>{if(e.key==='pm-access-changed')location.reload();});
      window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
      window.addEventListener('pm-access-expired',()=>location.reload());
    }
  };
})(window);
