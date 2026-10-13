'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {requireCI,parseWindowIds,parseGeometry,validateCalibration,planClick,verifyClickEvents,ARM_LIFETIME_MS}=require('./native-pointer.cjs');
const viewport={width:1440,height:900,devicePixelRatio:1};
const probes=[{screen:{x:24,y:180},event:{type:'pointermove',isTrusted:true,screenX:24,screenY:180,clientX:24,clientY:93}},{screen:{x:56,y:212},event:{type:'pointermove',isTrusted:true,screenX:56,screenY:212,clientX:56,clientY:125}}];
const mapping=()=>validateCalibration(structuredClone(probes),viewport);
const click=()=>({...planClick(mapping(),{x:621.2109375,y:793}),label:'reset',expectedAction:'reset',startedEpochMs:10000,finishedEpochMs:10010});
const events=()=>['pointerdown','pointerup','click'].map((type,i)=>({frame:'parent',type,isTrusted:true,clientX:621,clientY:793,screenX:621,screenY:880,buttons:i===0?1:0,epochMs:10003+i,eventTimeStamp:500+i,target:{action:'reset'}}));
test('native input refuses local, nonisolated, and remote displays',()=>{
 assert.throws(()=>requireCI({}));assert.throws(()=>requireCI({CI:'true',DISPLAY:':99'}));assert.throws(()=>requireCI({CI:'true',THEME_NATIVE_POINTER_DISPLAY_ISOLATED:'1',DISPLAY:'example:1'}));
 requireCI({CI:'true',THEME_NATIVE_POINTER_DISPLAY_ISOLATED:'1',DISPLAY:':99'});
});
test('window identity and geometry fail closed on ambiguity',()=>{
 assert.equal(parseWindowIds('123\n'),'123');for(const s of ['', '123\n456','invalid'])assert.throws(()=>parseWindowIds(s));
 assert.deepEqual(parseGeometry('WINDOW=123\nX=0\nY=0\nWIDTH=1440\nHEIGHT=987\nSCREEN=0\n'),{WINDOW:123,X:0,Y:0,WIDTH:1440,HEIGHT:987,SCREEN:0});
 assert.throws(()=>parseGeometry('WINDOW=123\nX=0\n'));
});
test('trusted native moves calibrate translation without toolbar guessing',()=>{
 assert.deepEqual(mapping().offset,{x:0,y:87});
 for(const patch of [{isTrusted:false},{screenX:100},{clientY:-2}]) {const p=structuredClone(probes);Object.assign(p[0].event,patch);assert.throws(()=>validateCalibration(p,viewport));}
 const p=structuredClone(probes);p[1].event.clientY+=10;assert.throws(()=>validateCalibration(p,viewport));
 assert.throws(()=>validateCalibration(probes,{...viewport,devicePixelRatio:2}));
});
test('one command contains one XTEST down/up and no explicit target/window stack',()=>{
 const p=planClick(mapping(),{x:621.2109375,y:793});assert.deepEqual(p.screen,{x:621,y:880});
 assert.deepEqual(p.args,['mousemove','621','880','mousedown','1','mouseup','1']);
 assert.ok(!p.args.includes('--window'));assert.ok(!p.args.includes('search'));assert.ok(!p.args.includes('sleep'));assert.ok(!p.args.includes('click'));assert.ok(ARM_LIFETIME_MS<=2000);
 for(const point of [{x:NaN,y:793},{x:0,y:0},{x:1500,y:793}])assert.throws(()=>planClick(mapping(),point));
});
test('strict event verification preserves one-click failure evidence',()=>{
 assert.equal(verifyClickEvents([click()],events()).pass,true);
 const variants=[[],events().slice(1),[...events(),events()[0]],events().map(e=>({...e,isTrusted:false})),events().map(e=>({...e,frame:'child'})),events().map(e=>({...e,clientX:600})),events().map(e=>({...e,target:{action:'close'}})),events().map(e=>({...e,epochMs:20000}))];
 for(const rows of variants)assert.equal(verifyClickEvents([click()],rows).pass,false);
 const wrongButton=events();wrongButton[0].buttons=0;assert.equal(verifyClickEvents([click()],wrongButton).pass,false);
 const wrongTime=events();wrongTime[0].epochMs=10009;assert.equal(verifyClickEvents([click()],wrongTime).pass,false);
});
const vm=require('node:vm');
const {prepareNativePointer}=require('./native-pointer.cjs');
function mockPlatform({failClick=false,changeFocus=false}={}) {
 const listeners=new Map(),commands=[],operations=[],dialog={open:false};let clickCommands=0;
 const document={title:'Controlled fixture',querySelector:s=>s==='#tront-theme-editor'?dialog:null};
 const globals={document,innerWidth:1440,innerHeight:900,devicePixelRatio:1,performance:{timeOrigin:1000,now:()=>Date.now()-1000}};
 globals.window={addEventListener:(t,f)=>{if(!listeners.has(t))listeners.set(t,[]);listeners.get(t).push(f);},removeEventListener:(t,f)=>listeners.set(t,(listeners.get(t)||[]).filter(x=>x!==f))};
 const context=vm.createContext(globals);
 const evaluate=async(fn,arg)=>{operations.push('evaluate');context.__arg=arg;return vm.runInContext('('+fn.toString()+')(__arg)',context);};
 const page={title:async()=>document.title,evaluate,waitForFunction:async(fn,arg)=>{if(!await evaluate(fn,arg))throw Error('Mock observation timed out');}};
 function event(type,x,y) {
   const isReset=y===880;
   const el={tagName:'BUTTON',id:isReset?'':'tront-theme-btn',getAttribute:()=>isReset?'reset':null};el.closest=()=>el;
   const e={type,isTrusted:true,clientX:x,clientY:y-87,screenX:x,screenY:y,buttons:type==='pointerdown'?1:0,pointerId:1,timeStamp:Date.now()-1000,target:el};
   for(const fn of listeners.get(type)||[])fn(e);
   if(type==='click'&&!isReset)dialog.open=true;
 }
 const runCommand=async(args)=>{
  operations.push('command');commands.push(args);
  if(args[0]==='search')return '123\n';
  if(args[0]==='getwindowgeometry')return 'WINDOW=123\nX=0\nY=0\nWIDTH=1440\nHEIGHT=987\nSCREEN=0\n';
  if(args[0]==='getwindowname')return document.title+' - Google Chrome';
  if(args[0]==='getwindowfocus')return changeFocus&&clickCommands?'456\n':'123\n';
  if(args[0]==='windowfocus')return '';
  if(args[0]==='mousemove'){
   event('pointermove',Number(args[1]),Number(args[2]));
   if(args.includes('mousedown')){clickCommands++;for(const type of ['pointerdown','pointerup','click'])event(type,Number(args[1]),Number(args[2]));if(failClick)throw Error('XTEST command failed after submission');}
   return '';
  }
  throw Error('Unexpected mock command');
 };
 return {page,runCommand,commands,operations,document,env:{CI:'true',DISPLAY:':99',THEME_NATIVE_POINTER_DISPLAY_ISOLATED:'1'}};
}
test('session uses no browser evaluation during each critical activation and cannot repeat Reset',async()=>{
 const platform=mockPlatform(),native=await prepareNativePointer(platform);await native.arm();
 platform.operations.length=0;await native.clickAt({x:910,y:29},{label:'open',expectedId:'tront-theme-btn'});assert.deepEqual(platform.operations,['command']);
 platform.operations.length=0;await native.clickAt({x:621.21,y:793},{label:'reset',expectedAction:'reset'});assert.deepEqual(platform.operations,['command']);
 await assert.rejects(()=>native.clickAt({x:621.21,y:793},{label:'reset'}));
 const report=await native.finish();assert.equal(report.pass,true,report.errors.join('\n'));assert.equal(report.clicks.length,2);
 await assert.rejects(()=>native.clickAt({x:621,y:793},{label:'reset'}));
 await native.dispose();assert.equal(platform.document.title,'Controlled fixture');
});
test('command uncertainty and changed focus fail closed without retry',async()=>{
 const failed=mockPlatform({failClick:true}),native=await prepareNativePointer(failed);await native.arm();
 await assert.rejects(()=>native.clickAt({x:621.21,y:793},{label:'reset',expectedAction:'reset'}));
 await assert.rejects(()=>native.clickAt({x:910,y:29},{label:'open'}));
 const report=await native.finish();assert.equal(report.pass,false);assert.ok(report.errors.some(s=>s.includes('native command failed')));assert.equal(failed.commands.filter(a=>a.includes('mousedown')).length,1);await native.dispose();
 const changed=mockPlatform({changeFocus:true}),other=await prepareNativePointer(changed);await other.arm();await other.clickAt({x:621.21,y:793},{label:'reset',expectedAction:'reset'});
 const changedReport=await other.finish();assert.equal(changedReport.pass,false);assert.ok(changedReport.errors.some(s=>s.includes('identity check failed')));await other.dispose();
});
