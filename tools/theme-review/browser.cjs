'use strict';
/* Read-only browser QA. Intentionally requires CI; do not retry sandbox Chrome. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {argumentsFor, sourceCheck} = require('./source.cjs');
const {startServer} = require('./server.cjs');
const options = argumentsFor();
fs.mkdirSync(options.output,{recursive:true});
const report = {project:options.project,startedAt:new Date().toISOString(),checks:[],errors:[],warnings:[],network:[],media:[],screenshots:[],audits:[],nativeComparisons:[],overflowComparisons:[],interactions:[],limitations:[
  'YouTube is mocked with an explicitly labelled inert frame. YouTube playback, provider availability, cookies and controls are unverified.',
  'Native colors are compared with the original page, not claimed to meet a new contrast standard.',
  'Custom contrast is a conservative computed foreground/background envelope audit, not a pixel-level antialiasing or vision certification. Decorative particles, emoji and media pixels/fallback text are excluded.',
  'External fonts/images are allowed only on known original hosts; blocked/unavailable assets are recorded and shared between baseline/current for consistent fallback.'
]};
if(options.project==='punk')report.priorUnsynchronizedEvidence={run:'https://github.com/TrentSterling/punk/actions/runs/38318818737',head:'ba0357',status:'failed',check:'closed iframe click without explicit rendered-frame synchronization',observation:'After Close, computed pointer-events was auto and :modal was false; parent IFRAME received pointerdown/up/click, but the child document did not report a click. That historical failure is retained separately and is not retroactively counted as passed.'};
const save = () => fs.writeFileSync(path.join(options.output,'browser.json'),JSON.stringify(report,null,2)+'\n');
let diagnosticPage=null;
async function check(name, action) {
  try {const details = await action(); report.checks.push({name,pass:true,...(details===undefined?{}:{details})});}
  catch(error){let browserState=null;try{if(diagnosticPage&&!diagnosticPage.isClosed())browserState=await diagnosticPage.evaluate(interactionStateInPage);}catch(diagnosticError){browserState={error:diagnosticError.message};}report.checks.push({name,pass:false,error:error.stack,browserState});report.errors.push({name,message:error.message});}
  save();
}
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
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
function fullOverflowInPage(){
  const viewport=innerWidth;
  const label=el=>({tag:el.tagName,id:el.id,class:typeof el.className==='string'?el.className:'',text:el.childElementCount?null:el.textContent.trim().slice(0,48)});
  const nodes=[document.documentElement,...document.querySelectorAll('body,body *')].filter(el=>!el.closest('script,style,noscript,#tront-theme-editor'));
  const rows=[];
  for(const el of nodes){
    const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(cs.display==='none'||!el.getClientRects().length)continue;
    const ancestors=[];for(let a=el.parentElement;a;a=a.parentElement){const ac=getComputedStyle(a);if(ac.overflowX!=='visible'||ac.overflowY!=='visible')ancestors.push({...label(a),overflowX:ac.overflowX,overflowY:ac.overflowY,x:a.getBoundingClientRect().x,right:a.getBoundingClientRect().right});}
    const row={...label(el),category:el.closest('#particle-container')?'decorative':el.closest('#magic-navbar-container')?'navigation':'content',x:r.x,right:r.right,y:r.y+scrollY,width:r.width,height:r.height,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,position:cs.position,left:cs.left,rightStyle:cs.right,transform:cs.transform,overflowX:cs.overflowX,overflowY:cs.overflowY,opacity:cs.opacity,visibility:cs.visibility,clippingAncestors:ancestors};
    row.outsideViewport=r.x< -1.1||r.right>viewport+1.1;row.internalOverflow=el.scrollWidth>el.clientWidth+1;
    if(row.outsideViewport||row.internalOverflow||el.id==='particle-container'||el.classList.contains('particle'))rows.push(row);
  }
  return {viewport,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,scrollX,rows};
}
function snapshotInPage() {
  const selectors='body,header,main,footer,section,h1,h2,h3,p,ul,li,.content-container,.video-grid-container,.video-grid,.video-container,.slide-image-container,img,video,iframe,.cta-button';
  const props=['color','backgroundColor','backgroundImage','backgroundSize','backgroundPosition','transform','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopColor','borderRadius','display','gap','gridTemplateColumns','flexDirection','textShadow','boxShadow'];
  const nodes=[...document.querySelectorAll(selectors)].filter(el=>!el.closest('#magic-navbar-container,#tront-theme-editor,#particle-container'));
  const one=(el,pseudo)=>{const cs=getComputedStyle(el,pseudo),rect=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,class:el.className,pseudo:pseudo||null,rect:{x:rect.x,y:rect.y+scrollY,width:rect.width,height:rect.height},styles:Object.fromEntries(props.map(prop=>[prop,cs[prop]]))};};
  return {width:innerWidth,height:document.documentElement.scrollHeight,nodes:nodes.map(el=>one(el)),pseudo:[one(document.body,'::before'),one(document.body,'::after'),one(document.querySelector('header'),'::after')]};
}
function compareSnapshots(base,current,{geometryOnly=false}={}) {
  const failures=[];
  if(base.nodes.length!==current.nodes.length)failures.push(`node count ${base.nodes.length} -> ${current.nodes.length}`);
  const geometryProps=['transform','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','margin','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderRadius','display','gap','gridTemplateColumns','flexDirection'];
  for(let i=0;i<Math.min(base.nodes.length,current.nodes.length);i++){
    const a=base.nodes[i],b=current.nodes[i],label=`${i}:${a.tag}.${a.class}`;
    for(const key of ['x','y','width','height'])if(Math.abs(a.rect[key]-b.rect[key])>1.1)failures.push(`${label} ${key}: ${a.rect[key]} -> ${b.rect[key]}`);
    for(const key of geometryOnly?geometryProps:Object.keys(a.styles))if(a.styles[key]!==b.styles[key])failures.push(`${label} ${key}: ${a.styles[key]} -> ${b.styles[key]}`);
  }
  if(!geometryOnly)for(let i=0;i<base.pseudo.length;i++)for(const key of Object.keys(base.pseudo[i].styles))if(base.pseudo[i].styles[key]!==current.pseudo[i].styles[key])failures.push(`pseudo ${i} ${key}: ${base.pseudo[i].styles[key]} -> ${current.pseudo[i].styles[key]}`);
  return failures;
}
function contrastAuditInPage() {
  const E=window.TrontThemeEditor, T=window.Tront;
  const state=JSON.parse(localStorage.getItem(E.key));
  if(!state)throw Error('Custom audit requires stored custom state');
  const tokens=E.buildTokens(state), dark=state.mode==='dark', bound=tokens.bound;
  const color=value=>{if(value==='transparent')return [0,0,0,0];const m=/^rgba?\(([^)]+)\)$/.exec(value.trim());if(!m)throw Error('Unsupported computed color '+value);const n=m[1].split(/[\s,/]+/).map(Number);return [n[0],n[1],n[2],n.length>3?n[3]:1];};
  const envelope=rgb=>({min:rgb.slice(0,3),max:rgb.slice(0,3)});
  const union=values=>({min:[0,1,2].map(i=>Math.min(...values.map(v=>v.min[i]))),max:[0,1,2].map(i=>Math.max(...values.map(v=>v.max[i])))});
  const composite=(under,over,opacity=1)=>{const a=over[3]*opacity;return {min:under.min.map((v,i)=>v*(1-a)+over[i]*a),max:under.max.map((v,i)=>v*(1-a)+over[i]*a)};};
  const splitLayers=value=>{let depth=0,start=0,parts=[];for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&depth===0){parts.push(value.slice(start,i));start=i+1;}}parts.push(value.slice(start));return parts;};
  function paint(under,cs,opacity=1){
    let result=composite(under,color(cs.backgroundColor),opacity);
    if(cs.backgroundImage==='none')return result;
    for(const layer of splitLayers(cs.backgroundImage).reverse()){
      if(!/gradient\(/.test(layer))throw Error('Unsupported background image '+layer);
      const stops=[...layer.matchAll(/rgba?\([^)]+\)|\btransparent\b/g)].map(m=>color(m[0]));
      if(!stops.length)throw Error('No auditable gradient stops '+layer);
      result=union(stops.map(stop=>composite(result,stop,opacity)));
    }
    return result;
  }
  const cache=new Map();
  function grounds(el){
    if(cache.has(el))return cache.get(el);
    let under=el.parentElement?grounds(el.parentElement):envelope(tokens.grounds.base);
    const cs=getComputedStyle(el); let result=paint(under,cs);
    for(const shadow of splitLayers(cs.boxShadow||'none'))if(/\binset\b/.test(shadow)){const value=shadow.match(/rgba?\([^)]+\)/);if(value)result=union([result,composite(result,color(value[0]))]);}
    // Painted non-text pseudos are conservatively included in either stacking order.
    for(const pseudo of ['::before','::after']){const ps=getComputedStyle(el,pseudo);if(ps.content!=='none'&&ps.content!=='normal'&&ps.display!=='none'&&Number(ps.opacity)>0)result=union([result,paint(result,ps,Number(ps.opacity))]);}
    cache.set(el,result);return result;
  }
  const failures=[],surfaces=[],texts=[];
  const exclude='#particle-container,.particle,.emoji-icon,.feature-emoji,.logo-image,video,source,iframe,script,style,noscript,.te-preview,[type="color"]';
  for(const el of document.querySelectorAll('body *')){
    if(el.closest(exclude))continue;
    const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||!el.getClientRects().length)continue;
    const ownText=[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
    if(!ownText)continue;
    const label=`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\s+/).join('.'):''} ${el.textContent.trim().slice(0,48)}`;
    const fg=color(cs.color), g=grounds(el), ratio=E.contrast(fg.slice(0,3),bound);
    texts.push({label,color:cs.color,ratio});
    if(ratio<4.5-.001)failures.push({type:'foreground',label,ratio,color:cs.color,bound});
    if(fg[3]<.999||Number(cs.opacity)<.999)failures.push({type:'text-opacity',label,color:cs.color,opacity:cs.opacity});
    const bad=[0,1,2].some(i=>dark?g.max[i]>bound[i]+1.1:g.min[i]<bound[i]-1.1);
    surfaces.push({label,...g}); if(bad)failures.push({type:'surface-bound',label,...g,bound});
  }
  return {preset:state.preset,mode:state.mode,bound,textCount:texts.length,texts,surfaces,failures};
}
async function main(){
  if(!process.env.CI)throw Error('Browser QA is CI-only. Local Chrome is known to fail EPERM; no launch or retry was attempted.');
  const source=sourceCheck(options);fs.writeFileSync(path.join(options.output,'source.json'),JSON.stringify(source.report,null,2)+'\n');
  assert.equal(source.report.pass,true,'Source/media protection must pass before browser tests: '+source.report.errors.join('; '));
  const {chromium}=require('playwright');
  const servers=[];let browser;
  try{
    const current=await startServer({root:options.root,onRequest:r=>report.network.push({server:'current',...r})});servers.push(current);
    const baseline=await startServer({root:options.baselineRoot||options.root,overrides:{'index.htm':source.original},onRequest:r=>report.network.push({server:'baseline',...r})});servers.push(baseline);
    const executablePath=process.env.THEME_BROWSER_EXECUTABLE;
    if(!executablePath)throw Error('THEME_BROWSER_EXECUTABLE must point to CI Google Chrome with MP4 support');
    browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
    const externalCache=new Map();
    async function contextFor(origin,width,{reducedMotion='no-preference',seed=true}={}){
      const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,reducedMotion,serviceWorkers:'block'});
      if(seed)await context.addInitScript(()=>{if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem('tront-theme','sentinel-legacy');localStorage.setItem('tront-theme-gallery-v1','sentinel-gallery');localStorage.setItem('tront-previews-paused','sentinel-paused');sessionStorage.setItem('qa-seeded','1');}});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin===origin){await route.continue();return;}
        if(url.hostname==='monke.tront.xyz'&&/^\/(video[12]\.mp4|monke_slide\.jpg)$/.test(url.pathname)){
          const response=await route.fetch({url:origin+url.pathname,timeout:60000});await route.fulfill({response});return;
        }
        if(/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)&&url.pathname.startsWith('/embed/')){
          await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#111;color:#bbb;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>QA: YouTube playback unverified (provider frame mocked)</p><script>window.__qaInnerClicks=0;window.__qaInnerPointerEvents=[];for(const type of ["pointerdown","pointerup","click"])document.addEventListener(type,e=>{if(e.type==="click")window.__qaInnerClicks++;window.__qaInnerPointerEvents.push({type:e.type,x:e.clientX,y:e.clientY,time:performance.now()});parent.postMessage({__themeQA:"iframe-pointer",type:e.type,clientX:e.clientX,clientY:e.clientY},"*");},true);</script></body></html>'});return;
        }
        const allowed=((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font')||(['tront.xyz','blog.tront.xyz','hackerpunk.s3.amazonaws.com'].includes(url.hostname)&&request.resourceType()==='image')||(url.hostname==='tront.xyz'&&url.pathname==='/favicon.png'&&request.resourceType()==='other'));
        if(!allowed){report.warnings.push({type:'blocked-external-request',url:request.url(),resourceType:request.resourceType()});await route.abort('blockedbyclient');return;}
        if(!externalCache.has(request.url()))externalCache.set(request.url(),(async()=>{try{const response=await route.fetch({timeout:20000});if(!response.ok())throw Error('HTTP '+response.status());return {status:response.status(),headers:response.headers(),body:await response.body()};}catch(error){report.warnings.push({type:'external-asset-unavailable',url:request.url(),message:error.message});return null;}})());
        const cached=await externalCache.get(request.url());if(cached)await route.fulfill(cached);else await route.abort('failed');
      });
      return context;
    }
    async function load(context,origin){
      const page=await context.newPage();page.on('pageerror',error=>{report.errors.push({name:'uncaught page error',message:error.stack});save();});
      page.on('console',message=>{if(message.type()==='error')report.warnings.push({type:'console-error',text:message.text()});});
      page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)report.errors.push({name:'local HTTP failure',url:response.url(),status:response.status()});});
      await page.goto(origin+'/',{waitUntil:'load',timeout:60000});
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>getComputedStyle(document.body).visibility==='visible'&&Number(getComputedStyle(document.body).opacity)>.99);
      if(options.project==='monke')await page.waitForFunction(()=>[...document.querySelectorAll('video')].every(v=>v.readyState>=1),{},{timeout:45000});
      await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}html{scroll-behavior:auto!important}'});
      await page.evaluate(()=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=0;}));
      await page.evaluate(instrumentInteractionsInPage);
      return page;
    }
    async function shot(page,name,position='top'){
      await page.evaluate(position=>scrollTo(0,position==='footer'?document.documentElement.scrollHeight:position==='mid'?document.documentElement.scrollHeight/2:0),position);await page.waitForTimeout(60);
      const file=name+'.png';await page.screenshot({path:path.join(options.output,file)});report.screenshots.push({file,position});
    }
    async function open(page){
      if(!await page.locator('#tront-theme-editor').evaluate(el=>el.open)){
        await page.waitForFunction(()=>document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='false'&&document.querySelector('#tront-theme-btn').getAttribute('aria-busy')!=='true',null,{timeout:5000});
        await page.locator('#tront-theme-btn').click();
      }
      await page.waitForFunction(()=>document.querySelector('#tront-theme-editor').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='true'&&document.querySelector('#tront-theme-btn').getAttribute('aria-busy')!=='true',null,{timeout:5000});
    }
    async function waitClosed(page,previousCount=null){
      await page.waitForFunction(previousCount=>!document.querySelector('#tront-theme-editor').open&&document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')==='false'&&document.querySelector('#tront-theme-btn').getAttribute('aria-busy')!=='true'&&document.activeElement===document.querySelector('#tront-theme-btn')&&(previousCount===null||(window.__qaCloseEvents||0)>previousCount),previousCount,{timeout:5000});
    }
    async function close(page){
      await page.evaluate(instrumentInteractionsInPage);
      if(await page.locator('#tront-theme-editor').evaluate(el=>el.open)){
        const count=await page.evaluate(()=>window.__qaCloseEvents||0);await page.locator('[data-action="close"]').click();await waitClosed(page,count);
      }else await waitClosed(page);
    }
    async function choose(page,preset){await open(page);await page.selectOption('[name="preset"]',preset);await close(page);await page.waitForTimeout(25);}
    async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem(TrontThemeEditor.key)));}
    async function clickRenderedFrame(page,label){
      const target=page.frameLocator('iframe').locator('p');
      const result={label,synchronization:'explicit target scroll; two parent and child requestAnimationFrame ticks; rendered target screenshot',snapshots:[],clickAttempts:0,providerPlayback:'unverified; inert controlled cross-origin frame'};
      async function capture(stage){
        const child=await target.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},readyState:document.readyState,visibility:document.visibilityState,pointerEvents:getComputedStyle(el).pointerEvents,hit:hit?{tag:hit.tagName,id:hit.id}:null,clicks:window.__qaInnerClicks||0,events:window.__qaInnerPointerEvents||[]};});
        const parent=await page.evaluate(child=>{const iframe=document.querySelector('iframe'),r=iframe.getBoundingClientRect(),point={x:r.x+iframe.clientLeft+child.rect.x+child.rect.width/2,y:r.y+iframe.clientTop+child.rect.y+child.rect.height/2};const hit=document.elementFromPoint(point.x,point.y),dialog=document.querySelector('#tront-theme-editor');return {time:performance.now(),scroll:{x:scrollX,y:scrollY},iframe:{x:r.x,y:r.y,width:r.width,height:r.height,pointerEvents:getComputedStyle(iframe).pointerEvents},point,hit:hit?{tag:hit.tagName,id:hit.id}:null,modal:dialog.matches(':modal'),expanded:document.querySelector('#tront-theme-btn').getAttribute('aria-expanded')};},child);
        result.snapshots.push({stage,parent,child});return {parent,child};
      }
      try{
        await capture('before-scroll');await page.locator('iframe').scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();await capture('after-scroll-before-paint');
        const ticks=await Promise.all([
          page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b]))))),
          target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b])))))
        ]);result.animationFrameTicks={parent:ticks[0],child:ticks[1]};
        const file=`punk-iframe-${label}-rendered.png`;await target.screenshot({path:path.join(options.output,file)});report.screenshots.push({file,position:'controlled iframe render barrier'});
        const ready=await capture('after-render-before-first-click');assert.equal(ready.parent.modal,false);assert.equal(ready.parent.iframe.pointerEvents,'auto');assert.equal(ready.child.readyState,'complete');
        const oldParentClicks=await page.evaluate(()=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').length);
        result.clickAttempts++;await target.click({timeout:5000});
        result.afterClick=await capture('after-first-normal-click');
        assert.equal(result.afterClick.child.clicks,ready.child.clicks+1,'first normal click must reach the controlled child document: '+label);
        await page.waitForFunction(before=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').length>before,oldParentClicks,{timeout:5000});
        result.parentFrameClick=await page.evaluate(()=>(window.__qaInteractionTrace||[]).filter(event=>event.event==='iframe-click').at(-1));assert.equal(result.parentFrameClick.modal,false);
        return result;
      }catch(error){result.error=error.message;result.state=await page.evaluate(interactionStateInPage);throw error;}
      finally{(report.frameReadiness||=[]).push(result);save();}
    }

    async function audit(page,label){const result=await page.evaluate(contrastAuditInPage);report.audits.push({label,...result});assert.deepEqual(result.failures,[],`${label}: ${JSON.stringify(result.failures.slice(0,12))}`);return {textCount:result.textCount,bound:result.bound};}
    async function overflow(page){return page.evaluate(()=>{
      const nav=document.querySelector('#magic-navbar-container'),rect=nav.getBoundingClientRect();
      const controls=[...nav.querySelectorAll('a,button')].map(el=>({text:el.textContent.trim().replace(/\s+/g,' '),x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth,display:getComputedStyle(el).display}));
      const outside=[...document.querySelectorAll('header,main,footer,h1,h2,h3,p,li,.video-grid-container,.video-container,.cta-button')].filter(el=>!el.closest('#tront-theme-editor')).map(el=>({tag:el.tagName,cls:el.className,x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right})).filter(r=>r.x< -1.1||r.right>innerWidth+1.1);
      return {viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,nav:{x:rect.x,right:rect.right,scroll:nav.scrollWidth,client:nav.clientWidth},controls,outside};
    });}
    for(const width of [1440,390]){
      const bc=await contextFor(baseline.origin,width),cc=await contextFor(current.origin,width);
      try{
        const b=await load(bc,baseline.origin),p=await load(cc,current.origin);
        await check(`native ${width}px matches original geometry/colors/background topology`,async()=>{
          const before=await b.evaluate(snapshotInPage),after=await p.evaluate(snapshotInPage),differences=compareSnapshots(before,after);report.nativeComparisons.push({width,before,after,differences});assert.deepEqual(differences,[]);
          assert.equal(await p.getAttribute('html','data-te-project'),'native');assert.equal(await stored(p),null);
          const originalPegs=options.project==='punk'?['#ff00ff','#00ffff','#ffff00','#00dd00']:['#ff8c32','#00ffff','#ff00ff','#e0e0e0'];
          await open(p);assert.deepEqual(await p.locator('[type=\"color\"]').evaluateAll(els=>els.map(el=>el.value)),originalPegs);await close(p);assert.equal(await p.getAttribute('html','data-te-project'),'native');assert.equal(await stored(p),null);
        });
        for(const position of ['top','mid','footer']){await shot(b,`native-baseline-${width}-${position}`,position);await shot(p,`native-current-${width}-${position}`,position);}
        await check(`native content overflow ${width}px introduces no new clipped element`,async()=>{const before=await overflow(b),after=await overflow(p);report.warnings.push({type:'native-content-overflow-comparison',width,before:before.outside,after:after.outside});assert.deepEqual(after.outside,before.outside);});
        await p.evaluate(()=>scrollTo(0,0));
        await choose(p,width===1440?'purple':'light');
        await check(`custom ${width}px retains page geometry`,async()=>{const before=await b.evaluate(snapshotInPage),after=await p.evaluate(snapshotInPage);assert.deepEqual(compareSnapshots(before,after,{geometryOnly:true}),[]);});
        for(const position of ['top','mid','footer'])await shot(p,`${width===1440?'custom':'light'}-${width}-${position}`,position);
        await open(p);await shot(p,`editor-${width}-${width===1440?'custom':'light'}`);await close(p);
      }finally{await bc.close();await cc.close();}
    }
    await check('320px baseline/current full overflow diagnostic',async()=>{
      const bc=await contextFor(baseline.origin,320),cc=await contextFor(current.origin,320);
      try{
        const b=await load(bc,baseline.origin),p=await load(cc,current.origin);
        const before=await b.evaluate(fullOverflowInPage),after=await p.evaluate(fullOverflowInPage);
        const diagnostic={width:320,before,after,documentWidthChanged:after.document-before.document,bodyWidthChanged:after.body-before.body};
        report.overflowComparisons.push(diagnostic);
        await shot(b,'native-baseline-320-overflow');await shot(p,'native-current-320-overflow');
        fs.writeFileSync(path.join(options.output,'overflow-320.json'),JSON.stringify(diagnostic,null,2)+'\n');
        return {baselineDocument:before.document,currentDocument:after.document,baselineBody:before.body,currentBody:after.body,baselineOverflowElements:before.rows.length,currentOverflowElements:after.rows.length};
      }finally{await bc.close();await cc.close();}
    });
    const context=await contextFor(current.origin,1440),page=await load(context,current.origin);diagnosticPage=page;
    await check('canonical nav visual order, five controls and exact destinations',async()=>{
      const nav=await page.locator('#magic-navbar-container').evaluate(el=>[...el.querySelectorAll('a,button')].map(x=>({text:x.textContent.trim().replace(/^◐\s*/,''),href:x.getAttribute('href'),x:x.getBoundingClientRect().x})).sort((a,b)=>a.x-b.x));
      assert.deepEqual(nav.map(x=>x.text),['Home','Games','Blog','Discord','Theme']);assert.deepEqual(nav.slice(0,4).map(x=>x.href),['https://tront.xyz/','https://tront.xyz/games/','https://tront.xyz/blog/','https://tront.xyz/discord/']);return nav;
    });
    await check('six presets and four always-visible peg rows',async()=>{
      await open(page);assert.deepEqual(await page.evaluate(()=>TrontThemeEditor.presets.map(p=>p.id)),['dark','cyan','purple','ember','moss','light']);
      assert.equal(await page.locator('[data-peg-row]').count(),4);assert.equal(await page.locator('[name="count"]').count(),0);
      for(let i=0;i<4;i++){assert.equal(await page.locator(`[name="color-${i}"]`).isVisible(),true);assert.equal(await page.locator(`[name="position-${i}"]`).isVisible(),true);}await close(page);
    });
    for(const preset of ['dark','cyan','purple','ember','moss','light']){
      await check(`palette ${preset} renders bounded page text and surfaces`,async()=>{await choose(page,preset);assert.equal(await page.getAttribute('html','data-te-project'),'custom');assert.equal((await stored(page)).preset,preset);return audit(page,preset);});
      await check(`palette ${preset} editor foregrounds and surfaces are bounded`,async()=>{await open(page);try{return await audit(page,preset+'-editor');}finally{await close(page);}});
    }
    for(const mode of ['dark','light'])await check(`four edited pegs and ${mode} mode remain readable`,async()=>{
      await open(page);await page.locator(`[name="mode"][value="${mode}"]`).check();
      for(let i=0;i<4;i++)await page.locator(`[name="color-${i}"]`).evaluate((el,color)=>{el.value=color;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},['#000000','#ffffff','#ff00ff','#00ff00'][i]);
      const state=await stored(page);assert.equal(state.pegs.length,4);assert.equal(state.preset,'custom');assert.deepEqual(state.pegs.map(p=>p.color),['#000000','#ffffff','#ff00ff','#00ff00']);await close(page);return audit(page,`custom-${mode}`);
    });
    await check('editor keyboard range input, appropriate focus behavior, Escape and reopening',async()=>{
      await open(page);assert.equal(await page.locator('#tront-theme-btn').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true);
      if(options.project==='punk') {
        assert.equal(await page.locator('#tront-theme-editor').evaluate(el=>el.matches(':modal')),false);
        const visited=new Set();
        for(let i=0;i<24;i++){await page.keyboard.press('Tab');const name=await page.evaluate(()=>document.activeElement.name||'');if(name)visited.add(name);}
        for(let i=0;i<4;i++){assert.ok(visited.has('color-'+i),'keyboard reaches color '+i);assert.ok(visited.has('position-'+i),'keyboard reaches position '+i);}
      } else {
        await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-action="reset"]').evaluate(el=>el===document.activeElement),true);
        await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true);
        for(let i=0;i<32;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#tront-theme-editor')),true);}
      }
      const range=page.locator('[name="position-1"]');await range.focus();const value=Number(await range.inputValue());await page.keyboard.press('ArrowRight');assert.equal(Number(await range.inputValue()),value+1);
      const escapeCloseCount=await page.evaluate(()=>window.__qaCloseEvents||0);await page.keyboard.press('Escape');await waitClosed(page,escapeCloseCount);assert.equal(await page.locator('#tront-theme-editor').evaluate(el=>el.open),false);assert.equal(await page.locator('#tront-theme-btn').evaluate(el=>el===document.activeElement),true);
      for(let i=0;i<3;i++){await open(page);await close(page);}assert.equal(await page.locator('#tront-theme-btn').getAttribute('aria-expanded'),'false');
    });
    if(options.project==='punk')await check('busy opening and closing absorb repeated activation before the first available control',async()=>{
      const fresh=await contextFor(current.origin,1440);let p;
      try {
        p=await load(fresh,current.origin);
        await p.evaluate(()=>{scrollTo({top:document.querySelector('iframe').getBoundingClientRect().top+scrollY-84,behavior:'instant'});window.__phaseClicks=[];document.addEventListener('click',e=>{if(e.target.closest('#tront-theme-btn,[data-action="close"]'))window.__phaseClicks.push({target:e.target.closest('[data-action]')?.dataset.action||'opener',phase:document.querySelector('dialog').getAttribute('data-te-phase'),inert:document.querySelector('dialog').inert,busy:document.querySelector('#tront-theme-btn').getAttribute('aria-busy')});});});
        const child=p.frameLocator('iframe').locator('body');const clicks=await child.evaluate(()=>window.__qaInnerClicks||0);
        await p.locator('#tront-theme-btn').dblclick({delay:0});await open(p);
        const opening=await p.evaluate(()=>window.__phaseClicks);assert.ok(opening.filter(x=>x.target==='opener'&&x.phase==='opening'&&x.inert&&x.busy==='true').length>=2,'both repeated opener clicks occur during real busy UI');
        assert.equal(await child.evaluate(()=>window.__qaInnerClicks||0),clicks);
        const openingMs=await p.locator('dialog').getAttribute('data-te-transition-ms');
        await p.selectOption('[name="preset"]','cyan');
        await p.locator('[data-action="reset"]').click();assert.equal(await stored(p),null);
        const count=await p.evaluate(()=>window.__qaCloseEvents||0);
        await p.locator('[data-action="close"]').dblclick({delay:0});await waitClosed(p,count);
        assert.equal(await child.evaluate(()=>window.__qaInnerClicks||0),clicks,'repeat Close cannot activate the underlying player');
        const closingMs=await p.locator('dialog').getAttribute('data-te-transition-ms');
        return {opening,openingMs:Number(openingMs),closingMs:Number(closingMs),singleFirstAvailableReset:true};
      }finally{await fresh.close();}
    });
    await check('rapid same-task close/reopen ignores stale native close events',async()=>{
      for(const method of ['button','native']){
        await open(page);const closeEvents=await page.evaluate(()=>window.__qaCloseEvents||0);
        await page.evaluate(method=>{const dialog=document.querySelector('#tront-theme-editor');if(method==='button')dialog.querySelector('[data-action="close"]').click();else dialog.close();document.querySelector('#tront-theme-btn').click();},method);
        await page.waitForFunction(count=>(window.__qaCloseEvents||0)>count&&document.querySelector('#tront-theme-btn').getAttribute('aria-busy')!=='true',closeEvents,{timeout:5000});
        const state=await page.evaluate(interactionStateInPage);report.interactions.push({test:'rapid-close-reopen',method,state});
        assert.equal(state.dialogOpen,true);assert.equal(state.expanded,'true');assert.equal(state.active.action,'close');
        await close(page);
      }
    });
    await check('queued native close preserves later deliberate nav focus',async()=>{
      await open(page);const events=await page.evaluate(()=>window.__qaCloseEvents||0);
      await page.evaluate(()=>{document.querySelector('#tront-theme-editor').close();document.querySelector('#magic-navbar-container a').focus();});
      await page.waitForFunction(events=>(window.__qaCloseEvents||0)>events,events,{timeout:5000});
      const state=await page.evaluate(interactionStateInPage);report.interactions.push({test:'native-close-later-nav-focus',state});
      assert.equal(state.dialogOpen,false);assert.equal(state.expanded,'false');
      assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#magic-navbar-container a')),true,'queued close must not steal a deliberate later focus');
    });
    await check('isolated fresh-context Reset and Undo keep exact native/custom state',async()=>{
      const fresh=await contextFor(current.origin,1440);let p,initialResetFailed=false;
      try{
        p=await load(fresh,current.origin);await choose(p,'cyan');const before=await stored(p);await open(p);
        report.interactions.push({test:'isolated-reset-preclick-hit-test',geometry:await p.evaluate(resetHitTestInPage)});
        await p.locator('[data-action="reset"]').click();const reset=await p.evaluate(interactionStateInPage);report.interactions.push({test:'isolated-first-reset',state:reset,geometry:await p.evaluate(resetHitTestInPage)});
        initialResetFailed=reset.project!=='native'||(await stored(p))!==null;assert.equal(reset.project,'native');assert.equal(await stored(p),null);
        await p.locator('[data-action="undo"]').click();assert.deepEqual(await stored(p),before);assert.equal(await p.getAttribute('html','data-te-project'),'custom');await close(p);
      }catch(error){if(p&&!p.isClosed()){report.interactions.push({test:'isolated-reset-failure-hit-test',geometry:await p.evaluate(resetHitTestInPage),state:await p.evaluate(interactionStateInPage)});await p.screenshot({path:path.join(options.output,'isolated-reset-failure.png')});report.screenshots.push({file:'isolated-reset-failure.png',position:'failure'});}
        report.interactions.push({test:'isolated-reset-original-assertion-failure',error:error.message,strictFailureRetained:true});save();
        throw error;}finally{if(p&&!p.isClosed())report.interactions.push({test:'isolated-reset-final',state:await p.evaluate(interactionStateInPage)});await fresh.close();}
    });
    if(options.project==='punk')await check('fresh pre-modal controlled iframe accepts its first rendered normal click',async()=>{
      const fresh=await contextFor(current.origin,1440);
      try{const p=await load(fresh,current.origin);return await clickRenderedFrame(p,'pre-modal-baseline');}
      finally{await fresh.close();}
    });
    if(options.project==='punk')for(const width of [1440,390,320])for(const start of ['top','video'])await check(`Punk flow editor ${width}px from ${start} preserves player and reading position`,async()=>{
      const fresh=await contextFor(current.origin,width);let p;const observations=[];
      try{
        p=await load(fresh,current.origin);await p.setViewportSize({width,height:width<600?450:900});
        await choose(p,'cyan');const custom=await stored(p);
        const iframe=p.locator('iframe');const node=await iframe.elementHandle();
        const attrs=await iframe.evaluate(el=>[...el.attributes].map(a=>[a.name,a.value]));
        const child=p.frameLocator('iframe').locator('body');const identity=await child.evaluate(()=>({origin:performance.timeOrigin,token:window.__flowIdentity=crypto.randomUUID()}));
        for(const dismissal of ['Close','Escape']) {
          await p.evaluate(start=>{const frame=document.querySelector('iframe');scrollTo({top:start==='video'?frame.getBoundingClientRect().top+scrollY-84:0,behavior:'instant'});},start);
          const before=await p.evaluate(resetHitTestInPage);await open(p);
          const geometry=await p.evaluate(resetHitTestInPage);observations.push({dismissal,before,opened:geometry});
          assert.equal(geometry.dialog.modal,false);assert.equal(geometry.dialog.style.position,'relative');
          assert.ok(geometry.dialog.rect.bottom<geometry.iframes[0].rect.y,'entire editor precedes player');
          assert.equal(geometry.iframes[0].style.pointerEvents,'auto');assert.equal(geometry.scroll.y,0);
          await p.locator('[data-action="reset"]').click();assert.equal(await stored(p),null);assert.equal(await p.getAttribute('html','data-te-project'),'native');
          await p.locator('[data-action="undo"]').click();assert.deepEqual(await stored(p),custom);
          await p.locator('[data-action="close"]').focus();const visited=new Set();
          for(let i=0;i<24;i++){await p.keyboard.press('Tab');const name=await p.evaluate(()=>document.activeElement.name||'');if(name)visited.add(name);}
          for(let i=0;i<4;i++){assert.ok(visited.has('color-'+i));assert.ok(visited.has('position-'+i));}
          await p.locator('[name="frost"]').focus();
          assert.equal(await p.locator('[name="frost"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,'short viewport scrolls final slider into view');
          const file=`flow-editor-${width}-${start}-${dismissal.toLowerCase()}.png`;
          await p.screenshot({path:path.join(options.output,file)});report.screenshots.push({file,position:'scrolled keyboard editor'});
          if(dismissal==='Escape'){const events=await p.evaluate(()=>window.__qaCloseEvents||0);await p.keyboard.press('Escape');await waitClosed(p,events);}else await close(p);
          const restored=await p.evaluate(()=>scrollY);assert.ok(Math.abs(restored-before.scroll.y)<1,'reading position restored');
          assert.equal(await node.evaluate(el=>el===document.querySelector('iframe')&&el.isConnected),true);
          assert.deepEqual(await iframe.evaluate(el=>[...el.attributes].map(a=>[a.name,a.value])),attrs);
          assert.deepEqual(await child.evaluate(()=>({origin:performance.timeOrigin,token:window.__flowIdentity})),identity,'player document was not reloaded');
          await clickRenderedFrame(p,`flow-${width}-${start}-${dismissal}`);
        }
        return {observations,iframeNodeSourceAndDocument:'unchanged',providerPlayback:'unverified; controlled cross-origin frame'};
      }catch(error){if(p&&!p.isClosed()){report.interactions.push({test:'flow-editor-failure',width,start,observations,state:await p.evaluate(interactionStateInPage)});await p.screenshot({path:path.join(options.output,`flow-failure-${width}-${start}.png`)});}throw error;}
      finally{await fresh.close();}
    });
    if(options.project==='punk')await check('diagnostic control: rendered modal first Reset/Undo and closed-frame input',async()=>{
      const fresh=await contextFor(current.origin,1440);let p;
      const control={test:'rendered-modal-diagnostic-control',doesNotChangeImmediateFailures:true,resetClickAttempts:0,undoClickAttempts:0,phase:'fresh context'};
      try{
        p=await load(fresh,current.origin);await choose(p,'cyan');const before=await stored(p);await open(p);
        control.phase='modal before paint barrier';control.beforePaint=await p.evaluate(resetHitTestInPage);
        control.animationFrameTicks={parent:await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(a=>requestAnimationFrame(b=>resolve([a,b])))))};
        const file='punk-rendered-modal-control-before-reset.png';await p.locator('#tront-theme-editor').screenshot({path:path.join(options.output,file)});report.screenshots.push({file,position:'rendered modal diagnostic barrier'});
        control.afterPaint=await p.evaluate(resetHitTestInPage);assert.equal(control.afterPaint.dialog.modal,false);assert.equal(control.afterPaint.iframes[0].style.pointerEvents,'auto');assert.ok(control.afterPaint.dialog.rect.bottom<control.afterPaint.iframes[0].rect.y);
        control.phase='first normal Reset';control.resetClickAttempts++;await p.locator('[data-action="reset"]').click();
        control.afterReset={state:await p.evaluate(interactionStateInPage),geometry:await p.evaluate(resetHitTestInPage)};
        assert.equal(await p.getAttribute('html','data-te-project'),'native');assert.equal(await stored(p),null);
        control.phase='first normal Undo';control.undoClickAttempts++;await p.locator('[data-action="undo"]').click();
        assert.deepEqual(await stored(p),before);assert.equal(await p.getAttribute('html','data-te-project'),'custom');
        control.afterUndo=await p.evaluate(interactionStateInPage);await close(p);
        control.phase='first closed-frame click after existing rendered-frame barrier';control.closedFrame=await clickRenderedFrame(p,'rendered-modal-control-after-close');
        control.phase='passed';control.providerPlayback='unverified; controlled cross-origin placeholder only';
        return control;
      }catch(error){control.error=error.message;if(p&&!p.isClosed()){control.failure={state:await p.evaluate(interactionStateInPage),geometry:await p.evaluate(resetHitTestInPage)};await p.screenshot({path:path.join(options.output,'punk-rendered-modal-control-failure.png')});}throw error;}
      finally{report.interactions.push(control);save();await fresh.close();}
    });
    await check('Reset returns native exactly; Undo restores prior custom state; reset persistence clears only own key',async()=>{
      await page.evaluate(()=>{window.__qaInteractionTrace=[];});await choose(page,'cyan');const before=await stored(page);await open(page);report.interactions.push({test:'sequence-reset-before-click',state:await page.evaluate(interactionStateInPage)});await page.locator('[data-action="reset"]').click();report.interactions.push({test:'sequence-first-reset-after-click',state:await page.evaluate(interactionStateInPage)});assert.equal(await page.getAttribute('html','data-te-project'),'native');assert.equal(await stored(page),null);
      await page.locator('[data-action="undo"]').click();assert.deepEqual(await stored(page),before);assert.equal(await page.getAttribute('html','data-te-project'),'custom');
      await close(page);await page.reload({waitUntil:'load'});assert.deepEqual(await stored(page),before);assert.equal(await page.getAttribute('html','data-te-project'),'custom');
      await open(page);await page.locator('[data-action="reset"]').click();await close(page);await page.reload({waitUntil:'load'});assert.equal(await stored(page),null);assert.equal(await page.getAttribute('html','data-te-project'),'native');
      assert.deepEqual(await page.evaluate(()=>['tront-theme','tront-theme-gallery-v1','tront-previews-paused'].map(k=>localStorage.getItem(k))),['sentinel-legacy','sentinel-gallery','sentinel-paused']);
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(700);await page.addStyleTag({content:'*,*::before,*::after{transition:none!important}html{scroll-behavior:auto!important}'});
      await page.evaluate(()=>document.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=0;}));
      const baselineContext=await contextFor(baseline.origin,1440);try{const b=await load(baselineContext,baseline.origin);assert.deepEqual(compareSnapshots(await b.evaluate(snapshotInPage),await page.evaluate(snapshotInPage)),[]);}finally{await baselineContext.close();}
    });
    await check('ColorMagic retains four peg positions and native option returns original',async()=>{await open(page);const positions=await page.locator('[name^="position-"]').evaluateAll(els=>els.map(el=>el.value));await page.locator('[data-action="magic"]').click();assert.equal((await stored(page)).pegs.length,4);assert.deepEqual((await stored(page)).pegs.map(p=>String(p.position)),positions);await page.selectOption('[name="preset"]','project-original');assert.equal(await stored(page),null);await close(page);});
    await check('CTA still scrolls to the original features anchor',async()=>{await page.evaluate(()=>scrollTo(0,0));await page.locator('header .cta-button').click();await page.waitForTimeout(250);assert.equal(new URL(page.url()).hash,'#features');assert.ok(await page.evaluate(()=>scrollY>0&&document.querySelector('#features').getBoundingClientRect().top<innerHeight));await page.evaluate(()=>{history.replaceState(null,'',location.pathname);scrollTo(0,0);});});
    for(const width of [320,360,390,768,1440])for(const preset of ['project-original','light','cyan'])await check(`no page or nav overflow ${width}px ${preset}`,async()=>{
      await page.setViewportSize({width,height:900});await choose(page,preset);await page.evaluate(()=>scrollTo(0,0));const data=await overflow(page);
      if(data.document>width+1)report.overflowComparisons.push({width,preset,current:await page.evaluate(fullOverflowInPage)});
      assert.ok(data.document<=width+1,JSON.stringify(data));assert.ok(data.nav.x>=-1&&data.nav.right<=width+1&&data.nav.scroll<=data.nav.client+1,JSON.stringify(data));
      for(const control of data.controls)assert.ok(control.display!=='none'&&control.x>=-1&&control.right<=width+1&&control.scroll<=control.client+1,JSON.stringify(control));
      const sorted=data.controls.slice().sort((a,b)=>a.x-b.x);for(let i=1;i<sorted.length;i++)assert.ok(sorted[i].x>=sorted[i-1].right-1,'overlapping nav controls');
      await open(page);const modal=await page.locator('#tront-theme-editor').evaluate(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(modal.x>=-1&&modal.right<=width+1&&modal.scroll<=modal.client+1,JSON.stringify(modal));await close(page);return data;
    });
    if(options.project==='monke')await check('both original MP4s actually play, pause, and seek in Chrome',async()=>{
      await page.setViewportSize({width:1440,height:900});await choose(page,'project-original');
      for(let i=0;i<2;i++){
        const video=page.locator('video').nth(i);await video.scrollIntoViewIfNeeded();await video.evaluate(v=>{v.muted=true;v.loop=false;return v.play();});
        await page.waitForFunction(i=>document.querySelectorAll('video')[i].currentTime>.1,i,{timeout:20000});
        await video.evaluate(v=>v.pause());const stopped=await video.evaluate(v=>v.currentTime);await pause(250);assert.ok(Math.abs((await video.evaluate(v=>v.currentTime))-stopped)<.08);
        const details=await video.evaluate(async v=>{const target=Math.min(v.duration*.5,Math.max(.5,v.duration-.5));await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('seek timeout')),10000);v.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});v.currentTime=target;});return {src:v.querySelector('source').getAttribute('src'),duration:v.duration,currentTime:v.currentTime,target,paused:v.paused,width:v.videoWidth,height:v.videoHeight,readyState:v.readyState};});
        assert.ok(details.width>0&&details.height>0&&details.duration>0);assert.ok(Math.abs(details.currentTime-details.target)<.3);assert.equal(details.paused,true);report.media.push(details);
      }
      assert.ok(report.network.some(r=>/\.mp4$/.test(r.path)&&r.status===206),'Video requests exercised safe Range responses');
    });
    await context.close();
    const reduced=await contextFor(current.origin,390,{reducedMotion:'reduce'});
    try{const p=await reduced.newPage();await p.goto(current.origin,{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);await check('reduced motion stops ambient animations and smooth scrolling',async()=>{
      const result=await p.evaluate(()=>({scroll:getComputedStyle(document.documentElement).scrollBehavior,nodes:['.particle','header','header h1'].flatMap(selector=>{const el=document.querySelector(selector);return el?[null,'::before','::after'].map(pseudo=>({selector,pseudo,animation:getComputedStyle(el,pseudo).animationName,transition:getComputedStyle(el,pseudo).transitionDuration})):[];})}));
      assert.equal(result.scroll,'auto');for(const item of result.nodes){assert.equal(item.animation,'none');assert.ok(item.transition.split(',').every(v=>parseFloat(v)===0));}return result;
    });}finally{await reduced.close();}
  }finally{if(browser)await browser.close();for(const server of servers)await server.close();}
}
main().catch(error=>{report.errors.push({name:'runner',message:error.stack});}).finally(()=>{report.finishedAt=new Date().toISOString();report.pass=report.errors.length===0;save();console.log(JSON.stringify({project:report.project,pass:report.pass,passed:report.checks.filter(c=>c.pass).length,failed:report.checks.filter(c=>!c.pass).length,errors:report.errors,output:options.output},null,2));process.exitCode=report.pass?0:1;});
