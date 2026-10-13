'use strict';
// Separate headed XTEST discriminator. Does not replace the strict CDP sample.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {argumentsFor,sourceCheck,sha,gitText}=require('./source.cjs');
const {startServer}=require('./server.cjs');
const F=require('./modal-routing-fixtures.cjs');
const {prepareNativePointer,requireCI}=require('./native-pointer.cjs');
const HARD_LIMIT_MS=175000,WORK_LIMIT_MS=165000,CASE_LIMIT_MS=14000;
const PLAN=Object.freeze(Array.from({length:6},(_,i)=>[
  {id:`app-${i*2+1}`,surface:'app',iteration:i*2+1},
  {id:`native-${i+1}`,surface:'native',iteration:i+1},
  {id:`app-${i*2+2}`,surface:'app',iteration:i*2+2}
]).flat().map(Object.freeze));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} exceeded ${ms} ms; no retry`)),ms);})]);}finally{clearTimeout(timer);}}
function aggregate(cases,errors=[]){
  const groups=Object.fromEntries(['app','native'].map(surface=>{const rows=cases.filter(r=>r.surface===surface);return [surface,{planned:surface==='app'?12:6,started:rows.length,completed:rows.filter(r=>r.finishedAt).length,passed:rows.filter(r=>r.pass===true).length,failed:rows.filter(r=>r.pass===false).length,nativeResetPassed:rows.filter(r=>r.reset?.pass===true).length}];}));
  return {groups,pass:errors.length===0&&cases.length===18&&Object.values(groups).every(g=>g.completed===g.planned&&g.passed===g.planned)};
}
function summarizeLatency(input,parentEvents=[]){
  const opened=input.events.find(e=>e.frame==='parent'&&e.type==='click'&&e.target?.id==='tront-theme-btn');
  const reset=input.results.find(r=>r.label==='reset');
  const down=reset?.events.find(e=>e.type==='pointerdown');
  const closed=parentEvents.filter(e=>e.type==='close'&&e.target?.id==='tront-theme-editor'&&e.epochMs<opened?.epochMs).at(-1);
  return {openClickEpochMs:opened?.epochMs,resetDownEpochMs:down?.epochMs,openClickToResetDownMs:opened&&down?down.epochMs-opened.epochMs:null,resetDeliveryFrame:down?.frame||null,previousCloseEpochMs:closed?.epochMs,closeToOpenClickMs:closed&&opened?opened.epochMs-closed.epochMs:null};
}
function protectedHashes(root){return Object.fromEntries(['index.htm','assets/js/tront-theme-editor.js','assets/css/project-theme.css'].map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));}
async function main(){
  const options=argumentsFor();assert.equal(options.project,'punk');const output=path.join(options.output,'native-routing');fs.mkdirSync(output,{recursive:true});const started=Date.now();
  const report={startedAt:new Date(started).toISOString(),plan:PLAN,limits:{hard:HARD_LIMIT_MS,work:WORK_LIMIT_MS,perCase:CASE_LIMIT_MS},inputKind:'X11 XTEST via xdotool',cases:[],errors:[],warnings:[],limitations:[
    'Separate finite headed sample: 12 actual-app and 6 primitive-native-dialog contexts, all with the controlled cross-origin frame. This does not replace or erase CDP failures.',
    'Only the critical opener and first Reset use one native XTEST activation each. Preparation and subsequent Undo/Close/Escape/restoration checks use normal Playwright input and remain identified separately.',
    'Native process/command overhead can change open-to-Reset timing. Compare actual event latency with earlier CDP failures; a clean native cohort alone cannot prove physical-user correctness or absence of races.',
    'Calibration and arm identity checks occur before cyan preparation while the modal is initially closed. The two-second native permit includes cyan preparation; Close-to-open and open-to-Reset event latencies are recorded. No screenshots, rAF barriers, artificial sleeps, forced clicks, repeated activations or synthetic state repair occur between native open and Reset.',
    'The iframe is a labelled inert provider placeholder. Actual YouTube playback, provider controls, availability and playback-state preservation remain unverified.',
    'The native dialog primitive omits app layout/theme/compositor complexity; passing that control does not identify a CSS property or root cause.'
  ]};
  const save=()=>{report.elapsedMs=Date.now()-started;report.summary=aggregate(report.cases,report.errors);fs.writeFileSync(path.join(output,'routing.json'),JSON.stringify(report,null,2)+'\n');};
  let server,browser,hardTimer,initialHashes;const cache=new Map();
  try{
    requireCI(process.env);assert.ok(process.env.THEME_BROWSER_EXECUTABLE,'Existing official CI Chrome must be selected');
    hardTimer=setTimeout(()=>{report.errors.push({type:'hard-runtime-limit',message:'175-second ceiling reached; unfinished cases are failure'});save();process.exit(1);},HARD_LIMIT_MS);
    report.source=sourceCheck(options).report;assert.equal(report.source.pass,true,'Source/media guard must pass');report.head=gitText(options.root,['rev-parse','HEAD']).trim();initialHashes=protectedHashes(options.root);report.sourceHashes=initialHashes;
    server=await startServer({root:options.root});const {chromium}=require('playwright');report.playwrightVersion=require('playwright/package.json').version;
    browser=await chromium.launch({executablePath:process.env.THEME_BROWSER_EXECUTABLE,headless:false,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});report.browserVersion=browser.version();report.launch={headless:false,executablePath:process.env.THEME_BROWSER_EXECUTABLE,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],display:process.env.DISPLAY,isolatedDisplay:process.env.THEME_NATIVE_POINTER_DISPLAY_ISOLATED};
    const snapshot=page=>page.evaluate(()=>window.__routingSnapshot());
    const childState=page=>page.frameLocator('iframe').locator('body').evaluate(()=>({time:performance.now(),timeOrigin:performance.timeOrigin,epochMs:performance.timeOrigin+performance.now(),readyState:document.readyState,visibility:document.visibilityState,events:window.__routingChildEvents||[],clicks:(window.__routingChildEvents||[]).filter(e=>e.type==='click').length}));
    const frames=async page=>Promise.all([page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve({a,b,timeOrigin:performance.timeOrigin}))))),page.frameLocator('iframe').locator('body').evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve({a,b,timeOrigin:performance.timeOrigin})))))]);
    for(const item of PLAN){
      if(Date.now()-started>=WORK_LIMIT_MS){report.errors.push({type:'incomplete-sample',message:'165-second work budget reached'});break;}
      const row={...item,startedAt:new Date().toISOString(),phase:'context creation',actions:[],restorations:[],errors:[],pass:null};report.cases.push(row);save();let context,page,native,stopForSetup=false;
      async function action(name,fn){const result={name,input:'Playwright',attempt:1,startedEpochMs:Date.now()};row.actions.push(result);try{return await fn();}finally{result.finishedEpochMs=Date.now();}}
      async function open(label){row.phase=label;assert.equal((await snapshot(page)).dialog.open,false);await action(label,()=>page.locator('#tront-theme-btn').click());await page.waitForFunction(()=>document.querySelector('dialog').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='true');assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true);}
      async function close(label,escape=false){row.phase=label;const count=await page.evaluate(()=>window.__routingCloseEvents);await action(label,()=>escape?page.keyboard.press('Escape'):page.locator('[data-action="close"]').click());await page.waitForFunction(count=>!document.querySelector('dialog').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='false'&&document.activeElement===document.querySelector('#tront-theme-btn')&&window.__routingCloseEvents>count,count);assert.equal((await snapshot(page)).iframe.style.pointerEvents,'auto');}
      async function restore(label){row.phase=label;const result={label,before:await childState(page)};row.restorations.push(result);const target=page.frameLocator('iframe').locator('p');await target.scrollIntoViewIfNeeded();result.ticks=await frames(page);result.beforeGeometry=await snapshot(page);assert.equal(result.beforeGeometry.dialog.modal,false);assert.equal(result.beforeGeometry.iframe.style.pointerEvents,'auto');await action(label,()=>target.click());result.after=await childState(page);assert.equal(result.after.clicks,result.before.clicks+1);result.pass=true;}
      const scenario=(async()=>{
        context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});context.setDefaultTimeout(3000);context.setDefaultNavigationTimeout(10000);await context.addInitScript(F.parentProbe);
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(!['GET','HEAD'].includes(request.method())){(row.blockedNonReadRequests||=[]).push({method:request.method(),url:request.url()});await route.abort('blockedbyclient');return;}
          if(url.origin===server.origin){if(url.pathname===F.NATIVE_PATH){await route.fulfill({status:200,contentType:'text/html',body:F.nativeDocument(F.CROSS_URL)});return;}await route.continue();return;}
          if(url.href===F.CROSS_URL){await route.fulfill({status:200,contentType:'text/html',body:F.childDocument()});return;}
          const allowed=((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font')||(['tront.xyz','blog.tront.xyz','hackerpunk.s3.amazonaws.com'].includes(url.hostname)&&request.resourceType()==='image')||(url.hostname==='tront.xyz'&&url.pathname==='/favicon.png'&&request.resourceType()==='other'));
          if(!allowed){report.warnings.push({type:'blocked-external-request',url:request.url(),resourceType:request.resourceType()});await route.abort('blockedbyclient');return;}
          if(!cache.has(request.url()))cache.set(request.url(),(async()=>{try{const response=await route.fetch({timeout:8000});if(!response.ok())throw Error('HTTP '+response.status());return {status:response.status(),headers:response.headers(),body:await response.body()};}catch(error){report.warnings.push({type:'external-asset-unavailable',url:request.url(),message:error.message});return null;}})());const cached=await cache.get(request.url());if(cached)await route.fulfill(cached);else await route.abort('failed');
        });
        page=await context.newPage();page.on('pageerror',error=>(row.pageErrors||=[]).push(error.stack));page.on('response',response=>{if(response.url().startsWith(server.origin)&&response.status()>=400)(row.localHttpErrors||=[]).push({url:response.url(),status:response.status()});});
        // Active headed page is a native-user-input prerequisite, established
        // before loading rather than extending timeouts or delaying Reset.
        row.phase='load';await page.bringToFront();await page.goto(server.origin+(item.surface==='app'?'/':F.NATIVE_PATH),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>getComputedStyle(document.body).visibility==='visible'&&Number(getComputedStyle(document.body).opacity)>.99);
        await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}html{scroll-behavior:auto!important}'});await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=0;}));assert.equal((await snapshot(page)).stored,null);assert.equal((await snapshot(page)).project,'native');
        const cdp=await context.newCDPSession(page),targets=await cdp.send('Target.getTargets');row.targets=targets.targetInfos.map(t=>({targetId:t.targetId,type:t.type,url:t.url,attached:t.attached,browserContextId:t.browserContextId}));row.oopifObserved=row.targets.some(t=>t.type==='iframe'&&t.url===F.CROSS_URL);await cdp.detach();assert.equal(row.oopifObserved,true,'Cross-process child target must be observed for this discriminator');
        row.phase='native calibration';native=await prepareNativePointer({page});row.calibration=native.calibration;
        const opener=await page.locator('#tront-theme-btn').boundingBox();assert.ok(opener);const openerPoint={x:opener.x+opener.width/2,y:opener.y+opener.height/2};
        row.phase='native arm';await native.arm();row.nativeArmed=true;
        await open('prepare cyan open');await action('select cyan',()=>page.selectOption('[name="preset"]','cyan'));const custom=(await snapshot(page)).stored;assert.equal(JSON.parse(custom).preset,'cyan');row.customBefore=custom;await close('prepare cyan Close');
        // Discard only preparation telemetry. No input, geometry read, native
        // identity query, rendering barrier, or permit renewal occurs here.
        await page.evaluate(()=>{window.__nativePointerProbe.events.length=0;});await pause(25);row.beforeChild=await childState(page);
        row.phase='native open';row.nativeOpen=await native.clickAt(openerPoint,{label:'open',expectedId:'tront-theme-btn'});
        await page.waitForFunction(()=>document.querySelector('dialog').matches(':modal')&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='true');
        row.beforeReset=await snapshot(page);assert.equal(row.beforeReset.active?.action,'close');assert.equal(row.beforeReset.dialog.modal,true);assert.equal(row.beforeReset.iframe.style.pointerEvents,'none');assert.equal(row.beforeReset.reset.hit?.action,'reset');assert.equal(row.beforeReset.stored,custom);
        const p=row.beforeReset.reset.point,r=row.beforeReset.iframe.rect;row.overlap=p.x>=r.x&&p.x<=r.right&&p.y>=r.y&&p.y<=r.bottom;assert.equal(row.overlap,true,'Native Reset must overlap controlled frame');
        row.phase='native first Reset';row.reset={attempted:true,pass:null,errors:[]};row.nativeReset=await native.clickAt(p,{label:'reset',expectedAction:'reset'});
        row.input=await native.finish();row.nativeSequenceEvents=await page.evaluate(()=>window.__routingEvents);row.latency=summarizeLatency(row.input,row.nativeSequenceEvents);row.afterReset=await snapshot(page);row.afterChild=await childState(page);
        row.reset.errors.push(...row.input.errors);
        if(row.afterReset.project!=='native'||row.afterReset.stored!==null)row.reset.errors.push('First native Reset must immediately restore native state and remove project storage');
        if(row.afterReset.active?.action!=='reset')row.reset.errors.push('First native Reset must retain ordinary pointer focus');
        if(row.afterChild.events.slice(row.beforeChild.events.length).some(e=>['pointerdown','pointerup','mousedown','mouseup','click'].includes(e.type)))row.reset.errors.push('Controlled child received pointer input during native modal sequence');
        row.reset.pass=row.reset.errors.length===0;row.errors.push(...row.reset.errors);
        await native.dispose();native=null;
        if(row.reset.pass){await action('Undo',()=>page.locator('[data-action="undo"]').click());const state=await snapshot(page);assert.equal(state.stored,custom);assert.equal(state.project,'custom');assert.equal(state.active?.action,'undo');}else row.undoSkipped='Native first Reset failed; no retry or synthetic state repair';
        await close('after native Reset Close');await restore('after Close child click');await open('open for Escape');await close('real Escape',true);await restore('after Escape child click');const expected=(await snapshot(page)).stored;await open('final reopen');assert.equal((await snapshot(page)).stored,expected);await close('final Close');
        assert.deepEqual(await page.evaluate(()=>['tront-theme','tront-theme-gallery-v1','tront-previews-paused'].map(key=>localStorage.getItem(key))),['sentinel-legacy','sentinel-gallery','sentinel-paused']);assert.deepEqual(row.pageErrors||[],[]);assert.deepEqual(row.localHttpErrors||[],[]);assert.deepEqual(row.blockedNonReadRequests||[],[]);row.final=await snapshot(page);row.finalChild=await childState(page);row.events=await page.evaluate(()=>window.__routingEvents);row.phase='completed';
      })();
      try{await bounded(scenario,Math.min(CASE_LIMIT_MS,Math.max(1,WORK_LIMIT_MS-(Date.now()-started))),row.id);row.pass=row.reset?.pass===true&&row.errors.length===0;}catch(error){row.pass=false;row.errors.push(error.stack);stopForSetup=['native calibration','native arm'].includes(row.phase)||/Native input permit expired/.test(error.message);}
      finally{
        if(native&&row.nativeArmed&&!row.input){try{row.input=await bounded(native.finish(),2000,'failed native input observation');row.latency=summarizeLatency(row.input);}catch(error){row.inputCaptureError=error.message;}}
        if(page&&!page.isClosed()&&!row.pass){try{row.failure=await bounded((async()=>({state:await snapshot(page),child:await childState(page),events:await page.evaluate(()=>window.__routingEvents),nativeProbe:await page.evaluate(()=>window.__nativePointerProbe?.events||[])}))(),1000,'failure capture');row.failureScreenshot=`${row.id}-final-failure-state.png`;await page.screenshot({path:path.join(output,row.failureScreenshot),timeout:1000});}catch(error){row.captureError=error.message;}}
        if(native)await bounded(native.dispose(),500,'native cleanup').catch(error=>{row.cleanupError=error.message;});if(context)await bounded(context.close(),1500,'context close').catch(error=>{row.errors.push(error.message);row.pass=false;});await bounded(scenario.catch(()=>{}),500,'scenario settlement').catch(()=>{});row.finishedAt=new Date().toISOString();save();console.log(`${row.id}: ${row.pass?'PASS':'FAIL'}; nativeReset=${row.reset?.pass}; phase=${row.phase}`);
      }
      if(stopForSetup){report.errors.push({type:'native-setup-blocker',message:'Native window calibration/identity failed; remaining contexts not attempted, no fallback input path used'});break;}
    }
  }catch(error){report.errors.push({type:'runner',message:error.stack});}
  finally{
    if(browser)await bounded(browser.close(),3000,'browser close').catch(error=>report.errors.push({type:'cleanup',message:error.message}));if(server)await bounded(server.close(),1000,'server close').catch(error=>report.errors.push({type:'cleanup',message:error.message}));clearTimeout(hardTimer);if(initialHashes){report.finalSourceHashes=protectedHashes(options.root);if(JSON.stringify(initialHashes)!==JSON.stringify(report.finalSourceHashes))report.errors.push({type:'source-mutation',message:'Protected input hashes changed'});}report.finishedAt=new Date().toISOString();save();console.log(JSON.stringify({head:report.head,...report.summary,elapsedMs:report.elapsedMs,output},null,2));process.exitCode=report.summary.pass?0:1;
  }
}
module.exports={PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,CASE_LIMIT_MS,aggregate,summarizeLatency};
if(require.main===module)main().catch(error=>{console.error(error.stack);process.exitCode=1;});
