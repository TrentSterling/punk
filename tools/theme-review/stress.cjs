'use strict';
/* Read-only Punk pointer/lifecycle reliability sampler. CI Chrome only.
 * No retry, forced click, runtime repair, or browser/security flag change.
 * A complete sample is exactly 12 immediate + 12 rendered-modal contexts.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {argumentsFor, sourceCheck, sha, gitText} = require('./source.cjs');
const {startServer} = require('./server.cjs');
const PLAN = Object.freeze(Array.from({length:12},(_,index)=>['immediate','rendered'].map(mode=>Object.freeze({id:`${mode}-${String(index+1).padStart(2,'0')}`,mode,iteration:index+1}))).flat());
const HARD_LIMIT_MS = 175000;
const WORK_LIMIT_MS = 165000;
const ACTION_TIMEOUT_MS = 3000;
const CASE_LIMIT_MS = 14000;
function aggregate(cases,errors=[]) {
  const groups=Object.fromEntries(['immediate','rendered'].map(mode=>{
    const rows=cases.filter(row=>row.mode===mode);
    return [mode,{planned:12,started:rows.length,completed:rows.filter(row=>row.finishedAt).length,passed:rows.filter(row=>row.pass===true).length,failed:rows.filter(row=>row.pass===false).length,firstResetPassed:rows.filter(row=>row.firstResetPassed===true).length}];
  }));
  return {groups,pass:errors.length===0&&cases.length===24&&Object.values(groups).every(g=>g.completed===12&&g.passed===12)};
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms,label) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} exceeded ${ms} ms; no retry`)),ms);})]);}
  finally {clearTimeout(timer);}
}
// Identical read-only instrumentation from browser.cjs.
function resetHitTestInPage(){
  const dialog=document.querySelector('#tront-theme-editor'),reset=dialog?.querySelector('[data-action="reset"]');
  const describe=el=>el?{tag:el.tagName,id:el.id,class:typeof el.className==='string'?el.className:'',action:el.getAttribute('data-action')}:null;
  const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const style=el=>{const cs=getComputedStyle(el);return {pointerEvents:cs.pointerEvents,zIndex:cs.zIndex,position:cs.position,transform:cs.transform,opacity:cs.opacity,visibility:cs.visibility,display:cs.display};};
  const r=rect(reset),point=r?{x:r.x+r.width/2,y:r.y+r.height/2}:null;
  return {time:performance.now(),scroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight},active:describe(document.activeElement),
    dialog:{rect:rect(dialog),style:style(dialog),open:dialog.open,modal:dialog.matches(':modal'),scrollTop:dialog.scrollTop},
    reset:{rect:r,style:style(reset),point,hit:describe(document.elementFromPoint(point.x,point.y)),stack:document.elementsFromPoint(point.x,point.y).map(describe)},
    iframes:[...document.querySelectorAll('iframe')].map(el=>({...describe(el),src:el.getAttribute('src'),rect:rect(el),style:style(el),explicitInert:el.inert})),
    modalElements:[...document.querySelectorAll(':modal')].map(describe)};
}
function interactionStateInPage(){
  const dialog=document.querySelector('#tront-theme-editor'),opener=document.querySelector('#tront-theme-btn'),active=document.activeElement;
  return {dialogOpen:dialog?.open,expanded:opener?.getAttribute('aria-expanded'),project:document.documentElement.getAttribute('data-te-project'),active:active?{tag:active.tagName,href:active.getAttribute('href'),id:active.id,name:active.getAttribute('name'),action:active.getAttribute('data-action')}:null,preset:dialog?.querySelector('[name="preset"]')?.value,stored:window.TrontThemeEditor?localStorage.getItem(TrontThemeEditor.key):null,closeEvents:window.__qaCloseEvents||0,trace:window.__qaInteractionTrace||[]};
}
function instrumentInteractionsInPage(){
  const dialog=document.querySelector('#tront-theme-editor');if(!dialog||window.__qaInteractionTrace)return;
  window.__qaInteractionTrace=[];window.__qaCloseEvents=0;
  dialog.addEventListener('close',()=>{window.__qaCloseEvents++;});
  function entry(event,phase){
    const target=event.target,active=document.activeElement;
    const record={event:event.type,phase,time:performance.now(),clientX:event.clientX,clientY:event.clientY,button:event.button,modal:dialog.matches(':modal'),path:event.composedPath?.().slice(0,5).map(el=>({tag:el.tagName,id:el.id,action:el.getAttribute?.('data-action')})),target:target?.tagName,id:target?.id,action:target?.closest?.('[data-action]')?.getAttribute('data-action')||null,name:target?.getAttribute?.('name')||null,dialogOpen:dialog.open,expanded:document.querySelector('#tront-theme-btn')?.getAttribute('aria-expanded'),project:document.documentElement.getAttribute('data-te-project'),active:{tag:active?.tagName,id:active?.id,name:active?.getAttribute?.('name')||null,action:active?.getAttribute?.('data-action')||null},preset:dialog.querySelector('[name="preset"]')?.value};
    window.__qaInteractionTrace.push(record);if(window.__qaInteractionTrace.length>600)window.__qaInteractionTrace.shift();
  }
  window.addEventListener('message',event=>{if(event.data?.__themeQA==='iframe-pointer'){window.__qaInteractionTrace.push({event:'iframe-'+event.data.type,phase:'iframe',time:performance.now(),iframeOrigin:event.origin,clientX:event.data.clientX,clientY:event.data.clientY,modal:dialog.matches(':modal'),dialogOpen:dialog.open});}});
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','input','change','close','cancel','focusin'])document.addEventListener(type,event=>{if(['pointerdown','pointerup','mousedown','mouseup','click'].includes(event.type)||event.target===dialog||event.target?.closest?.('#tront-theme-editor,#tront-theme-btn')){entry(event,'capture');queueMicrotask(()=>entry(event,'settled'));}},true);
}
async function main() {
  const options=argumentsFor();
  assert.equal(options.project,'punk','This focused cross-origin iframe sampler is Punk-only');
  const output=path.join(options.output,'stress');fs.mkdirSync(output,{recursive:true});
  const started=Date.now();
  const report={project:'punk',startedAt:new Date(started).toISOString(),plan:PLAN,hardLimitMs:HARD_LIMIT_MS,workLimitMs:WORK_LIMIT_MS,cases:[],errors:[],warnings:[],network:[],limitations:[
    'The YouTube URL retains its cross-origin frame but its provider document is a controlled inert placeholder. Actual YouTube playback, provider controls and availability remain unverified.',
    'This is a bounded reliability sample, not proof that a low-frequency race cannot occur. Immediate and rendered results remain separate; a rendered pass never erases an immediate failure.',
    'Every action uses exactly one normal Playwright activation. Locator actionability waiting is retained; there are no failed-click retries or forced/programmatic reset activations.',
    'Two actual parent/child animation frames plus a rendered PNG are used only for the rendered-modal cohort and for closed-frame restoration checks.'
  ]};
  const save=()=>{report.elapsedMs=Date.now()-started;report.summary=aggregate(report.cases,report.errors);fs.writeFileSync(path.join(output,'stress.json'),JSON.stringify(report,null,2)+'\n');};
  let server,browser,hardTimer;
  const externalCache=new Map();
  try {
    if(!process.env.CI)throw Error('Browser stress QA is CI-only. Local Chrome is known to fail EPERM; no launch or retry was attempted.');
    const executablePath=process.env.THEME_BROWSER_EXECUTABLE;
    if(!executablePath)throw Error('THEME_BROWSER_EXECUTABLE must point to existing CI Google Chrome');
    hardTimer=setTimeout(()=>{report.errors.push({type:'hard-runtime-limit',message:'175-second ceiling reached; unfinished coverage is a failure'});report.finishedAt=new Date().toISOString();save();console.error('Stress sampler hard deadline reached; see '+path.join(output,'stress.json'));process.exit(1);},HARD_LIMIT_MS);
    const source=sourceCheck(options);report.source=source.report;assert.equal(source.report.pass,true,'Source/media guard must pass before stress sampling');
    report.head=gitText(options.root,['rev-parse','HEAD']).trim();
    report.sourceHashes=Object.fromEntries(['index.htm','assets/js/tront-theme-editor.js','assets/css/project-theme.css'].filter(file=>fs.existsSync(path.join(options.root,file))).map(file=>[file,sha(fs.readFileSync(path.join(options.root,file)))]));
    server=await startServer({root:options.root,onRequest:entry=>report.network.push(entry)});
    // Same executable and launch options as the existing approved browser runner.
    const {chromium}=require('playwright');
    browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    report.browserVersion=browser.version();
    async function contextFor() {
      const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});
      context.setDefaultTimeout(ACTION_TIMEOUT_MS);context.setDefaultNavigationTimeout(10000);
      await context.addInitScript(()=>{if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem('tront-theme','sentinel-legacy');localStorage.setItem('tront-theme-gallery-v1','sentinel-gallery');localStorage.setItem('tront-previews-paused','sentinel-paused');sessionStorage.setItem('qa-seeded','1');}});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===server.origin){await route.continue();return;}
        if(/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)&&url.pathname.startsWith('/embed/')){
          await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#111;color:#bbb;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>QA: YouTube playback unverified (provider frame mocked)</p><script>window.__qaInnerClicks=0;window.__qaInnerPointerEvents=[];for(const type of ["pointerdown","pointerup","click"])document.addEventListener(type,e=>{if(e.type==="click")window.__qaInnerClicks++;window.__qaInnerPointerEvents.push({type:e.type,x:e.clientX,y:e.clientY,time:performance.now()});parent.postMessage({__themeQA:"iframe-pointer",type:e.type,clientX:e.clientX,clientY:e.clientY},"*");},true);</script></body></html>'});return;
        }
        const allowed=((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font')||(['tront.xyz','blog.tront.xyz','hackerpunk.s3.amazonaws.com'].includes(url.hostname)&&request.resourceType()==='image')||(url.hostname==='tront.xyz'&&url.pathname==='/favicon.png'&&request.resourceType()==='other'));
        if(!allowed){report.warnings.push({type:'blocked-external-request',url:request.url(),resourceType:request.resourceType()});await route.abort('blockedbyclient');return;}
        if(!externalCache.has(request.url()))externalCache.set(request.url(),(async()=>{try{const response=await route.fetch({timeout:8000});if(!response.ok())throw Error('HTTP '+response.status());return {status:response.status(),headers:response.headers(),body:await response.body()};}catch(error){report.warnings.push({type:'external-asset-unavailable',url:request.url(),message:error.message});return null;}})());
        const cached=await externalCache.get(request.url());if(cached)await route.fulfill(cached);else await route.abort('failed');
      });
      return context;
    }
    const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem(TrontThemeEditor.key)));
    async function open(page,row) {
      assert.equal(await page.locator('#tront-theme-editor').evaluate(el=>el.open),false,'Open must start from a closed dialog');
      row.actions.push({action:'open',attempt:1});await page.locator('#tront-theme-btn').click();
      await page.waitForFunction(()=>document.querySelector('#tront-theme-editor').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='true');
      assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true,'Reopen puts focus on Close');
    }
    async function waitClosed(page,count) {
      await page.waitForFunction(count=>!document.querySelector('#tront-theme-editor').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='false'&&document.activeElement===document.querySelector('#tront-theme-btn')&&(window.__qaCloseEvents||0)>count,count);
    }
    async function close(page,row,escape=false) {
      const count=await page.evaluate(()=>window.__qaCloseEvents||0);
      row.actions.push({action:escape?'Escape':'Close',attempt:1});
      if(escape)await page.keyboard.press('Escape');else await page.locator('[data-action="close"]').click();
      await waitClosed(page,count);
      assert.equal(await page.locator('iframe').evaluate(el=>getComputedStyle(el).pointerEvents),'auto','Closed editor restores iframe pointer input');
    }
    async function frames(page) {
      const ticks=await Promise.all([
        page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b]))))),
        page.frameLocator('iframe').locator('body').evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b])))))
      ]);
      return {parent:ticks[0],child:ticks[1]};
    }
    async function childState(page) {
      return page.frameLocator('iframe').locator('p').evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},readyState:document.readyState,visibility:document.visibilityState,pointerEvents:getComputedStyle(el).pointerEvents,hit:hit?{tag:hit.tagName,id:hit.id}:null,clicks:window.__qaInnerClicks||0,events:window.__qaInnerPointerEvents||[]};});
    }
    async function restoreFrame(page,row,label) {
      row.phase=label;const result={label,clickAttempts:0};row.frames.push(result);
      const target=page.frameLocator('iframe').locator('p');
      result.before={geometry:await page.evaluate(resetHitTestInPage),child:await childState(page)};
      await target.scrollIntoViewIfNeeded();result.ticks=await frames(page);
      result.screenshot=`${row.id}-${label}-rendered.png`;await target.screenshot({path:path.join(output,result.screenshot)});
      result.ready={geometry:await page.evaluate(resetHitTestInPage),child:await childState(page)};
      assert.equal(result.ready.geometry.dialog.modal,false);assert.equal(result.ready.geometry.iframes[0].style.pointerEvents,'auto');assert.equal(result.ready.child.readyState,'complete');
      const oldMessages=await page.evaluate(()=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').length);
      row.actions.push({action:label+' child click',attempt:1});result.clickAttempts++;
      await target.click();result.after={geometry:await page.evaluate(resetHitTestInPage),child:await childState(page)};
      assert.equal(result.after.child.clicks,result.ready.child.clicks+1,'Exactly one normal click reaches restored child: '+label);
      await page.waitForFunction(count=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').length>count,oldMessages);
      result.message=await page.evaluate(()=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').at(-1));assert.equal(result.message.modal,false);
    }
    for(const item of PLAN) {
      if(Date.now()-started>=WORK_LIMIT_MS){report.errors.push({type:'incomplete-sample',message:'165-second work budget reached before all 24 contexts; remaining samples were not run'});break;}
      const row={...item,startedAt:new Date().toISOString(),phase:'context creation',actions:[],frames:[],snapshots:[],pass:null};report.cases.push(row);save();
      let context,page;
      const scenario=(async()=>{
        context=await contextFor();page=await context.newPage();
        page.on('pageerror',error=>{(row.pageErrors||=[]).push(error.stack);});
        page.on('response',response=>{if(response.url().startsWith(server.origin)&&response.status()>=400)(row.localHttpErrors||=[]).push({url:response.url(),status:response.status()});});
        row.phase='load';await page.goto(server.origin+'/',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
        await page.waitForFunction(()=>getComputedStyle(document.body).visibility==='visible'&&Number(getComputedStyle(document.body).opacity)>.99);
        await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}html{scroll-behavior:auto!important}'});
        await page.evaluate(()=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=0;}));
        await page.evaluate(instrumentInteractionsInPage);
        assert.equal(await page.getAttribute('html','data-te-project'),'native');assert.equal(await stored(page),null,'Context must have fresh project storage');
        row.phase='prepare cyan custom state';await open(page,row);await page.selectOption('[name="preset"]','cyan');await close(page,row);await pause(25);
        const before=await stored(page);assert.equal(before.preset,'cyan');
        if(item.iteration%2===0) await page.locator('iframe').scrollIntoViewIfNeeded();
        row.beforeOpen=await page.evaluate(resetHitTestInPage);await open(page,row);
        row.beforeReset=await page.evaluate(resetHitTestInPage);
        assert.equal(row.beforeReset.dialog.modal,false);assert.equal(row.beforeReset.iframes[0].style.pointerEvents,'auto');
        const point=row.beforeReset.reset.point,frameRect=row.beforeReset.iframes[0].rect;
        row.resetOverlapsFrame=point.x>=frameRect.x&&point.x<=frameRect.right&&point.y>=frameRect.y&&point.y<=frameRect.bottom;
        assert.equal(row.resetOverlapsFrame,false,'In-flow editor must not overlap the embedded surface');
        assert.ok(row.beforeReset.dialog.rect.bottom < frameRect.y, 'Whole editor must precede video');
        if(item.mode==='rendered') {
          row.phase='rendered editor barrier';row.modalTicks={parent:await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b])))))};
          row.modalScreenshot=`${row.id}-modal-rendered.png`;await page.locator('#tront-theme-editor').screenshot({path:path.join(output,row.modalScreenshot)});
          row.afterBarrier=await page.evaluate(resetHitTestInPage);
        }
        row.phase='first Reset';row.actions.push({action:'Reset',attempt:1});await page.locator('[data-action="reset"]').click();
        row.afterReset={state:await page.evaluate(interactionStateInPage),geometry:await page.evaluate(resetHitTestInPage)};
        assert.equal(row.afterReset.state.project,'native','First normal Reset must immediately select native');assert.equal(await stored(page),null,'First normal Reset removes project storage');
        assert.equal(await page.locator('[data-action="reset"]').evaluate(el=>el===document.activeElement),true,'Reset retains normal pointer focus');row.firstResetPassed=true;
        row.phase='Undo';row.actions.push({action:'Undo',attempt:1});await page.locator('[data-action="undo"]').click();
        assert.deepEqual(await stored(page),before,'Undo restores exact custom state');assert.equal(await page.getAttribute('html','data-te-project'),'custom');
        assert.equal(await page.locator('[data-action="undo"]').evaluate(el=>el===document.activeElement),true,'Undo retains normal pointer focus');
        row.phase='Close';await close(page,row);await restoreFrame(page,row,'after-close');
        row.phase='reopen and real Escape';await open(page,row);assert.deepEqual(await stored(page),before);assert.equal(await page.locator('iframe').evaluate(el=>getComputedStyle(el).pointerEvents),'auto');
        await close(page,row,true);await restoreFrame(page,row,'after-escape');
        row.phase='reopen after Escape';await open(page,row);assert.deepEqual(await stored(page),before);await close(page,row);
        assert.deepEqual(await page.evaluate(()=>['tront-theme','tront-theme-gallery-v1','tront-previews-paused'].map(key=>localStorage.getItem(key))),['sentinel-legacy','sentinel-gallery','sentinel-paused']);
        assert.deepEqual(row.pageErrors||[],[]);assert.deepEqual(row.localHttpErrors||[],[]);
        row.phase='passed';row.finalState=await page.evaluate(interactionStateInPage);
      })();
      try {await bounded(scenario,Math.min(CASE_LIMIT_MS,Math.max(1,WORK_LIMIT_MS-(Date.now()-started))),item.id);row.pass=true;}
      catch(error) {
        row.pass=false;row.error=error.stack;
        if(page&&!page.isClosed()) {
          try {row.failure=await bounded((async()=>({state:await page.evaluate(interactionStateInPage),geometry:await page.evaluate(resetHitTestInPage),child:await childState(page)}))(),1000,'failure capture');}catch(captureError){row.captureError=captureError.message;}
          try {row.failureScreenshot=`${row.id}-failure.png`;await page.screenshot({path:path.join(output,row.failureScreenshot),timeout:1000});}catch(captureError){row.screenshotError=captureError.message;}
        }
      } finally {
        if(context)await bounded(context.close(),1500,'context cleanup').catch(error=>{row.cleanupError=error.message;row.pass=false;});
        // Closing an expired context cancels any still-pending single action, never retries it.
        await bounded(scenario.catch(()=>{}),500,'cancelled scenario settlement').catch(()=>{});
        row.finishedAt=new Date().toISOString();save();console.log(`${row.id}: ${row.pass?'PASS':'FAIL'} (${row.phase})`);
      }
    }
  } catch(error) {report.errors.push({type:'runner',message:error.stack});}
  finally {
    if(browser)await bounded(browser.close(),3000,'browser cleanup').catch(error=>report.errors.push({type:'cleanup',message:error.message}));
    if(server)await bounded(server.close(),1000,'server cleanup').catch(error=>report.errors.push({type:'cleanup',message:error.message}));
    clearTimeout(hardTimer);report.finishedAt=new Date().toISOString();save();
    console.log(JSON.stringify({head:report.head,...report.summary,elapsedMs:report.elapsedMs,output},null,2));process.exitCode=report.summary.pass?0:1;
  }
  return report;
}
module.exports={PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,aggregate};
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
