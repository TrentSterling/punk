'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PLAN,HARD_LIMIT_MS,WORK_LIMIT_MS,OUTER_LIMIT_MS,aggregate,optionsFor,protocolCollector,attachDispatch}=require('./modal-routing.cjs');
const F=require('./modal-routing-fixtures.cjs');
test('finite balanced controls cover six independent contexts per cell',()=>{
  assert.equal(PLAN.length,48);assert.equal(new Set(PLAN.map(r=>r.id)).size,48);
  assert.ok(Object.isFrozen(PLAN)&&PLAN.every(Object.isFrozen));
  for(let i=0;i<6;i++)assert.equal(new Set(PLAN.slice(i*8,i*8+8).map(r=>`${r.surface}/${r.origin}/${r.timing}`)).size,8);
  assert.deepEqual(PLAN.slice(0,8).map(r=>`${r.surface}/${r.origin}/${r.timing}`),PLAN.slice(8,16).reverse().map(r=>`${r.surface}/${r.origin}/${r.timing}`));
});
test('aggregation cannot hide a failure, missing result, or incomplete run',()=>{
  const full=PLAN.map(r=>({...r,finishedAt:'done',pass:true,initial:{pass:true},reopened:{pass:true}}));
  assert.equal(aggregate(full).pass,true);assert.equal(Object.keys(aggregate(full).groups).length,8);
  assert.equal(aggregate(full.slice(1)).pass,false);assert.equal(aggregate(full.map((r,i)=>i? r:{...r,pass:false})).pass,false);
  assert.equal(aggregate(full.map((r,i)=>i?r:{...r,finishedAt:null})).pass,false);assert.equal(aggregate(full,[{type:'deadline'}]).pass,false);
});
test('CI modes and ceilings are explicit and bounded',()=>{
  assert.equal(HARD_LIMIT_MS,175000);assert.equal(WORK_LIMIT_MS,165000);assert.equal(OUTER_LIMIT_MS,185000);
  assert.ok(HARD_LIMIT_MS-WORK_LIMIT_MS>=10000);
  assert.equal(optionsFor(['--project','punk','--browser-mode','headed']).browserMode,'headed');
  assert.throws(()=>optionsFor(['--project','punk','--browser-mode','other']));
  assert.throws(()=>optionsFor(['--project','monke']));
});
test('same-origin app control changes exactly the served iframe URL',()=>{
  const html='<html><iframe class="same" src="'+F.CROSS_URL+'" title="video"></iframe><script>untouched()</script></html>';
  const altered=F.sameOriginApp(html,'http://127.0.0.1:1234');
  assert.equal(altered.replace('http://127.0.0.1:1234'+F.CHILD_PATH,F.CROSS_URL),html);
  assert.throws(()=>F.sameOriginApp('<iframe></iframe>','http://example.test'));
  assert.throws(()=>F.sameOriginApp(html+html,'http://example.test'));
});
test('controlled documents have valid JavaScript and no live player API',()=>{
  for(const html of [F.childDocument(),F.nativeDocument(F.CROSS_URL),F.nativeDocument('http://127.0.0.1'+F.CHILD_PATH)]){
    const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);new vm.Script(scripts[0][1]);
    assert.doesNotMatch(html,/youtube\.com\/iframe_api|visibility\s*:\s*hidden|setTimeout|requestAnimationFrame/);
  }
  assert.match(F.nativeDocument(F.CROSS_URL),/\.showModal\(\)/);assert.match(F.nativeDocument(F.CROSS_URL),/:has\(#tront-theme-editor:modal\) iframe\{pointer-events:none\}/);
});
test('actual CDP send/ack parser preserves action identity and coordinates',()=>{
  const rows=[],collect=protocolCollector(r=>rows.push(r));
  collect('MODAL_ROUTING_ACTION '+JSON.stringify({boundary:'begin',caseId:'app-cross-immediate-1',action:'reopened Reset',workerWallMs:123}));
  collect('2026-10-13T06:00:00.000Z pw:protocol SEND ► '+JSON.stringify({id:12,method:'Input.dispatchMouseEvent',params:{type:'mousePressed',x:621.21,y:793,button:'left',clickCount:1},sessionId:'s'}));
  // Exact direction formatting in pinned Playwright v1.62.0 helper.ts.
  collect('2026-10-13T06:00:00.001Z pw:protocol ◀ RECV '+JSON.stringify({id:12,result:{},sessionId:'s'}));
  collect('MODAL_ROUTING_ACTION '+JSON.stringify({boundary:'end',caseId:'app-cross-immediate-1',action:'reopened Reset'}));
  collect('2026-10-13T06:00:00.002Z pw:protocol SEND ► '+JSON.stringify({id:13,method:'Runtime.evaluate',params:{expression:'1'}}));
  assert.equal(rows.length,4);assert.equal(rows[1].params.x,621.21);assert.equal(rows[1].params.y,793);assert.equal(rows[1].action.action,'reopened Reset');assert.equal(rows[2].direction,'ack');
});
test('absent, duplicate or unacknowledged actual Reset dispatch fails',()=>{
  const make=()=>({cases:[{id:'x',pass:true,errors:[],initial:{attempted:true,pass:true}}],errors:[]});
  const events=['mouseMoved','mousePressed','mouseReleased'].flatMap((type,i)=>[{kind:'dispatch',direction:'send',id:i,sessionId:'s',action:{caseId:'x',action:'initial Reset'},params:{type,x:621,y:793,clickCount:1}},{kind:'dispatch',direction:'ack',id:i,sessionId:'s',action:{caseId:'x',action:'initial Reset'}}]);
  assert.equal(attachDispatch(make(),events).cases[0].pass,true);
  assert.equal(attachDispatch(make(),[]).cases[0].pass,false);
  assert.equal(attachDispatch(make(),events.slice(0,-1)).cases[0].pass,false);
  assert.equal(attachDispatch(make(),events.concat(events[2])).cases[0].pass,false);
});
test('diagnostic preserves ordinary single clicks and lightweight event probes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'modal-routing.cjs'),'utf8');
  assert.doesNotMatch(source,/force\s*:\s*true|\.dispatchEvent\(|\.evaluate\(el\s*=>\s*el\.click\(/);
  assert.equal((source.match(/locator\('\[data-action="reset"\]'\)\.click\(\)/g)||[]).length,1);
  assert.match(source,/if\(item\.timing==='rendered'\).*frames\(page\).*screenshot/);
  const record=F.parentProbe.toString().split('function record(e){')[1].split("for(const type")[0];
  assert.doesNotMatch(record,/__routingSnapshot|getBoundingClientRect|getComputedStyle|getAnimations/);
  assert.match(source,/Target\.getTargets/);assert.match(F.parentProbe.toString(),/performance\.timeOrigin/);assert.match(F.childDocument(),/isTrusted/);
  assert.match(source,/\['GET','HEAD'\]\.includes\(request\.method\(\)\)/);assert.match(source,/assert\.deepEqual\(row\.blockedNonReadRequests\|\|\[\],\[\]\)/);
});
