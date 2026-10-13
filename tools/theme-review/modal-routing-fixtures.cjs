'use strict';
// Test documents only. Never written into or injected into deployed app assets.
const CHILD_PATH='/__modal-routing-child.html';
const NATIVE_PATH='/__modal-routing-native.html';
const CROSS_URL='https://www.youtube.com/embed/k1BcMzdztUM';
const KEY='tront-theme-punk-v1';
const CYAN={version:1,preset:'cyan',mode:'dark',count:4,angle:135,intensity:65,frost:88,pegs:[{color:'#56ccff',position:0},{color:'#1871b8',position:33},{color:'#2dd4bf',position:67},{color:'#99f6e4',position:100}]};
function childDocument(){
  return `<!doctype html><html><head><meta charset="utf-8"><title>Controlled child</title></head><body style="margin:0;background:#111;color:#bbb;font:16px system-ui;display:grid;place-items:center;height:100vh"><p>QA: YouTube playback unverified (provider frame mocked)</p><script>
window.__routingChildEvents=[];
function record(e){
 const r={type:e.type,time:performance.now(),timeOrigin:performance.timeOrigin,epochMs:performance.timeOrigin+performance.now(),eventTimeStamp:e.timeStamp,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pointerId:e.pointerId,button:e.button,buttons:e.buttons,target:{tag:e.target?.tagName,id:e.target?.id},active:document.activeElement?.tagName,visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY}};
 window.__routingChildEvents.push(r);parent.postMessage({__modalRouting:'child-event',record:r},'*');
}
for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','gotpointercapture','lostpointercapture','focusin'])document.addEventListener(type,record,true);
for(const type of ['focus','blur'])window.addEventListener(type,record,true);
</script></body></html>`;
}
function sameOriginApp(html,origin){
  const tags=[...html.matchAll(/<iframe\b[^>]*>/g)];
  if(tags.length!==1||!tags[0][0].includes(CROSS_URL))throw Error('Expected exactly the preserved HackerPunk YouTube iframe');
  // Only the delivered test response differs; no file or runtime asset is edited.
  return html.replace(tags[0][0],tags[0][0].replace(CROSS_URL,origin+CHILD_PATH));
}
function nativeDocument(childUrl){
  return `<!doctype html><html data-te-project="native"><head><meta charset="utf-8"><title>Native dialog routing control</title><link rel="icon" href="data:,"><style>
html,body{margin:0;min-height:1500px;font:16px system-ui}body{background:#20232b;color:white}
#tront-theme-btn{position:fixed;left:880px;top:10px;width:80px;height:40px}
iframe{position:absolute;left:123px;top:776.25px;width:1194px;height:671.625px;border:0}
dialog{position:fixed;margin:0;left:500px;top:34px;width:440px;height:832px;box-sizing:border-box;padding:20px;border:2px solid #aaa;background:#f7f7f7;color:#111}
dialog::backdrop{background:rgb(0 0 0 / .45)}
[data-action="close"]{position:absolute;right:10px;top:10px}
[data-action="reset"]{position:absolute;left:88.65625px;top:737px;width:61.109375px;height:40px;padding:0}
[data-action="undo"]{position:absolute;left:164px;top:737px;height:40px}
html:has(#tront-theme-editor:modal) iframe{pointer-events:none}
</style></head><body><button id="tront-theme-btn" aria-expanded="false">Theme</button><iframe src="${childUrl}" title="Controlled child"></iframe>
<dialog id="tront-theme-editor"><button data-action="close">Close</button><h1>Native dialog control</h1><label>Palette <select name="preset"><option value="project-original">Native</option><option value="cyan">Cyan</option></select></label><p>No app theme engine, transforms, or animated decoration.</p><button data-action="reset">Reset</button><button data-action="undo">Undo</button></dialog>
<script>
const dialog=document.querySelector('dialog'),opener=document.querySelector('#tront-theme-btn'),preset=document.querySelector('select'),key=${JSON.stringify(KEY)},cyan=${JSON.stringify(CYAN)};
window.TrontThemeEditor={key};let previous=null;
function state(value){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);document.documentElement.dataset.teProject=value===null?'native':'custom';preset.value=value===null?'project-original':'cyan';}
state(null);
opener.addEventListener('click',()=>{dialog.showModal();opener.setAttribute('aria-expanded','true');dialog.querySelector('[data-action="close"]').focus();});
dialog.querySelector('[data-action="close"]').addEventListener('click',()=>{dialog.close();opener.setAttribute('aria-expanded','false');opener.focus({preventScroll:true});});
dialog.addEventListener('close',()=>{if(!dialog.open)opener.setAttribute('aria-expanded','false');});
dialog.querySelector('[data-action="reset"]').addEventListener('click',()=>{previous=localStorage.getItem(key);state(null);});
dialog.querySelector('[data-action="undo"]').addEventListener('click',()=>state(previous));
preset.addEventListener('change',()=>state(preset.value==='cyan'?JSON.stringify(cyan):null));
</script></body></html>`;
}
// Installed before page scripts. Capture only; no event cancellation or input mutation.
function parentProbe(){
  if(window!==top)return;
  localStorage.setItem('tront-theme','sentinel-legacy');localStorage.setItem('tront-theme-gallery-v1','sentinel-gallery');localStorage.setItem('tront-previews-paused','sentinel-paused');
  const describe=el=>el?{tag:el.tagName,id:el.id,action:el.getAttribute?.('data-action'),name:el.getAttribute?.('name')}:null;
  const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const style=el=>{if(!el)return null;const s=getComputedStyle(el);return {pointerEvents:s.pointerEvents,visibility:s.visibility,display:s.display,position:s.position,transform:s.transform,opacity:s.opacity};};
  const clock=()=>({time:performance.now(),timeOrigin:performance.timeOrigin,epochMs:performance.timeOrigin+performance.now()});
  window.__routingEvents=[];window.__routingCloseEvents=0;
  window.__routingSnapshot=()=>{
    const d=document.querySelector('#tront-theme-editor'),r=d?.querySelector('[data-action="reset"]'),f=document.querySelector('iframe'),rr=rect(r),p=rr?{x:rr.x+rr.width/2,y:rr.y+rr.height/2}:null;
    return {...clock(),dialog:{rect:rect(d),style:style(d),open:d?.open,modal:d?.matches(':modal'),scrollTop:d?.scrollTop},reset:{rect:rr,point:p,style:style(r),hit:p?describe(document.elementFromPoint(p.x,p.y)):null},iframe:{rect:rect(f),style:style(f),src:f?.src,inert:f?.inert},active:describe(document.activeElement),scroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight},project:document.documentElement.dataset.teProject,preset:d?.querySelector('[name="preset"]')?.value,stored:localStorage.getItem('tront-theme-punk-v1'),expanded:document.querySelector('#tront-theme-btn')?.getAttribute('aria-expanded'),closeEvents:window.__routingCloseEvents,animations:document.getAnimations().map(a=>({name:a.animationName,playState:a.playState,currentTime:a.currentTime}))};
  };
  function record(e){
    const d=document.querySelector('#tront-theme-editor'),r={...clock(),type:e.type,eventTimeStamp:e.timeStamp,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pointerId:e.pointerId,button:e.button,buttons:e.buttons,target:describe(e.target),active:describe(document.activeElement),modal:d?.matches(':modal'),open:d?.open};
    if(e.type==='close'&&e.target===d)window.__routingCloseEvents++;
    window.__routingEvents.push(r);
  }
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','gotpointercapture','lostpointercapture','focusin','close','cancel'])document.addEventListener(type,record,true);
  for(const type of ['focus','blur'])window.addEventListener(type,record,true);
  window.addEventListener('message',e=>{if(e.data?.__modalRouting==='child-event'&&e.source===document.querySelector('iframe')?.contentWindow)window.__routingEvents.push({...clock(),type:'child-message',origin:e.origin,record:e.data.record,modal:document.querySelector('dialog')?.matches(':modal')});});
}
module.exports={CHILD_PATH,NATIVE_PATH,CROSS_URL,KEY,CYAN,childDocument,sameOriginApp,nativeDocument,parentProbe};
