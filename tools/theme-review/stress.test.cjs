'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,aggregate}=require('./stress.cjs');
test('stress plan alternates 12 independent immediate and 12 rendered cases',()=>{
  assert.equal(PLAN.length,24);assert.equal(new Set(PLAN.map(row=>row.id)).size,24);
  for(let i=0;i<12;i++)assert.deepEqual(PLAN.slice(i*2,i*2+2).map(row=>[row.mode,row.iteration]),[['immediate',i+1],['rendered',i+1]]);
  assert.ok(Object.isFrozen(PLAN));assert.ok(PLAN.every(Object.isFrozen));
});
test('aggregate cannot pass a partial sample or erase any failed immediate result',()=>{
  const full=PLAN.map(row=>({...row,finishedAt:'done',pass:true,firstResetPassed:true}));
  assert.equal(aggregate(full).pass,true);
  assert.equal(aggregate(full.slice(0,23)).pass,false);
  assert.equal(aggregate(full.map((row,i)=>i===0?{...row,pass:false}:row)).pass,false);
  assert.equal(aggregate(full,[{message:'deadline'}]).pass,false);
  assert.equal(aggregate([]).pass,false);
  assert.equal(aggregate(full.map((row,i)=>i===0?{...row,finishedAt:null}:row)).pass,false);
});
test('runtime ceilings remain below three minutes with cleanup reserve',()=>{
  assert.equal(HARD_LIMIT_MS,175000);assert.equal(WORK_LIMIT_MS,165000);assert.ok(HARD_LIMIT_MS<180000);assert.ok(HARD_LIMIT_MS-WORK_LIMIT_MS>=10000);
});
test('read-only parent/reset instrumentation stays byte-identical to approved browser runner',()=>{
  const source=fs.readFileSync(path.join(__dirname,'browser.cjs'),'utf8');
  const actual=fs.readFileSync(path.join(__dirname,'stress.cjs'),'utf8');
  const helpers=source.slice(source.indexOf('function resetHitTestInPage(){'),source.indexOf('function fullOverflowInPage(){'));
  assert.ok(actual.includes(helpers));
  assert.doesNotMatch(actual,/force\s*:\s*true/);
  assert.equal((actual.match(/locator\('\[data-action="reset"\]'\)\.click\(\)/g)||[]).length,1);
  assert.equal((actual.match(/locator\('\[data-action="undo"\]'\)\.click\(\)/g)||[]).length,1);
});
