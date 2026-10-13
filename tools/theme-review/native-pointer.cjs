'use strict';
// Test-only XTEST input helper. Never imported by deployed application assets.
const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {randomUUID} = require('node:crypto');
const execFileAsync=promisify(execFile);
const COMMAND_TIMEOUT_MS=2000;
const OBSERVATION_TIMEOUT_MS=1000;
const ARM_LIFETIME_MS=2000;
const TITLE_READY_LIMIT_MS=1000;
const TOLERANCE=1;
async function waitForWindowTitle(run,windowId,token) {
  const started=Date.now();let observed='',reads=0;
  while(true) {
    const remaining=TITLE_READY_LIMIT_MS-(Date.now()-started);
    const mismatch=()=>new Error('X11 title did not identify the controlled page within 1000ms; observed '+JSON.stringify(observed.slice(0,250)));
    if(remaining<=0)throw mismatch();
    let timer;
    try {
      observed=String(await Promise.race([
        run(['getwindowname',windowId]),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(mismatch()),remaining);})
      ]));reads++;
    } finally {clearTimeout(timer);}
    if(observed.includes(token))return {elapsedMs:Date.now()-started,reads};
    await new Promise(resolve=>setTimeout(resolve,Math.min(25,Math.max(1,TITLE_READY_LIMIT_MS-(Date.now()-started)))));
  }
}
function requireCI(env) {
  assert.ok(env.CI,'Native-pointer QA is CI-only; local Chrome/X11 input is not allowed');
  assert.equal(env.THEME_NATIVE_POINTER_DISPLAY_ISOLATED,'1','Caller must provision one isolated Xvfb display explicitly');
  assert.match(env.DISPLAY||'',/^:\d+(?:\.\d+)?$/,'Only a local isolated Xvfb display is supported');
}
function parseWindowIds(text) {
  const ids=String(text).trim().split(/\s+/).filter(Boolean);
  assert.equal(ids.length,1,'Exactly one visible Google Chrome window is required');
  assert.match(ids[0],/^\d+$/);return ids[0];
}
function parseGeometry(text) {
  const values=Object.fromEntries(String(text).trim().split('\n').map(line=>line.split('=')));
  const result={};for(const key of ['WINDOW','X','Y','WIDTH','HEIGHT','SCREEN']) {
    assert.match(values[key]||'',/^-?\d+$/,`Missing/invalid X11 geometry ${key}`);result[key]=Number(values[key]);
  }
  assert.ok(result.WIDTH>0&&result.HEIGHT>0);return result;
}
function validateCalibration(probes,viewport) {
  assert.equal(probes.length,2,'Two independent native pointer moves must calibrate mapping');
  assert.equal(viewport.devicePixelRatio,1,'Native diagnostic requires deviceScaleFactor 1');
  const offsets=[];
  for(const {screen,event} of probes) {
    assert.equal(event?.type,'pointermove');assert.equal(event.isTrusted,true,'Calibration event must be trusted');
    for(const axis of ['X','Y'])assert.ok(Math.abs(event['screen'+axis]-screen[axis.toLowerCase()])<=TOLERANCE,'X11/DOM screen coordinates disagree');
    assert.ok(event.clientX>0&&event.clientX<viewport.width&&event.clientY>0&&event.clientY<viewport.height,'Probe did not reach page viewport');
    offsets.push({x:event.screenX-event.clientX,y:event.screenY-event.clientY});
  }
  assert.ok(Math.abs(probes[0].screen.x-probes[1].screen.x)>=20&&Math.abs(probes[0].screen.y-probes[1].screen.y)>=20,'Calibration points must differ on both axes');
  for(const axis of ['x','y'])assert.ok(Math.abs(offsets[0][axis]-offsets[1][axis])<=TOLERANCE,'Viewport/screen mapping is not a stable translation');
  return {offset:offsets[1],viewport:{...viewport},probes};
}
function planClick(mapping,point) {
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));
  assert.ok(point.x>1&&point.y>1&&point.x<mapping.viewport.width-1&&point.y<mapping.viewport.height-1,'Click point must lie strictly inside calibrated viewport');
  const screen={x:Math.round(point.x+mapping.offset.x),y:Math.round(point.y+mapping.offset.y)};
  // Fresh invocation, no --window and no window-producing command: XTEST,
  // not XSendEvent. Exactly one down/up; no repeats, sleep, DOM click or retry.
  return {point:{...point},screen,args:['mousemove',String(screen.x),String(screen.y),'mousedown','1','mouseup','1']};
}
function verifyClickEvents(clicks,events) {
  const errors=[];const results=[];
  for(const click of clicks) {
    if(click.commandError)errors.push(`${click.label}: native command failed: ${click.commandError}`);
    const near=e=>Math.abs(e.screenX-click.screen.x)<=TOLERANCE&&Math.abs(e.screenY-click.screen.y)<=TOLERANCE&&e.epochMs>=click.startedEpochMs-20&&e.epochMs<=click.finishedEpochMs+OBSERVATION_TIMEOUT_MS;
    const matching=events.filter(near),result={label:click.label,expected:click,events:matching};results.push(result);
    for(const type of ['pointerdown','pointerup','click']) {
      const rows=matching.filter(e=>e.type===type);
      if(rows.length!==1){errors.push(`${click.label}: expected exactly one ${type}, saw ${rows.length}`);continue;}
      const e=rows[0];
      if(e.isTrusted!==true)errors.push(`${click.label}: untrusted ${type}`);
      if(e.frame!=='parent')errors.push(`${click.label}: ${type} routed to child frame`);
      if(Math.abs(e.clientX-click.point.x)>TOLERANCE||Math.abs(e.clientY-click.point.y)>TOLERANCE)errors.push(`${click.label}: ${type} viewport coordinate mismatch`);
      if(click.expectedAction!==undefined&&e.target?.action!==click.expectedAction)errors.push(`${click.label}: ${type} target action mismatch`);
      if(click.expectedId!==undefined&&e.target?.id!==click.expectedId)errors.push(`${click.label}: ${type} target id mismatch`);
      if(type==='pointerdown'&&e.buttons!==1)errors.push(`${click.label}: pointerdown button mask mismatch`);
      if(type==='pointerup'&&e.buttons!==0)errors.push(`${click.label}: pointerup button mask mismatch`);
      if(!Number.isFinite(e.epochMs)||!Number.isFinite(e.eventTimeStamp))errors.push(`${click.label}: missing event timing`);
    }
    const downs=matching.filter(e=>e.type==='pointerdown'),ups=matching.filter(e=>e.type==='pointerup'),ends=matching.filter(e=>e.type==='click');
    if(downs.length===1&&ups.length===1&&ends.length===1&&!(downs[0].epochMs<=ups[0].epochMs&&ups[0].epochMs<=ends[0].epochMs))errors.push(`${click.label}: event order mismatch`);
  }
  return {pass:errors.length===0,errors,results};
}
function installProbe() {
  if(window.__nativePointerProbe)throw Error('Native pointer probe already exists');
  const events=[];
  const record=e=>events.push({frame:'parent',type:e.type,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,buttons:e.buttons,pointerId:e.pointerId,eventTimeStamp:e.timeStamp,timeOrigin:performance.timeOrigin,epochMs:performance.timeOrigin+performance.now(),target:{tag:e.target?.tagName,id:e.target?.closest?.('[id]')?.id,action:e.target?.closest?.('[data-action]')?.getAttribute('data-action')}});
  const types=['pointermove','pointerdown','pointerup','click','gotpointercapture','lostpointercapture'];
  for(const type of types)window.addEventListener(type,record,true);
  // Optional integration with modal-routing-fixtures.cjs. Never accept arbitrary
  // external postMessages as trusted evidence; bind source to the controlled frame.
  const message=e=>{if(e.data?.__modalRouting==='child-event'&&e.source===document.querySelector('iframe')?.contentWindow)events.push({...e.data.record,frame:'child'});};
  window.addEventListener('message',message);
  window.__nativePointerProbe={events,dispose:()=>{for(const type of types)window.removeEventListener(type,record,true);window.removeEventListener('message',message);delete window.__nativePointerProbe;}};
}
async function prepareNativePointer({page,env=process.env,runCommand}={}) {
  requireCI(env);assert.ok(page,'A controlled headed Playwright page is required');
  assert.equal(await page.evaluate(()=>{const d=document.querySelector('#tront-theme-editor');return Boolean(d)&&!d.open;}),true,'A known closed theme dialog is required before native setup');
  const run=runCommand||(async(args)=>{const r=await execFileAsync('xdotool',args,{env,timeout:COMMAND_TIMEOUT_MS,maxBuffer:65536});return r.stdout;});
  const token='native-pointer-'+randomUUID(),originalTitle=await page.title();
  await page.evaluate(token=>{document.title=token;},token);
  const windowId=parseWindowIds(await run(['search','--onlyvisible','--class','^(google-chrome|Google-chrome)$']));
  const geometry=parseGeometry(await run(['getwindowgeometry','--shell',windowId]));
  assert.equal(String(geometry.WINDOW),windowId);
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio}));
  const identity=async()=>{
    assert.equal(parseWindowIds(await run(['search','--onlyvisible','--class','^(google-chrome|Google-chrome)$'])),windowId,'Chrome window identity changed');
    assert.ok((await run(['getwindowname',windowId])).includes(token),'X11 window title does not identify controlled page');
    assert.equal((await run(['getwindowfocus'])).trim(),windowId,'Controlled Chrome window does not own native focus');
    assert.deepEqual(parseGeometry(await run(['getwindowgeometry','--shell',windowId])),geometry,'X11 window geometry changed');
    assert.deepEqual(await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio})),viewport,'Page viewport changed');
  };
  await run(['windowfocus','--sync',windowId]);
  // document.title and the native window caption propagate asynchronously.
  // Establish identity while initially closed, before calibration/arming and
  // before the short Close/reopen sequence. This never delays a tested click.
  const titleReadiness=await waitForWindowTitle(run,windowId,token);
  await identity();
  await page.evaluate(installProbe);
  const probes=[];
  // Left page gutter avoids the app/control iframe. Unknown toolbar/window
  // geometry is never guessed into the final mapping: actual trusted events
  // establish the mapping, or calibration fails closed.
  for(const delta of [{x:24,y:180},{x:56,y:212}]) {
    assert.ok(delta.x<geometry.WIDTH&&delta.y<geometry.HEIGHT,'Window too small for calibration');
    const screen={x:geometry.X+delta.x,y:geometry.Y+delta.y};
    const before=await page.evaluate(()=>window.__nativePointerProbe.events.length);
    await run(['mousemove',String(screen.x),String(screen.y)]);
    await page.waitForFunction(({before,screen})=>window.__nativePointerProbe.events.slice(before).some(e=>e.type==='pointermove'&&Math.abs(e.screenX-screen.x)<=1&&Math.abs(e.screenY-screen.y)<=1),{before,screen},{timeout:OBSERVATION_TIMEOUT_MS});
    const event=await page.evaluate(({before,screen})=>window.__nativePointerProbe.events.slice(before).find(e=>e.type==='pointermove'&&Math.abs(e.screenX-screen.x)<=1&&Math.abs(e.screenY-screen.y)<=1),{before,screen});
    probes.push({screen,event});
  }
  const mapping=validateCalibration(probes,viewport);let armedAt=null,finished=false,inputFailed=false;const clicks=[];
  return {
    calibration:{windowId,geometry,token,mapping,titleReadiness},
    async arm() {
      assert.equal(armedAt,null,'A native input session may only be armed once');
      await identity();assert.equal(await page.evaluate(()=>{const d=document.querySelector('#tront-theme-editor');return Boolean(d)&&!d.open;}),true,'Arm only while the known dialog is closed');await page.evaluate(()=>{window.__nativePointerProbe.events.length=0;});armedAt=Date.now();
    },
    async clickAt(point,{label,expectedAction,expectedId}={}) {
      assert.ok(armedAt!==null&&!finished&&!inputFailed,'Arm before opening the modal; completion or command failure prohibits further input');
      assert.ok(Date.now()-armedAt<=ARM_LIFETIME_MS,'Native input permit expired; do not retry');
      assert.ok(label==='open'||label==='reset','This finite diagnostic permits only open and reset');
      assert.equal(clicks.some(c=>c.label===label),false,`Only one ${label} activation is permitted`);
      assert.ok(clicks.length<2,'Maximum two input activations per session');
      const action={...planClick(mapping,point),label,expectedAction,expectedId,startedEpochMs:Date.now()};clicks.push(action);
      try {await run(action.args);}catch(error){inputFailed=true;action.commandError=error.message;throw error;}finally {action.finishedEpochMs=Date.now();}
      // No screenshot, DOM action, readiness wait or browser evaluation occurs
      // between native move/down/up. A command failure is never retried.
      return action;
    },
    async finish() {
      assert.ok(armedAt!==null&&!finished);finished=true;
      let observationError=null;
      try {await page.waitForFunction(n=>window.__nativePointerProbe.events.filter(e=>e.type==='click').length>=n,clicks.length,{timeout:OBSERVATION_TIMEOUT_MS});}catch(error){observationError=error.message;}
      const events=await page.evaluate(()=>window.__nativePointerProbe.events);
      const report={calibration:{windowId,geometry,mapping},clicks,events,...verifyClickEvents(clicks,events)};
      if(observationError){report.pass=false;report.errors.push('Post-input observation timed out: '+observationError);}
      if(clicks.filter(c=>c.label==='reset').length!==1){report.pass=false;report.errors.push('Exactly one Reset activation is required');}
      try{await identity();}catch(error){report.pass=false;report.errors.push('Post-input identity check failed: '+error.message);}
      return report;
    },
    async dispose() {finished=true;await page.evaluate(title=>{window.__nativePointerProbe?.dispose();document.title=title;},originalTitle);}
  };
}
module.exports={COMMAND_TIMEOUT_MS,OBSERVATION_TIMEOUT_MS,ARM_LIFETIME_MS,TITLE_READY_LIMIT_MS,waitForWindowTitle,requireCI,parseWindowIds,parseGeometry,validateCalibration,planClick,verifyClickEvents,prepareNativePointer};
