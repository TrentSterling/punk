'use strict';
/* Diagnostic only: normal locator clicks, no forced actions, retries, runtime
 * repair, browser flag experiments, or production-file changes. CI only. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {argumentsFor,sourceCheck,sha,gitText}=require('./source.cjs');
const {startServer}=require('./server.cjs');
const F=require('./modal-routing-fixtures.cjs');
const HARD_LIMIT_MS=175000,WORK_LIMIT_MS=165000,OUTER_LIMIT_MS=185000,CASE_LIMIT_MS=14000;
const PLAN=Object.freeze(Array.from({length:6},(_,i)=>{
  // Reverse each alternate block to avoid always warming the same cell first.
  const cells=['app','native'].flatMap(surface=>['same','cross'].flatMap(origin=>['immediate','rendered'].map(timing=>({surface,origin,timing}))));
  if(i%2)cells.reverse();
  return cells.map(cell=>Object.freeze({...cell,iteration:i+1,id:`${cell.surface}-${cell.origin}-${cell.timing}-${i+1}`}));
}).flat());
const POINTER_TYPES=['pointerdown','pointerup','mousedown','mouseup','click'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label} exceeded ${ms} ms; no retry`)),ms);})]);}finally{clearTimeout(timer);}}
function aggregate(cases,errors=[]){
  const groups={};
  for(const item of PLAN){const key=`${item.surface}/${item.origin}/${item.timing}`;if(groups[key])continue;const rows=cases.filter(r=>`${r.surface}/${r.origin}/${r.timing}`===key);groups[key]={planned:6,started:rows.length,completed:rows.filter(r=>r.finishedAt).length,passed:rows.filter(r=>r.pass===true).length,failed:rows.filter(r=>r.pass===false).length,initialResetPassed:rows.filter(r=>r.initial?.pass===true).length,reopenedResetPassed:rows.filter(r=>r.reopened?.pass===true).length};}
  return {groups,pass:errors.length===0&&cases.length===PLAN.length&&Object.values(groups).every(g=>g.completed===6&&g.passed===6)};
}
function optionsFor(argv=process.argv.slice(2)){
  const options=argumentsFor(argv);options.browserMode=options['browser-mode']||'headless';
  assert.equal(options.project,'punk','Modal routing controls are Punk-only');
  assert.ok(['headless','headed'].includes(options.browserMode),'--browser-mode must be headless or headed');
  options.output=path.join(options.output,'modal-routing-'+options.browserMode);return options;
}
function hashes(root){return Object.fromEntries(['index.htm','assets/js/tront-theme-editor.js','assets/css/project-theme.css'].map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));}
function actionMarker(value){process.stderr.write('MODAL_ROUTING_ACTION '+JSON.stringify({...value,workerWallMs:Date.now()})+'\n');}
// DEBUG=pw:protocol observes the real CDP requests without modifying Playwright.
// An action marker uses the same stderr stream, preserving send/action order.
function protocolCollector(emit){
  let action=null;const pending=new Map();
  return line=>{
    line=line.replace(/\u001b\[[0-9;]*m/g,'');
    if(line.startsWith('MODAL_ROUTING_ACTION ')){
      const marker=JSON.parse(line.slice('MODAL_ROUTING_ACTION '.length));
      emit({kind:'action',...marker,observedWallMs:Date.now()});action=marker.boundary==='begin'?marker:null;return;
    }
    const match=/pw:protocol\s+(SEND|RECV)\s+[^\{]*(\{.*\})\s*$/.exec(line);if(!match)return;
    // Avoid parsing large evaluate/screenshot replies unrelated to input.
    const id=/^\{"id":(\d+)/.exec(match[2]);
    if(!match[2].includes('"method":"Input.dispatchMouseEvent"')&&(!id||![...pending.values()].some(r=>r.id===Number(id[1]))))return;
    const record=JSON.parse(match[2]),key=`${record.sessionId||''}:${record.id}`;
    if(match[1]==='SEND'&&record.method==='Input.dispatchMouseEvent'){
      const entry={kind:'dispatch',direction:'send',protocolTimestamp:line.slice(0,line.indexOf('pw:protocol')).trim(),observedWallMs:Date.now(),action:action?{...action}:null,...record};pending.set(key,entry);emit(entry);
    }else if(match[1]==='RECV'&&pending.has(key)){
      emit({kind:'dispatch',direction:'ack',observedWallMs:Date.now(),action:pending.get(key).action,...record});pending.delete(key);
    }
  };
}
function attachDispatch(report,records){
  report.dispatchCapture={method:'Playwright DEBUG=pw:protocol; observed CDP sends/acks, not a synthesized input path',records:records.length,loggingCanChangeScheduling:true};
  for(const row of report.cases){
    row.dispatch=records.filter(r=>r.kind==='dispatch'&&r.action?.caseId===row.id);
    for(const phaseName of ['initial','reopened']){
      const phase=row[phaseName];if(!phase?.attempted)continue;
      const sends=row.dispatch.filter(r=>r.direction==='send'&&r.action.action===phaseName+' Reset');
      phase.dispatch=sends;
      phase.singleDispatch=sends.filter(r=>r.params.type==='mousePressed').length===1&&sends.filter(r=>r.params.type==='mouseReleased').length===1&&sends.every(r=>r.params.clickCount===undefined||r.params.clickCount<=1);
      const acks=row.dispatch.filter(r=>r.direction==='ack'&&r.action.action===phaseName+' Reset');
      phase.dispatchAckComplete=sends.length>0&&sends.every(send=>acks.some(ack=>ack.id===send.id&&ack.sessionId===send.sessionId&&!ack.error));
      if(!phase.singleDispatch||!phase.dispatchAckComplete){phase.pass=false;row.pass=false;row.errors.push(`${phaseName}: actual dispatch absent, repeated, unacknowledged, or errored`);}
    }
  }
  report.summary=aggregate(report.cases,report.errors);
  return report;
}
async function launchWorker(options){
  fs.mkdirSync(options.output,{recursive:true});const records=[];
  const fd=fs.openSync(path.join(options.output,'dispatch.jsonl'),'w');
  const collect=protocolCollector(record=>{records.push(record);fs.writeSync(fd,JSON.stringify(record)+'\n');});
  const child=spawn(process.execPath,[__filename,...process.argv.slice(2),'--worker','1'],{env:{...process.env,DEBUG:'pw:protocol',DEBUG_COLORS:'0'},stdio:['ignore','inherit','pipe']});
  let partial='',expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},OUTER_LIMIT_MS);
  child.stderr.on('data',chunk=>{partial+=chunk;let newline;while((newline=partial.indexOf('\n'))!==-1){const line=partial.slice(0,newline);partial=partial.slice(newline+1);try{collect(line);}catch(error){records.push({kind:'capture-error',message:error.message});}if(!line.includes('pw:protocol')&&!line.startsWith('MODAL_ROUTING_ACTION '))process.stderr.write(line+'\n');}});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});clearTimeout(timer);if(partial)collect(partial);fs.closeSync(fd);
  const file=path.join(options.output,'routing.json');
  const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{cases:[],errors:[{type:'missing-report',message:'Worker did not produce routing.json'}]};
  if(expired)report.errors.push({type:'outer-runtime-limit',message:'185-second wrapper ceiling reached'});
  for(const r of records.filter(r=>r.kind==='capture-error'))report.errors.push(r);
  attachDispatch(report,records);report.workerExitCode=code;fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({browserMode:options.browserMode,...report.summary,output:options.output},null,2));process.exitCode=code===0&&report.summary.pass?0:1;
}
async function run(options){
  fs.mkdirSync(options.output,{recursive:true});const started=Date.now();
  const report={startedAt:new Date(started).toISOString(),browserMode:options.browserMode,plan:PLAN,limits:{hard:HARD_LIMIT_MS,work:WORK_LIMIT_MS,outer:OUTER_LIMIT_MS},cases:[],errors:[],warnings:[],limitations:[
    'Controlled inert provider document only; actual YouTube playback, controls and availability remain unverified.',
    'Six fresh contexts per app/native × same/cross-origin × immediate/rendered cell. Initial and reopened Reset outcomes are separate, and every planned context must finish.',
    'Initial Reset starts already native: trusted event routing is asserted, but that phase alone does not demonstrate a state change. Reopened Reset starts cyan and must remove storage; Undo must restore it exactly.',
    'Native control has matched overlap geometry and matching modal-only iframe pointer suppression but deliberately omits app layout/theme/compositor complexity. A difference does not identify a specific CSS rule.',
    'Protocol logging and read-only instrumentation can affect scheduling. A clean sample cannot erase earlier failures or prove absence of a rare race.',
    'Headed and headless use the same Playwright/CDP input path. A headed pass does not establish physical-user-input behavior.',
    'Cross-origin is not assumed to mean cross-process: iframe CDP targets are recorded before interactions. No browser security flags are changed.',
    'Immediate cases add no screenshot, tracing, animation-frame or compositor barrier before Reset. Rendered cases explicitly wait two parent/child frames and capture a PNG.'
  ]};
  const save=()=>{report.elapsedMs=Date.now()-started;report.summary=aggregate(report.cases,report.errors);fs.writeFileSync(path.join(options.output,'routing.json'),JSON.stringify(report,null,2)+'\n');};
  let server,browser,hardTimer,initialHashes;const cache=new Map();
  try{
    if(!process.env.CI)throw Error('Browser diagnostics are CI-only. No local Chrome launch or denied-route retry attempted.');
    if(!process.env.THEME_BROWSER_EXECUTABLE)throw Error('THEME_BROWSER_EXECUTABLE must select existing official CI Chrome');
    if(options.browserMode==='headed'&&!process.env.DISPLAY)throw Error('Headed CI requires an existing Xvfb DISPLAY; do not change browser flags');
    hardTimer=setTimeout(()=>{report.errors.push({type:'hard-runtime-limit',message:'175-second ceiling; unfinished coverage is failure'});save();process.exit(1);},HARD_LIMIT_MS);
    report.source=sourceCheck(options).report;assert.equal(report.source.pass,true,'Source/media protection must pass');
    report.head=gitText(options.root,['rev-parse','HEAD']).trim();initialHashes=hashes(options.root);report.sourceHashes=initialHashes;
    const app=fs.readFileSync(path.join(options.root,'index.htm'),'utf8');server=await startServer({root:options.root,overrides:{[F.CHILD_PATH.slice(1)]:F.childDocument()}});
    const {chromium}=require('playwright');report.playwrightVersion=require('playwright/package.json').version;
    browser=await chromium.launch({executablePath:process.env.THEME_BROWSER_EXECUTABLE,headless:options.browserMode==='headless',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    report.browserVersion=browser.version();report.launch={executablePath:process.env.THEME_BROWSER_EXECUTABLE,headless:options.browserMode==='headless',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'],display:process.env.DISPLAY||null};
    const snapshot=page=>page.evaluate(()=>window.__routingSnapshot());
    const childState=page=>page.frameLocator('iframe').locator('body').evaluate(()=>({time:performance.now(),timeOrigin:performance.timeOrigin,epochMs:performance.timeOrigin+performance.now(),readyState:document.readyState,visibility:document.visibilityState,origin:location.origin,events:window.__routingChildEvents||[],clicks:(window.__routingChildEvents||[]).filter(e=>e.type==='click').length}));
    const frames=async page=>{const [parent,child]=await Promise.all([page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve({a,b,timeOrigin:performance.timeOrigin}))))),page.frameLocator('iframe').locator('body').evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve({a,b,timeOrigin:performance.timeOrigin}))))) ]);return {parent,child};};
    for(const item of PLAN){
      if(Date.now()-started>=WORK_LIMIT_MS){report.errors.push({type:'incomplete-sample',message:'165-second work budget expired; unrun cases are not passes'});break;}
      const row={...item,startedAt:new Date().toISOString(),phase:'context creation',actions:[],restorations:[],errors:[],pass:null};report.cases.push(row);save();let context,page;
      async function action(name,fn){const entry={action:name,attempt:1,startedWallMs:Date.now()};row.actions.push(entry);actionMarker({boundary:'begin',caseId:row.id,action:name});try{return await fn();}finally{entry.finishedWallMs=Date.now();actionMarker({boundary:'end',caseId:row.id,action:name});}}
      async function open(label){row.phase=label;assert.equal((await snapshot(page)).dialog.open,false);await action(label,()=>page.locator('#tront-theme-btn').click());await page.waitForFunction(()=>document.querySelector('dialog').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='true');assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true,'Opening must focus Close');}
      async function close(label,escape=false){row.phase=label;const count=await page.evaluate(()=>window.__routingCloseEvents);await action(label,()=>escape?page.keyboard.press('Escape'):page.locator('[data-action="close"]').click());await page.waitForFunction(count=>!document.querySelector('dialog').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='false'&&document.activeElement===document.querySelector('#tront-theme-btn')&&window.__routingCloseEvents>count,count);assert.equal((await snapshot(page)).iframe.style.pointerEvents,'auto');}
      async function resetPhase(name){
        const result={attempted:false,pass:null,errors:[],beforeChild:await childState(page),eventOffset:await page.evaluate(()=>window.__routingEvents.length)};row[name]=result;
        await open(name+' open');row.phase=name+' Reset';result.before=await snapshot(page);
        assert.equal(result.before.dialog.modal,true);assert.equal(result.before.iframe.style.pointerEvents,'none');assert.equal(result.before.reset.hit?.action,'reset');
        const p=result.before.reset.point,r=result.before.iframe.rect;result.overlap=p.x>=r.x&&p.x<=r.right&&p.y>=r.y&&p.y<=r.bottom;assert.equal(result.overlap,true,'Reset must overlap underlying frame');
        if(item.timing==='rendered'){result.ticks=await frames(page);result.screenshot=`${row.id}-${name}-rendered.png`;await page.locator('dialog').screenshot({path:path.join(options.output,result.screenshot)});result.afterBarrier=await snapshot(page);}
        result.attempted=true;
        try{await action(name+' Reset',()=>page.locator('[data-action="reset"]').click());}catch(error){result.errors.push(error.message);}
        result.after=await snapshot(page);result.afterChild=await childState(page);result.events=await page.evaluate(offset=>window.__routingEvents.slice(offset),result.eventOffset);
        const resetClicks=result.events.filter(e=>e.type==='click'&&e.target?.action==='reset');
        const childPointers=result.afterChild.events.slice(result.beforeChild.events.length).filter(e=>POINTER_TYPES.includes(e.type));
        if(resetClicks.length!==1||!resetClicks[0]?.isTrusted)result.errors.push('Exactly one trusted parent Reset click required');
        if(childPointers.length)result.errors.push('Child received pointer input while modal Reset was targeted');
        if(result.after.project!=='native'||result.after.stored!==null)result.errors.push('Reset must immediately leave native state and no project storage');
        if(result.after.active?.action!=='reset')result.errors.push('Reset must retain ordinary pointer focus');
        result.pass=result.errors.length===0;row.errors.push(...result.errors.map(message=>`${name}: ${message}`));
      }
      async function restore(label){
        row.phase=label;const result={label,before:await childState(page)};row.restorations.push(result);
        const target=page.frameLocator('iframe').locator('p');await target.scrollIntoViewIfNeeded();result.ticks=await frames(page);result.beforeGeometry=await snapshot(page);
        assert.equal(result.beforeGeometry.dialog.modal,false);assert.equal(result.beforeGeometry.iframe.style.pointerEvents,'auto');
        await action(label,()=>target.click());result.after=await childState(page);result.afterGeometry=await snapshot(page);assert.equal(result.after.clicks,result.before.clicks+1,'One normal click must reach the restored controlled child');result.pass=true;
      }
      const scenario=(async()=>{
        context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block'});context.setDefaultTimeout(3000);context.setDefaultNavigationTimeout(10000);await context.addInitScript(F.parentProbe);
        await context.route('**/*',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(!['GET','HEAD'].includes(request.method())){(row.blockedNonReadRequests||=[]).push({method:request.method(),url:request.url()});await route.abort('blockedbyclient');return;}
          if(url.origin===server.origin){
            if(url.pathname===F.NATIVE_PATH){await route.fulfill({status:200,contentType:'text/html',body:F.nativeDocument(item.origin==='same'?server.origin+F.CHILD_PATH:F.CROSS_URL)});return;}
            if(url.pathname==='/'&&item.surface==='app'&&item.origin==='same'){await route.fulfill({status:200,contentType:'text/html',body:F.sameOriginApp(app,server.origin)});return;}
            await route.continue();return;
          }
          if(url.href===F.CROSS_URL){await route.fulfill({status:200,contentType:'text/html',body:F.childDocument()});return;}
          const allowed=((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font')||(['tront.xyz','blog.tront.xyz','hackerpunk.s3.amazonaws.com'].includes(url.hostname)&&request.resourceType()==='image')||(url.hostname==='tront.xyz'&&url.pathname==='/favicon.png'&&request.resourceType()==='other'));
          if(!allowed){report.warnings.push({type:'blocked-external-request',url:request.url(),resourceType:request.resourceType()});await route.abort('blockedbyclient');return;}
          if(!cache.has(request.url()))cache.set(request.url(),(async()=>{try{const response=await route.fetch({timeout:8000});if(!response.ok())throw Error('HTTP '+response.status());return {status:response.status(),headers:response.headers(),body:await response.body()};}catch(error){report.warnings.push({type:'external-asset-unavailable',url:request.url(),message:error.message});return null;}})());
          const cached=await cache.get(request.url());if(cached)await route.fulfill(cached);else await route.abort('failed');
        });
        page=await context.newPage();page.on('pageerror',error=>(row.pageErrors||=[]).push(error.stack));page.on('response',response=>{if(response.url().startsWith(server.origin)&&response.status()>=400)(row.localHttpErrors||=[]).push({url:response.url(),status:response.status()});});
        row.phase='load';await page.goto(server.origin+(item.surface==='app'?'/':F.NATIVE_PATH),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>getComputedStyle(document.body).visibility==='visible'&&Number(getComputedStyle(document.body).opacity)>.99);
        // Same visual preparation as existing stress.cjs. This is not a claim
        // that animations created later by the cyan switch are also paused.
        await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}html{scroll-behavior:auto!important}'});await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=0;}));
        assert.equal((await snapshot(page)).stored,null);assert.equal((await snapshot(page)).project,'native');
        const cdp=await context.newCDPSession(page);const {targetInfos}=await cdp.send('Target.getTargets');row.targets=targetInfos.map(t=>({targetId:t.targetId,type:t.type,url:t.url,attached:t.attached,browserContextId:t.browserContextId}));row.oopifObserved=targetInfos.some(t=>t.type==='iframe'&&t.url===F.CROSS_URL);await cdp.detach();
        row.childDocument=await childState(page);assert.equal(row.childDocument.readyState,'complete');assert.equal(row.childDocument.origin,item.origin==='same'?server.origin:new URL(F.CROSS_URL).origin);
        await resetPhase('initial');
        row.phase='select cyan';await action('select cyan',()=>page.selectOption('[name="preset"]','cyan'));const custom=(await snapshot(page)).stored;assert.equal(JSON.parse(custom).preset,'cyan');await close('initial Close');await pause(25);
        await resetPhase('reopened');
        if(row.reopened.pass){row.phase='Undo';await action('Undo',()=>page.locator('[data-action="undo"]').click());const state=await snapshot(page);assert.equal(state.stored,custom,'Undo must restore exact custom storage');assert.equal(state.project,'custom');assert.equal(state.active?.action,'undo');}
        else row.undoSkipped='Reopened first Reset failed; no retry or synthetic state repair was performed';
        await close('reopened Close');await restore('after Close child click');
        await open('open for Escape');await close('real Escape',true);await restore('after Escape child click');
        const expected=(await snapshot(page)).stored;await open('final reopen');assert.equal((await snapshot(page)).stored,expected);await close('final Close');
        assert.deepEqual(await page.evaluate(()=>['tront-theme','tront-theme-gallery-v1','tront-previews-paused'].map(key=>localStorage.getItem(key))),['sentinel-legacy','sentinel-gallery','sentinel-paused']);
        assert.deepEqual(row.pageErrors||[],[]);assert.deepEqual(row.localHttpErrors||[],[]);assert.deepEqual(row.blockedNonReadRequests||[],[]);row.final=await snapshot(page);row.finalChild=await childState(page);row.events=await page.evaluate(()=>window.__routingEvents);row.phase='completed';
      })();
      try{await bounded(scenario,Math.min(CASE_LIMIT_MS,Math.max(1,WORK_LIMIT_MS-(Date.now()-started))),row.id);row.pass=row.errors.length===0&&row.initial?.pass===true&&row.reopened?.pass===true;}
      catch(error){row.pass=false;row.errors.push(error.stack);}
      finally{
        if(page&&!page.isClosed()&&!row.pass){try{row.failure=await bounded((async()=>({state:await snapshot(page),child:await childState(page),events:await page.evaluate(()=>window.__routingEvents)}))(),1000,'failure capture');row.failureScreenshot=`${row.id}-final-failure-state.png`;await page.screenshot({path:path.join(options.output,row.failureScreenshot),timeout:1000});}catch(error){row.captureError=error.message;}}
        if(context)await bounded(context.close(),1500,'context close').catch(error=>{row.errors.push(error.message);row.pass=false;});await bounded(scenario.catch(()=>{}),500,'scenario settlement').catch(()=>{});
        row.finishedAt=new Date().toISOString();save();console.log(`${row.id}: ${row.pass?'PASS':'FAIL'}; initial=${row.initial?.pass}, reopened=${row.reopened?.pass}`);
      }
    }
  }catch(error){report.errors.push({type:'runner',message:error.stack});}
  finally{
    if(browser)await bounded(browser.close(),3000,'browser close').catch(error=>report.errors.push({type:'cleanup',message:error.message}));if(server)await bounded(server.close(),1000,'server close').catch(error=>report.errors.push({type:'cleanup',message:error.message}));clearTimeout(hardTimer);
    if(initialHashes){report.finalSourceHashes=hashes(options.root);if(JSON.stringify(initialHashes)!==JSON.stringify(report.finalSourceHashes))report.errors.push({type:'source-mutation',message:'Protected input hashes changed during diagnostic'});}
    report.finishedAt=new Date().toISOString();save();process.exitCode=report.summary.pass?0:1;
  }
}
module.exports={PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,OUTER_LIMIT_MS,aggregate,optionsFor,protocolCollector,attachDispatch};
if(require.main===module){let options;try{options=optionsFor();}catch(error){console.error(error.stack);process.exitCode=1;}if(options)(options.worker==='1'?run(options):launchWorker(options)).catch(error=>{console.error(error.stack);process.exitCode=1;});}
