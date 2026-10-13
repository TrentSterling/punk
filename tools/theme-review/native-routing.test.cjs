'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,CASE_LIMIT_MS,aggregate,summarizeLatency,pointInRect,rectsOverlap}=require('./native-routing.cjs');
test('structural native cohort has six top and six video-scrolled real-app contexts',()=>{
  assert.equal(PLAN.length,12);assert.equal(new Set(PLAN.map(r=>r.id)).size,12);assert.ok(Object.isFrozen(PLAN)&&PLAN.every(Object.isFrozen));
  assert.equal(PLAN.filter(r=>r.surface==='app').length,12);assert.equal(PLAN.filter(r=>r.opening==='top').length,6);assert.equal(PLAN.filter(r=>r.opening==='video').length,6);
  for(let i=0;i<6;i++)assert.deepEqual(PLAN.slice(i*2,i*2+2).map(r=>r.opening),['top','video']);
});
test('non-overlap rejects even partial current-frame intersections and records stale regions',()=>{
  const prior={x:100,y:80,right:1300,bottom:750},current={x:100,y:1500,right:1300,bottom:2200},editor={x:300,y:70,right:1100,bottom:650},point={x:620,y:150};
  assert.equal(pointInRect(point,prior),true);assert.equal(pointInRect(point,current),false);assert.equal(rectsOverlap(editor,current),false);assert.equal(rectsOverlap(editor,prior),true);
  assert.equal(rectsOverlap({...editor,bottom:1501},current),true);assert.equal(rectsOverlap({...editor,bottom:1500},current),false);
});
test('partial, failed, or incomplete native samples cannot pass',()=>{
  const complete=PLAN.map(r=>({...r,pass:true,finishedAt:'done',reset:{pass:true}}));assert.equal(aggregate(complete).pass,true);
  assert.equal(aggregate(complete.slice(1)).pass,false);assert.equal(aggregate(complete.map((r,i)=>i?r:{...r,pass:false})).pass,false);
  assert.equal(aggregate(complete.map((r,i)=>i?r:{...r,finishedAt:null})).pass,false);assert.equal(aggregate(complete,[{type:'deadline'}]).pass,false);
});
test('native timing uses epoch timestamps and records child misdelivery',()=>{
  const input={events:[{frame:'parent',type:'click',target:{id:'tront-theme-btn'},epochMs:1000}],results:[{label:'reset',events:[{frame:'child',type:'pointerdown',epochMs:1049.5}]}]};
  assert.deepEqual(summarizeLatency(input,[{type:'close',target:{id:'tront-theme-editor'},epochMs:968}]),{openClickEpochMs:1000,resetDownEpochMs:1049.5,openClickToResetDownMs:49.5,resetDeliveryFrame:'child',previousCloseEpochMs:968,closeToOpenClickMs:32});
  assert.equal(summarizeLatency({events:[],results:[]}).openClickToResetDownMs,null);
});
test('bounded native critical path contains only one opener and one Reset input',()=>{
  assert.equal(HARD_LIMIT_MS,175000);assert.equal(WORK_LIMIT_MS,165000);assert.ok(CASE_LIMIT_MS<=14000);
  const source=fs.readFileSync(path.join(__dirname,'native-routing.cjs'),'utf8');
  assert.equal((source.match(/native\.clickAt\(/g)||[]).length,2);
  const critical=source.slice(source.indexOf("row.phase='native open'"),source.indexOf('row.input=await native.finish()'));
  assert.doesNotMatch(critical,/\.click\(|\.screenshot\(|frames\(|pause\(|setTimeout|force\s*:/);
  assert.match(source,/row\.afterReset\.stored!==null/);assert.match(source,/assert\.equal\(state\.stored,custom\)/);
  assert.match(source,/requireCI\(process\.env\)/);assert.match(source,/row\.oopifObserved,true/);assert.match(source,/row\.blockedNonReadRequests\|\|\[\],\[\]/);
  assert.ok(source.indexOf('await native.arm()')<source.indexOf("await open('prepare cyan open')"),'Calibration and arm precede the cyan preparation cycle');
  assert.match(critical,/row\.beforeReset\.dialog\.modal,false/);assert.match(critical,/row\.geometry\.panelOverlapsCurrentFrame,false/);assert.match(critical,/row\.geometry\.resetOverlapsPriorFrame,true/);
  assert.match(source,/assert\.deepEqual\(state\.scroll,openClosedGeometry\.scroll/);assert.match(source,/assert\.deepEqual\(identity\.attributes,row\.originalIframeAttributes\)/);assert.match(source,/assert\.equal\(identity\.sameNode,true\)/);assert.match(source,/assert\.equal\(child\.timeOrigin,row\.originalChild\.timeOrigin\)/);assert.match(source,/assert\.equal\(child\.documentToken,row\.originalChild\.documentToken\)/);assert.match(source,/row\.providerDocumentRequests,1/);
});

test("initial native page fade has a separate startup budget; interaction timeout remains strict",()=>{const source=fs.readFileSync(path.join(__dirname,"native-routing.cjs"),"utf8");assert.match(source,/opacity\)>\.99,null,\{timeout:10000\}/);assert.match(source,/setDefaultTimeout\(3000\)/);});
