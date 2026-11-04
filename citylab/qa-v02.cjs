const { chromium } = require('playwright');
const fs = require('node:fs');const path = require('node:path');
(async()=>{
const out='citylab/qa-v02';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('https://cdn.jsdelivr.net/npm/three@0.180.0/**',async route=>{const suffix=route.request().url().split('three@0.180.0/')[1],p='citylab/vendor/'+suffix.replace(/^examples\/jsm\//,'addons/');await route.fulfill({path:p,contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'}});});
await page.goto('http://127.0.0.1:8080/citylab/?capture=1',{waitUntil:'load',timeout:60000});
try{await page.waitForFunction(()=>window.citylab?.ready,null,{timeout:60000});}catch(e){fs.writeFileSync(out+'/errors.json',JSON.stringify(errors,null,2));throw e;}
const report={errors,initial:await page.evaluate(()=>citylab.stats()),audit:await page.evaluate(()=>citylab.validate()),seeds:[]};
for(const[v,n]of[[0,'street'],[1,'overview'],[2,'platforms'],[3,'foundry'],[4,'crown'],[5,'relay'],[6,'stacks'],[7,'market'],[8,'garden']]){await page.evaluate(v=>{citylab.setView(v);citylab.setHUD(true);},v);await page.waitForTimeout(650);await page.screenshot({path:out+'/'+n+'.png',timeout:90000});}
await page.evaluate(()=>{citylab.setView(1);citylab.setClay(true);});await page.waitForTimeout(500);await page.screenshot({path:out+'/greybox.png',timeout:90000});
await page.evaluate(()=>{citylab.setClay(false);citylab.setView(7);citylab.lighting(2);});await page.waitForTimeout(500);await page.screenshot({path:out+'/night.png',timeout:90000});
for(const seed of['HP-QA-1','HP-QA-2','HP-QA-99']){await page.evaluate(s=>citylab.regenerate(s),seed);report.seeds.push(await page.evaluate(()=>citylab.validate()));}
await page.evaluate(()=>{citylab.regenerate('HACKERPUNK-02');citylab.lighting(0);citylab.setView(0);citylab.setMode();});const start=await page.evaluate(()=>citylab.player.feet.toArray());await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');report.walk={start,end:await page.evaluate(()=>citylab.player.feet.toArray())};await page.keyboard.press('Digit3');report.gear=await page.evaluate(()=>citylab.player.gear);
const off=await browser.newContext({offline:true,viewport:{width:960,height:600}});const p=await off.newPage();const offErrors=[];p.on('pageerror',e=>offErrors.push(String(e)));
await p.goto('file://'+path.resolve('citylab/HACKERPUNK-Citylab-v0.2.html'),{waitUntil:'load',timeout:60000});await p.waitForFunction(()=>window.citylab?.ready,null,{timeout:60000});report.offline={errors:offErrors,version:await p.evaluate(()=>citylab.version)};
fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();if(errors.length||offErrors.length||!report.audit.ok||report.seeds.some(s=>!s.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
