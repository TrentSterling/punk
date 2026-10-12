'use strict';
/* Read-only browser QA. Intentionally requires CI; do not retry sandbox Chrome. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {argumentsFor, sourceCheck} = require('./source.cjs');
const {startServer} = require('./server.cjs');
const options = argumentsFor();
fs.mkdirSync(options.output,{recursive:true});
const report = {project:options.project,startedAt:new Date().toISOString(),checks:[],errors:[],warnings:[],network:[],media:[],screenshots:[],audits:[],nativeComparisons:[],limitations:[
  'YouTube is mocked with an explicitly labelled inert frame. YouTube playback, provider availability, cookies and controls are unverified.',
  'Native colors are compared with the original page, not claimed to meet a new contrast standard.',
  'Custom contrast is a conservative computed foreground/background envelope audit, not a pixel-level antialiasing or vision certification. Decorative particles, emoji and media pixels/fallback text are excluded.',
  'External fonts/images are allowed only on known original hosts; blocked/unavailable assets are recorded and shared between baseline/current for consistent fallback.'
]};
const save = () => fs.writeFileSync(path.join(options.output,'browser.json'),JSON.stringify(report,null,2)+'\n');
async function check(name, action) {
  try {const details = await action(); report.checks.push({name,pass:true,...(details===undefined?{}:{details})});}
  catch(error){report.checks.push({name,pass:false,error:error.stack});report.errors.push({name,message:error.message});}
  save();
}
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
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
          await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#111;color:#bbb;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>QA: YouTube playback unverified (provider frame mocked)</p></body></html>'});return;
        }
        const allowed=((url.hostname==='fonts.googleapis.com'&&request.resourceType()==='stylesheet')||(url.hostname==='fonts.gstatic.com'&&request.resourceType()==='font')||(['tront.xyz','hackerpunk.s3.amazonaws.com'].includes(url.hostname)&&request.resourceType()==='image'));
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
      return page;
    }
    async function shot(page,name,position='top'){
      await page.evaluate(position=>scrollTo(0,position==='footer'?document.documentElement.scrollHeight:position==='mid'?document.documentElement.scrollHeight/2:0),position);await page.waitForTimeout(60);
      const file=name+'.png';await page.screenshot({path:path.join(options.output,file)});report.screenshots.push({file,position});
    }
    async function open(page){if(!await page.locator('#tront-theme-editor').evaluate(el=>el.open))await page.locator('#tront-theme-btn').click();}
    async function close(page){if(await page.locator('#tront-theme-editor').evaluate(el=>el.open))await page.locator('[data-action="close"]').click();}
    async function choose(page,preset){await open(page);await page.selectOption('[name="preset"]',preset);await close(page);await page.waitForTimeout(25);}
    async function stored(page){return page.evaluate(()=>JSON.parse(localStorage.getItem(TrontThemeEditor.key)));}
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
    const context=await contextFor(current.origin,1440),page=await load(context,current.origin);
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
    await check('modal, keyboard range input, focus trap, Escape and reopening',async()=>{
      await open(page);assert.equal(await page.locator('#tront-theme-btn').getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('[data-action="reset"]').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Tab');assert.equal(await page.locator('[data-action="close"]').evaluate(el=>el===document.activeElement),true);
      for(let i=0;i<32;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#tront-theme-editor')),true);}
      const range=page.locator('[name="position-1"]');await range.focus();const value=Number(await range.inputValue());await page.keyboard.press('ArrowRight');assert.equal(Number(await range.inputValue()),value+1);
      await page.keyboard.press('Escape');assert.equal(await page.locator('#tront-theme-editor').evaluate(el=>el.open),false);assert.equal(await page.locator('#tront-theme-btn').evaluate(el=>el===document.activeElement),true);
      for(let i=0;i<3;i++){await open(page);await close(page);}assert.equal(await page.locator('#tront-theme-btn').getAttribute('aria-expanded'),'false');
    });
    await check('Reset returns native exactly; Undo restores prior custom state; reset persistence clears only own key',async()=>{
      await choose(page,'cyan');const before=await stored(page);await open(page);await page.locator('[data-action="reset"]').click();assert.equal(await page.getAttribute('html','data-te-project'),'native');assert.equal(await stored(page),null);
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
