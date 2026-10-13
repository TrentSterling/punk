'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,CASE_LIMIT_MS,aggregate,summarizeLatency}=require('./native-routing.cjs');
test('separate native cohort has exactly 12 app and 6 primitive controls',()=>{
  assert.equal(PLAN.length,18);assert.equal(new Set(PLAN.map(r=>r.id)).size,18);assert.ok(Object.isFrozen(PLAN)&&PLAN.every(Object.isFrozen));
  assert.equal(PLAN.filter(r=>r.surface==='app').length,12);assert.equal(PLAN.filter(r=>r.surface==='native').length,6);
  for(let i=0;i<6;i++)assert.deepEqual(PLAN.slice(i*3,i*3+3).map(r=>r.surface),['app','native','app']);
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
});
