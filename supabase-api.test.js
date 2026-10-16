const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright-core');
const {openStore}=require('./local-store');
const {createCloudHandler}=require('./cloud-handler');
const chrome=process.env.CHROME_PATH||'/usr/bin/chromium';

test('browser: Supabase login, authenticated project saves, reload, export and logout', {skip:!fs.existsSync(chrome)}, async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-supabase-browser-'));
  const store=openStore(path.join(dir,'test.sqlite'));
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    if(!/^[a-z.-]+$/.test(name)){res.writeHead(404);res.end();return;}
    const file=path.join(__dirname,name);
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
  t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));store.close();fs.rmSync(dir,{recursive:true,force:true});});
  const context=await browser.newContext({acceptDownloads:true});
  const cloud=createCloudHandler({allowedOrigins:[base],authenticate:async token=>{if(token!=='test-session')throw Error('Unauthorized');return {id:'d629ba18-2539-4274-b8dd-4dd04466a56c'};},withStore:async(_,fn)=>fn(store)});
  let refreshes=0;
  await context.route('https://ahzpuefosoajwwgbfhng.supabase.co/**',async route=>{
    const req=route.request();
    if(req.url().includes('/auth/v1/')){
      if(req.url().includes('refresh_token'))refreshes++;
      const body=req.url().includes('/logout')?{}:{access_token:'test-session',refresh_token:'refresh',expires_in:3600,user:{email:'owner@example.com'}};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});return;
    }
    const response=await cloud(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}));
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/?cloud=1');
  await page.locator('#cloudSignIn input[name=email]').fill('owner@example.com');
  await page.locator('#cloudSignIn input[name=password]').fill('test-password');
  await page.locator('#cloudSignIn button[type=submit]').click();
  await page.locator('#cloudSignedIn').waitFor({state:'visible'});
  await page.locator('#projectForm').waitFor({state:'visible'});
  await page.locator('#projectName').fill('Supabase project');
  await page.locator('#projectForm button').click();
  await page.waitForFunction(()=>workspace?.projects.some(p=>p.name==='Supabase project'));
  assert.equal(store.load().projects[0].name,'Supabase project');
  await page.reload();
  await page.waitForFunction(()=>workspace?.projects.some(p=>p.name==='Supabase project'));
  // Force expiry and verify refresh is serialized and the refreshed token works.
  await page.evaluate(()=>{const key='pm-session:ahzpuefosoajwwgbfhng.supabase.co';const s=JSON.parse(sessionStorage.getItem(key));s.expires_at=1;sessionStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await page.waitForFunction(()=>workspace?.projects.length===1);assert.equal(refreshes,1);
  const downloadPromise=page.waitForEvent('download');await page.locator('#exportButton').click();
  const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.projects[0].name,'Supabase project');
  await page.locator('#cloudSignOut').click();await page.locator('#cloudSignIn').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('pm-session:ahzpuefosoajwwgbfhng.supabase.co')),null);
  assert.deepEqual(errors,[]);
});
