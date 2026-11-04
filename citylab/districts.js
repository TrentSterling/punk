/** HACKERPUNK 0.2: street reservations -> district parcels -> owned shells -> decks.
 * References studied (not copied): CityWorks shared-court/access contracts;
 * Metroforge urban-fabric.js and surface-ownership architecture;
 * mrdoob/slop-newyork buildings.js and filtered procedural facade materials.
 * Metric, seeded recipes remain separate from rendering and movement equipment.
 */
import * as THREE from 'three';
export const DISTRICTS = [
  {id:'foundry',name:'THE FOUNDRY',short:'FOUNDRY',color:'#d18a5b',description:'Furnaces, sawtooth halls and cargo gantries'},
  {id:'crown',name:'CORPORATE CROWN',short:'CROWN',color:'#cfccb7',description:'Tapered glass towers and civic megastructures'},
  {id:'relay',name:'RELAY / DATA WARD',short:'RELAY',color:'#6e9ba9',description:'Armored data vaults and cooling infrastructure'},
  {id:'stacks',name:'THE STACKS',short:'STACKS',color:'#b7a285',description:'Dense housing, stacked balconies and service courts'},
  {id:'market',name:'NIGHTMARKET',short:'MARKET',color:'#d39a80',description:'Narrow shopfronts, canopies and crowded upper streets'},
  {id:'garden',name:'GARDEN TERRACES',short:'GARDEN',color:'#83a895',description:'Stepped residences, water courts and planted terraces'}
];
const hash=s=>{let a=2166136261;for(const c of String(s)){a^=c.charCodeAt(0);a=Math.imul(a,16777619);}return a>>>0;};
const rng=s=>{let a=hash(s);return()=>{a+=0x6d2b79f5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};};
const pick=(r,a)=>a[Math.floor(r()*a.length)],V=(x,y,z)=>new THREE.Vector3(x,y,z);
const q=n=>Math.round(n*1000)/1000;
export function planCity(seed,height=1){
  const r=rng(seed),xs=[-254,-172,-96,0,83,161,251],zs=[-232,-158,-79,0,70,155,247];
  for(let i=1;i<6;i++){if(i!==3){xs[i]+=q((r()-.5)*8);zs[i]+=q((r()-.5)*8);}}
  const widthsX=xs.map((_,i)=>[0,3,6].includes(i)?18:i===2?14:10),widthsZ=zs.map((_,i)=>[0,3,6].includes(i)?18:10);
  const blocks=[],upperLinks=[];
  for(let j=0;j<6;j++)for(let i=0;i<6;i++){
    const L=xs[i]+widthsX[i]/2+3.2,R=xs[i+1]-widthsX[i+1]/2-3.2,N=zs[j]+widthsZ[j]/2+3.2,S=zs[j+1]-widthsZ[j+1]/2-3.2;
    const district=Math.floor(i/2)+(j>=3?3:0);
    const deck=district!==0||j===2;
    blocks.push({id:i+','+j,i,j,x:q((L+R)/2),z:q((N+S)/2),w:q(R-L),d:q(S-N),district,deck,deckY:16,links:[],seed:hash(seed+':block:'+i+','+j)});
  }
  for(const a of blocks)if(a.deck)for(const[di,dj,axis,side,opp]of[[1,0,'x','E','W'],[0,1,'z','S','N']]){
    const b=blocks.find(b=>b.i===a.i+di&&b.j===a.j+dj);if(!b?.deck)continue;
    if(axis==='z'&&a.i%2===0&&a.j%3===0)continue;
    upperLinks.push({a:a.id,b:b.id,axis,y:16,width:a.district===4||b.district===4?7:5.2});a.links.push(side);b.links.push(opp);
  }
  const districts=DISTRICTS.map((d,n)=>{const bs=blocks.filter(b=>b.district===n);return{...d,blocks:bs.map(b=>b.id),x:bs.reduce((t,b)=>t+b.x,0)/bs.length,z:bs.reduce((t,b)=>t+b.z,0)/bs.length};});
  return {version:'0.2.0',seed,unit:'metre',heightMultiplier:height,groundStreets:{x:xs,z:zs,widthsX,widthsZ},blocks,upperLinks,districts,bounds:[xs[0]-12,-1,zs[0]-12,xs[6]+12,180,zs[6]+12],baseline:'All structural surfaces climbable. Equipment does not change layout.'};
}
function facadeMaterial(color,type){
  const m=new THREE.MeshStandardMaterial({color,roughness:type===1?.38:.83,metalness:type===1?.42:.12});
  m.onBeforeCompile=s=>{
    s.vertexShader='varying vec2 fUV;varying vec3 fP;varying vec3 fN;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfUV=uv;fP=(modelMatrix*vec4(position,1.)).xyz;fN=normalize(mat3(modelMatrix)*normal);');
    s.fragmentShader=`varying vec2 fUV;varying vec3 fP;varying vec3 fN;
float fh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rectAA(vec2 p,vec2 halfSize,vec2 aa){vec2 e=smoothstep(halfSize-aa,halfSize+aa,abs(p));return (1.-e.x)*(1.-e.y);}
`+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 cell=fract(fUV),idx=floor(fUV),fw=max(fwidth(fUV),vec2(.0004));
float seed=fh(idx+floor(fP.xz*.012));
float opening=rectAA(cell-.5,vec2(${type===1?'.46,.43':type===2?'.30,.24':type===3?'.37,.30':'.32,.29'}),fw);
float rim=rectAA(cell-.5,vec2(${type===1?'.485,.46':type===2?'.34,.28':type===3?'.415,.345':'.375,.34'}),fw);
vec3 outer=diffuseColor.rgb;
float seam=smoothstep(.015,.015+max(fw.x,fw.y),min(min(cell.x,1.-cell.x),min(cell.y,1.-cell.y)));
outer*=mix(.60,1.,seam);
outer*=.92+.08*fh(idx*1.13);
vec3 view=normalize(cameraPosition-fP),N=normalize(fN),T=normalize(cross(vec3(0,1,0),N));
vec2 aperture=vec2(${type===1?'.46,.43':type===2?'.30,.24':type===3?'.37,.30':'.32,.29'});
vec3 ro=vec3((cell-.5)/aperture,1.);
vec3 rd=vec3(-dot(view,T),-view.y,-max(.18,dot(view,N)));
vec3 ts=(sign(rd)-ro)/(rd+vec3(.00001));
float dist=min(ts.x,min(ts.y,ts.z));vec3 room=ro+rd*max(dist,0.);
float floorLight=mix(.40,1.,smoothstep(-1.,.8,room.y));
float back=step(.99,abs(room.z));float furnishing=step(.5,room.y+1.)*step(room.y,-.1)*step(abs(room.x),.47);
vec3 interior=mix(vec3(.026,.055,.065),vec3(.36,.245,.12),step(.79,seed));
interior*=floorLight*mix(.68,1.,back);interior*=1.-furnishing*.32;
float reflection=pow(1.-max(0.,dot(view,N)),3.);
interior=mix(interior,vec3(.22,.36,.43),.18+reflection*.4);
diffuseColor.rgb=mix(outer,vec3(.035,.045,.049),rim);diffuseColor.rgb=mix(diffuseColor.rgb,interior,opening);
float farBlend=clamp(max(fw.x,fw.y)-.38,0.,1.);diffuseColor.rgb=mix(diffuseColor.rgb,mix(outer,vec3(.10,.16,.18),.55),farBlend);
`);
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.46,.24,.08)*opening*step(.79,seed)*.35;');
  };m.customProgramCacheKey=()=>`district-facade-${type}`;return m;
}
export function addDistrictMaterials(mats,surface){
  const colors={ivory:0xcac6b2,ceramic:0xd1d4c9,ochre:0xb68758,oxide:0x8e5140,carbon:0x1b2b32,green:0x345f50,water:0x1e5765};
  for(const [k,c]of Object.entries(colors))mats[k]=surface(c,k==='water'?.22:.8,k==='water'?.5:.12,.035);
  for(const [name,col,type]of [['facIvory',0xb8b6a7,0],['facSand',0xa18a6c,0],['facRust',0x9b6750,0],['facBlue',0x516c76,0],['facGlass',0x59717b,1],['facDark',0x263c47,2],['facMarket',0xa88570,3]])mats[name]=facadeMaterial(col,type);
  mats.paint=new THREE.MeshStandardMaterial({color:0xd2c7ad,roughness:.95,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
}
export function compileDistricts(api,data){
  const {B,mats,sign,rail,pipe,indexCollider}=api;
  const ground=[],decks=[],buildings=[],artifacts=[],pi=Math.PI;
  const addGeo=(g,mat)=>{if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}if(!B.merge.has(mat))B.merge.set(mat,[]);B.merge.get(mat).push(g);};
  function flat(x,z,w,d,y,mat){const g=new THREE.PlaneGeometry(w,d);g.rotateX(-pi/2);g.translate(x,y,z);addGeo(g,mat);}
  function slab(x,z,w,d,top,thick,mat,kind){B.box(x,top-thick/2,z,w,thick,d,mat,true);if(kind)(kind==='ground'?ground:decks).push({x,z,w,d,y:top,kind});}
  function rectangle(w,d,c=0){const a=w/2,b=d/2;c=Math.min(c,a*.5,b*.5);return c?[[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]]:[[-a,-b],[a,-b],[a,b],[-a,b]];}
  // One shell owns each wall and cap. No outward bevel expansion or layered window boxes.
  function shell(x,z,w,d,base,h,mat='facIvory',chamfer=1,topScale=1,shift=0,roof='dark',solid=true){
    const p=rectangle(w,d,chamfer),positions=[],uvs=[],top=p.map(([a,b])=>[a*topScale+shift,b*topScale]);
    const tri=(a,b,c,ua,ub,uc)=>{positions.push(...a,...b,...c);uvs.push(...ua,...ub,...uc);};
    for(let i=0;i<p.length;i++){
      const j=(i+1)%p.length,[ax,az]=p[i],[bx,bz]=p[j],[atx,atz]=top[i],[btx,btz]=top[j];
      const len=Math.hypot(bx-ax,bz-az),bay=Math.max(1,Math.round(len/(mat==='facGlass'?2.6:3.1))),floors=h/3.3;
      const a=[x+ax,base,z+az],b=[x+bx,base,z+bz],c=[x+btx,base+h,z+btz],d0=[x+atx,base+h,z+atz];
      tri(a,c,b,[0,0],[bay,floors],[bay,0]);tri(a,d0,c,[0,0],[0,floors],[bay,floors]);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();addGeo(g,mat);
    const cap=new THREE.Shape();top.forEach(([a,b],i)=>i?cap.lineTo(a,b):cap.moveTo(a,b));cap.closePath();const cg=new THREE.ShapeGeometry(cap);cg.rotateX(-pi/2);cg.translate(x,base+h,z);addGeo(cg,roof);
    if(solid)indexCollider(new THREE.Box3(V(x-w/2,base,z-d/2),V(x+w/2,base+h,z+d/2)));
    B.structures++;buildings.push({x,z,w,d,base,h,mat,topScale});return base+h;
  }
  function tank(x,z,r,h,base=.35){
    B.instance('cyl',x,base+h/2,z,r,h,r,'steel');B.instance('sphere',x,base+h,z,r,r*.32,r,'panel');
    for(const yy of[base+1,base+h*.45,base+h-.8])B.instance('cyl',x,yy,z,r+.17,.25,r+.17,'dark',true);
    B.box(x,base+h*.5,z+r+.2,.7,h*.8,.3,'rust',false,true);
    for(let y=1;y<h-.5;y+=.65)B.box(x,base+y,z+r+.42,.8,.065,.18,'steel',false,true);
    indexCollider(new THREE.Box3(V(x-r,base,z-r),V(x+r,base+h+r*.32,z+r)));
  }
  function roofkit(x,z,w,d,y,r){
    const px=x-w*.26,pz=z-d*.23;shell(px,pz,Math.max(2.8,w*.22),Math.max(2.6,d*.18),y,.9+r()*1.5,'steel',.2,1,0,'dark');
    for(let i=0;i<2;i++){const xx=x+w*.23,zz=z+(i-.5)*3.2;
      B.box(xx,y+.7,zz,2.4,1.4,2.3,'steel',true);flat(xx,zz,2.05,1.95,y+1.405,'black');
      B.instance('cyl',xx,y+1.49,zz,.72,.12,.72,'panel',true);
      B.box(xx,y+1.58,zz,1.15,.08,.17,'dark',false,true,.6);B.box(xx,y+1.58,zz,.17,.08,1.15,'dark',false,true,.6);
    }
    pipe([px,y+.6,pz],[px,y+.6,z+d*.25],.12);
    if(w>12){B.box(x+w*.27,y+3.2,z-d*.3,.16,6.2,.16,'steel',false,true);B.box(x+w*.27,y+6.4,z-d*.3,.23,.25,.23,'red',false,true);}
  }
  function panels(x,z,w,h,d,base,tone='steel',step=5.5){
    for(let a=-w/2+1.2;a<w/2-1;a+=step)for(const s of[-1,1])B.box(x+a,base+h/2,z+s*(d/2+.22),.28,h-.3,.42,tone,false,true);
    for(let a=-d/2+1.2;a<d/2-1;a+=step)for(const s of[-1,1])B.box(x+s*(w/2+.22),base+h/2,z+a,.42,h-.3,.28,tone,false,true);
  }
  function rim(x,z,w,d,y,mat='ceramic'){
    B.box(x,y,z-d/2+.16,w,.5,.32,mat,false,true);B.box(x,y,z+d/2-.16,w,.5,.32,mat,false,true);
    B.box(x-w/2+.16,y,z,.32,.5,d-.64,mat,false,true);B.box(x+w/2-.16,y,z,.32,.5,d-.64,mat,false,true);
  }
  function plant(x,z,w,d,y){
    B.box(x,y+.23,z,w,.46,d,'dark',true);flat(x,z,w-.24,d-.24,y+.47,'green');
    const n=Math.max(1,Math.floor(w/1.6));for(let i=0;i<n;i++){const px=x-w/2+.8+i*(w-1.6)/Math.max(1,n-1);B.instance('sphere',px,y+.65,z,.7,.35,Math.min(.8,d*.48),'plant',true);}
  }
  function tree(x,z,y,r){
    const h=3.6+r()*2;B.instance('cyl',x,y+h/2,z,.18,h,.18,'sand',true);
    for(let j=0;j<5;j++){const a=j*2.4,xx=x+Math.cos(a)*1.2,zz=z+Math.sin(a)*1.2;B.beam(V(x,y+h*.6,z),V(xx,y+h,zz),.1,'sand',true);B.instance('sphere',xx,y+h,zz,1.5,1.2,1.4,'plant',true);}
  }
  function storefront(x,z,w,y,text,tone='oxide'){
    shell(x,z,w,4.2,y,3.8,tone,.25,1,0,'dark');B.box(x,y+1.8,z+2.18,w-.7,2.8,.15,'black',false,true);B.box(x,y+1.85,z+2.32,w-.95,2.45,.10,'glass',false,true);
    for(let a=-w/2+.6;a<w/2;a+=2.2)B.box(x+a,y+1.8,z+2.45,.095,2.8,.12,'copper',false,true);
    B.box(x,y+3.45,z+2.8,w+.15,.22,1.8,tone,true);B.box(x,y+3.28,z+3.63,w-.35,.08,.06,'warm',false,true);
    sign(text,x,y+4.2,z+2.3,w*.88,.95,0,tone==='oxide'?'#ecb37f':'#93c7cc');
  }
  function deck(b){
    if(!b.deck)return;const{x,z,w,d}=b,y=16,s=4.8;
    slab(x,z-d/2+s/2,w,s,y,1.25,'concrete','deck');slab(x,z+d/2-s/2,w,s,y,1.25,'concrete','deck');slab(x-w/2+s/2,z,s,d-s*2,y,1.25,'concrete','deck');slab(x+w/2-s/2,z,s,d-s*2,y,1.25,'concrete','deck');
    for(const sx of[-1,1])for(const sz of[-1,1]){const px=x+sx*(w/2-1.5),pz=z+sz*(d/2-1.5);B.box(px,7.65,pz,1.7,14.6,1.7,'concrete',true);B.box(px,12.9,pz,2.3,2.7,2.3,'steel',false,true);B.box(px+sx*.88,6,pz,.08,3.5,.5,'amber',false,true);}
    for(const side of['N','S','E','W']){
      const horiz=side==='N'||side==='S',len=horiz?w:d,sgn=side==='N'||side==='W'?-1:1,sx=horiz?x:x+sgn*w/2,sz=horiz?z+sgn*d/2:z;
      const line=(a,c)=>rail(sx+(horiz?a:0),sz+(horiz?0:a),sx+(horiz?c:0),sz+(horiz?0:c),y);
      if(b.links.includes(side)){line(-len/2+1,-4.2);line(4.2,len/2-1);}else line(-len/2+1,len/2-1);
      B.box(sx,15.28,sz,horiz?w-.8:.09,.11,horiz?.09:d-.8,b.district===0?'amber':'cyan',false,true);
      const n=Math.floor(len/5);for(let t=0;t<n;t++){const p=-len/2+(t+.5)*len/n;B.box(sx+(horiz?p:sgn*.04),14.96,sz+(horiz?sgn*.04:p),horiz?len/n-.3:.13,.43,horiz?.13:len/n-.3,'steel',false,true);}
    }
    for(const sz of[-1,1])rail(x-w/2+s,z+sz*(d/2-s),x+w/2-s,z+sz*(d/2-s),y);
    for(const sx of[-1,1])rail(x+sx*(w/2-s),z-d/2+s,x+sx*(w/2-s),z+d/2-s,y);
  }
  function streetGrid(){
    const {x:xs,z:zs,widthsX:wx,widthsZ:wz}=data.groundStreets,L=xs[0]-wx[0]/2,R=xs[6]+wx[6]/2,N=zs[0]-wz[0]/2,S=zs[6]+wz[6]/2;
    for(let i=0;i<7;i++)slab(xs[i],(N+S)/2,wx[i],S-N,0,.6,'asphalt','ground');
    for(let j=0;j<7;j++)for(let i=0;i<6;i++){const a=xs[i]+wx[i]/2,b=xs[i+1]-wx[i+1]/2;slab((a+b)/2,zs[j],b-a,wz[j],0,.6,'asphalt','ground');}
    for(const b of data.blocks)slab(b.x,b.z,b.w+6.4,b.d+6.4,.28,.55,'pavement','ground');
    for(const [axis,lines,widths,cross,cwidths] of [['z',xs,wx,zs,wz],['x',zs,wz,xs,wx]])for(let i=0;i<7;i++){
      const p=lines[i],w=widths[i],alongX=axis==='x';
      for(let t=(alongX?L:N)+2;t<(alongX?R:S)-2;t+=6){if(cross.some((c,k)=>Math.abs(c-t)<cwidths[k]/2+7))continue;for(const s of[-1,1])flat(alongX?t:p+s*.15,alongX?p+s*.15:t,alongX?2.8:.08,alongX?.08:2.8,.012,'paint');}
      for(let j=0;j<7;j++)for(const s of[-1,1])for(let a=-w/2+1.3;a<w/2-1;a+=1.25){const t=cross[j]+s*(cwidths[j]/2+2.8);flat(alongX?t:p+a,alongX?p+a:t,alongX?2.5:.52,alongX?.52:2.5,.015,'paint');}
    }
    B.box(0,-2,0,1800,1,1800,'asphalt');
    for(const b of data.blocks){
      for(const s of[-1,1]){B.box(b.x+s*(b.w/2+2.6),.32,b.z,.12,.06,b.d+5,'steel',false,true);B.box(b.x,.32,b.z+s*(b.d/2+2.6),b.w+4.9,.06,.12,'steel',false,true);}
      for(const s of[-1,1]){const x=b.x+s*(b.w/2+1.8),z=b.z+b.d/2+1.8;B.box(x,4.6,z,.16,8.6,.16,'steel',false,true);B.box(x,8.8,z-1,.2,.18,2.2,'steel',false,true);B.box(x,8.68,z-1.3,.4,.06,1.3,'warm',false,true);}
    }
  }
  function crown(b,r){
    const{x,z,w,d}=b,hero=b.i===3&&b.j===2,tw=(w-18)*(hero?.40:.54),td=d*.48,tx=x-(hero?10:3),tz=z-d*.12,h=(hero?127:63+r()*45)*data.heightMultiplier;
    shell(tx,tz,tw+5,td+4,.28,7.7,'ivory',2,1,0,'dark');const y=shell(tx,tz,tw,td,8,h-8,'facGlass',3.2,.74,hero?3:0,'steel');
    for(const s of[-1,1]){B.beam(V(tx+s*(tw/2-.8),8,tz+td/2+.12),V(tx+s*(tw*.74/2-.6)+(hero?3:0),y,tz+td*.74/2+.12),.65,'ivory',true);B.beam(V(tx+s*(tw/2-.8),8,tz-td/2-.12),V(tx+s*(tw*.74/2-.6)+(hero?3:0),y,tz-td*.74/2-.12),.65,'ivory',true);}
    for(let yy=20;yy<h-10;yy+=20){const t=(yy-8)/(h-8),ww=tw*(1-.26*t),dd=td*(1-.26*t),cx=tx+(hero?3*t:0);for(const s of[-1,1])B.beam(V(cx-ww/2,yy,tz+s*(dd/2+.4)),V(cx+ww*.38,Math.min(y-2,yy+16),tz+s*(dd/2-1)),.28,'steel',true);}
    roofkit(tx+(hero?3:0),tz,tw*.74,td*.74,y,r);
    if(hero){const xx=x+17,hh=h*.86;shell(xx,tz,14,td*.8,.28,hh,'facGlass',2,.82,-2,'steel');B.box(x+6,hh-11,tz+3,23,7,9,'ivory',true);sign('HELIX',x+6,hh-10,tz+7.56,18,4,0,'#ead3a3','CIVIC SYSTEMS');B.box(xx,hh+4,tz,.35,8,.35,'steel',false,true);}
    else{const xx=x+w*.22,zz=z+d*.23,hh=15+r()*12;shell(xx,zz,Math.min(13,w*.24),d*.26,.28,hh,'facIvory',1.5,1,0,'dark');plant(x-w*.25,z+d*.26,w*.24,3,.3);}
    storefront(x-w*.15,z+d/2-9,Math.min(18,w*.38),.28,'CIVIC / ACCESS','carbon');
  }
  function foundry(b,r){
    const{x,z,w,d}=b,hw=w*.55,hd=d*.56,h=10+r()*6,xx=x-w*.12,zz=z-d*.12;shell(xx,zz,hw,hd,.28,h,'rust',.7,1,0,'dark');
    for(let a=-hw/2+1;a<hw/2-1;a+=4.5){B.box(xx+a,h*.5,zz+hd/2+.22,.35,h,.4,'steel',false,true);B.box(xx+a,h*.68,zz+hd/2+.46,3.5,2.1,.06,'glass',false,true);}
    const teeth=4,span=hd/teeth;
    for(let i=0;i<teeth;i++){const z0=zz-hd/2+i*span,geo=new THREE.BufferGeometry(),p=[],a=[xx-hw/2,h+.02,z0],bb=[xx+hw/2,h+.02,z0],c=[xx+hw/2,h+3,z0+span*.8],e=[xx-hw/2,h+3,z0+span*.8];p.push(...a,...e,...c,...a,...c,...bb);geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.computeVertexNormals();addGeo(geo,'steel');B.box(xx,h+1.5,z0+span*.8+.08,hw,2.9,.12,'glass',false,true);}
    for(let i=0;i<2;i++)tank(x+w*.29,z-d*.25+i*12,4.2,16+r()*8);
    const gx=x,gz=z+d*.28,gh=23;
    for(const s of[-1,1]){B.box(gx+s*w*.34,gh/2,gz,1.3,gh,1.6,'rust',true);B.box(gx+s*w*.34,2,gz,2,4,2.2,'steel',true);}
    B.box(gx,gh,gz,w*.72,1,2.2,'rust',false,true);B.box(gx,gh-3,gz,w*.72,.4,.4,'steel',false,true);
    for(let a=-w*.34;a<w*.32;a+=5)B.beam(V(gx+a,gh,gz),V(gx+a+4.7,gh-3,gz),.17,'steel',true);
    B.box(gx+w*.15,gh-4,gz,.09,7,.09,'black',false,true);pipe([xx-hw*.22,1,zz+hd/2+.8],[xx-hw*.22,h+8,zz+hd/2+.8],.6,'steel');
    for(let i=0;i<3;i++){const cx=x-w*.25+i*7,cz=z+d*.25;B.box(cx,1.65,cz,5.7,2.7,3.2,i%2?'oxide':'blue',true);for(let j=0;j<6;j++)B.box(cx-2.5+j,1.7,cz+1.66,.09,2.4,.1,'steel',false,true);}
    sign('F / '+String(b.i*6+b.j).padStart(2,'0'),xx,h*.75,zz+hd/2+.7,7,2,0,'#e8ac6c');
  }
  function relay(b,r){
    const{x,z,w,d}=b,ww=w*.47,dd=d*.55,xx=x-w*.13,zz=z-d*.12,h=(37+r()*30)*data.heightMultiplier,y=shell(xx,zz,ww,dd,.28,h,'carbon',2.6,.91,0,'steel'),segs=5,hh=(h-5)/segs;
    for(let k=0;k<segs;k++)for(const s of[-1,1]){B.box(xx,4+k*hh+hh*.47,zz+s*(dd/2+.28),ww-5,hh-.55,.4,k%2?'dark':'panel',false,true);B.box(xx,4+k*hh,zz+s*(dd/2+.55),ww-5,.13,.09,'cyan',false,true);B.box(xx+s*(ww/2+.25),4+k*hh+hh*.47,zz,.35,hh-.55,dd-5,'dark',false,true);}
    for(const s of[-1,1])for(let a=-ww*.33;a<ww*.36;a+=3.8)B.box(xx+a,h/2,zz+s*(dd/2+.64),.38,h-1,1,'steel',false,true);
    for(let i=0;i<3;i++){const px=x+w*.31,pz=z-d*.28+i*9;tank(px,pz,2.6,10+r()*3);pipe([px,6,pz],[xx+ww/2+.5,6,pz],.37,'copper');}
    roofkit(xx,zz,ww*.8,dd*.8,y,r);const dish=new THREE.TorusGeometry(3.8,.22,6,24);dish.rotateX(.5);dish.translate(xx,y+5,zz);addGeo(dish,'light');B.beam(V(xx,y,zz),V(xx,y+5,zz),.45,'steel',true);
    B.box(x-w*.2,2,z+d*.28,9,3.4,5,'dark',true);sign('RELAY '+(b.j+1),xx,h*.63,zz+dd/2+1.25,ww*.74,3.8,0,'#88c1ca','RESTRICTED / NETWORK CORE');
  }
  function stacks(b,r){
    const{x,z,w,d}=b,innerW=w-17,innerD=d-17,bw=(innerW-4)/3;
    for(let i=0;i<3;i++){const xx=x-innerW/2+bw/2+i*(bw+2),zz=z-innerD/2+6.5,h=(24+r()*32)*data.heightMultiplier,mat=pick(r,['facSand','facIvory','facBlue']),roof=shell(xx,zz,bw,13,.28,h,mat,.6,1,0,'dark');panels(xx,zz,bw,h,13,.28,'steel',Math.max(4,bw*.5));roofkit(xx,zz,bw,13,roof,r);
      for(let y=10;y<h-2;y+=7){B.box(xx,y,zz+7.5,bw-1.1,.35,2.8,'steel',true);rail(xx-bw/2+1,zz+8.8,xx+bw/2-1,zz+8.8,y+.18);B.box(xx-bw*.26,y+1.7,zz+7,bw*.34,2.8,1.4,'sand',false,true);}}
    for(const s of[-1,1]){const xx=x+s*(innerW/2-5),zz=z+8,hh=19+r()*22;shell(xx,zz,10,innerD*.38,.28,hh,'facRust',.5,1,0,'dark');pipe([xx-s*5.4,1,zz],[xx-s*5.4,hh+2,zz],.23,'copper');}
    for(const s of[-1,1])storefront(x+s*w*.20,z+d/2-9,Math.min(14,w*.28),.28,s===1?'SOMA / MARKET':'KINETIC REPAIR','ochre');
    const yy=22,points=[V(x-innerW*.45,yy,z+1),V(x,yy-2.4,z+1),V(x+innerW*.45,yy,z+1)],curve=new THREE.CatmullRomCurve3(points).getPoints(14);for(let i=0;i<14;i++)B.beam(curve[i],curve[i+1],.055,'black',true);B.box(x,1.1,z,4,1.6,2.2,'steel',true);
  }
  function market(b,r){
    const{x,z,w,d}=b,ww=w-17,dd=d-17,bw=(ww-5)/3;
    for(let i=0;i<3;i++)for(const s of[-1,1]){const xx=x-ww/2+bw/2+i*(bw+2.5),zz=z+s*(dd/2-6.5),h=(12+r()*16)*data.heightMultiplier;shell(xx,zz,bw,13,.28,h,pick(r,['facMarket','facSand','facBlue']),.6,1,0,'dark');roofkit(xx,zz,bw,13,h+.28,r);
      if(s===1)storefront(xx,zz+5.8,bw-.4,.28,['AFTERHOURS','RAMEN 09','BODY MOD'][i],pick(r,['oxide','ochre','panel']));else if(i!==1)storefront(xx,zz+8.8,bw-.4,.28,['RELAY TEA','ION','HARDLINE'][i],'oxide');
      if(i===0){B.box(xx-bw/2-.35,h*.65,zz+6.5,1.5,7,.6,'dark',false,true);sign('ION',xx-bw/2-.35,h*.65,zz+6.85,1.15,5.5,0,'#e2ac7c');}}
    for(const s of[-1,1])for(let i=0;i<2;i++){const xx=x+s*(ww/2-3),zz=z-4+i*8;B.box(xx,1,zz,4,1.4,2.8,'rust',true);B.box(xx,3.1,zz,4.7,.18,4.1,s===1?'ochre':'oxide',true);for(const a of[-1,1])B.box(xx+a*1.9,1.8,zz-1.2,.07,2.6,.07,'steel',false,true);}
    B.box(x,7.9,z,6,.45,dd-12,'dark',true);for(const s of[-1,1])rail(x+s*2.6,z-dd/2+6,x+s*2.6,z+dd/2-6,8.12);
    sign('NIGHTMARKET',x,14.2,z+d/2+.22,Math.min(23,w*.55),1.3,0,'#ebbd8a','FOOD / MODS / REPAIRS');
  }
  function garden(b,r){
    const{x,z,w,d}=b,ww=w-18,dd=d*.5,xx=x,zz=z-d*.15,tiers=4,step=5.5;let tw=ww,td=dd,tz=zz;
    for(let k=0;k<tiers;k++){const base=.28+k*step,hh=step-.04;shell(xx,tz,tw,td,base,hh,'facIvory',1.8,1,0,'ceramic');plant(xx,tz+td/2-1.2,tw-4,1.6,base+hh+.04);for(const sx of[-1,1])plant(xx+sx*(tw/2-1.1),tz,1.4,Math.max(3,td-5),base+hh+.04);tw-=6;td-=4;tz-=1.6;}
    const poolZ=z+d*.28;B.box(x,.5,poolZ,ww*.7,.45,6,'ceramic',true);flat(x,poolZ,ww*.7-1,5,.73,'water');
    for(const s of[-1,1]){plant(x+s*w*.31,poolZ,4,4,.28);tree(x+s*w*.31,poolZ,.7,r);}for(const s of[-1,1])B.beam(V(x+s*ww*.4,0.3,zz+dd/2+2),V(x+s*ww*.2,25,zz-dd*.25),.38,'ivory',true);
  }
  function upperBridge(l){
    const a=data.blocks.find(b=>b.id===l.a),b=data.blocks.find(b=>b.id===l.b),along=l.axis==='x',y=l.y,a0=along?a.x+a.w/2:a.z+a.d/2,b0=along?b.x-b.w/2:b.z-b.d/2,len=b0-a0,x=along?(a0+b0)/2:a.x,z=along?a.z:(a0+b0)/2,w=l.width;
    slab(x,z,along?len:w,along?w:len,y,1.25,'concrete','bridge');
    for(const s of[-1,1]){const xx=x+(along?0:s*(w/2-.18)),zz=z+(along?s*(w/2-.18):0);rail(xx-(along?len/2:0),zz-(along?0:len/2),xx+(along?len/2:0),zz+(along?0:len/2),y);B.box(xx,y-2.4,zz,along?len:.28,.3,along?.28:len,'steel',false,true);const n=Math.ceil(len/4),step=len/n;for(let t=0;t<n;t++){const k=-len/2+t*step;B.beam(V(xx+(along?k:0),y-1.5,zz+(along?0:k)),V(xx+(along?k+step:0),y-2.4,zz+(along?0:k+step)),.14,'steel',true);}}
    if(a.district!==b.district)sign(DISTRICTS[b.district].short,x,y-1.7,z+(along?w/2+.16:.16),along?Math.min(10,len-2):w-.4,1.1,0,DISTRICTS[b.district].color);
  }
  function stairs(b){
    if(!b.deck||b.i%2!==0||b.j%2!==1)return;const x=b.x+b.w/2-7.3,z=b.z-b.d/2+8,n=26,run=9;
    for(let i=0;i<n;i++){const h=(i+1)*8/n;B.box(x,.28+h/2,z+(i+.5)*run/n,2.2,h,run/n-.015,'concrete',true);B.box(x-2.7,8.28+h/2,z+run-(i+.5)*run/n,2.2,h,run/n-.015,'concrete',true);}B.box(x-1.35,8.15,z+run+1.2,5.2,.26,2.4,'concrete',true);
  }
  streetGrid();const builders=[foundry,crown,relay,stacks,market,garden];for(const b of data.blocks){deck(b);builders[b.district](b,rng(b.seed));stairs(b);}for(const l of data.upperLinks)upperBridge(l);
  const r=rng(data.seed+':horizon');for(let i=0;i<62;i++){const side=i%4,x=side<2?-380+r()*760:(side===2?-370:370)+(r()-.5)*70,z=side<2?(side===0?-365:365)+(r()-.5)*65:-300+r()*600,h=28+r()*90,w=13+r()*20,d=15+r()*20;shell(x,z,w,d,-.4,h,pick(r,['facDark','facBlue','facSand']),1.3,1,0,'dark',false);}
  return {ground,decks,buildings,artifacts};
}
export function auditDistricts(data,compiled){
  const errors=[],pairs=[],overlaps=(a,b)=>Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2)>1e-4&&Math.min(a.z+a.d/2,b.z+b.d/2)-Math.max(a.z-a.d/2,b.z-b.d/2)>1e-4;
  for(const group of[compiled.ground,compiled.decks])for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)if(Math.abs(group[i].y-group[j].y)<.001&&overlaps(group[i],group[j]))pairs.push([i,j,group[i].kind]);
  if(pairs.length)errors.push(`${pairs.length} overlapping coplanar owned surfaces`);
  const{x:xs,z:zs,widthsX:wx,widthsZ:wz}=data.groundStreets;let blocked=0;
  for(const b of compiled.buildings){if(b.base>=12||b.x<xs[0]||b.x>xs[6]||b.z<zs[0]||b.z>zs[6])continue;for(let i=0;i<7;i++)if(b.x-b.w/2<xs[i]+wx[i]/2&&b.x+b.w/2>xs[i]-wx[i]/2)blocked++;for(let i=0;i<7;i++)if(b.z-b.d/2<zs[i]+wz[i]/2&&b.z+b.d/2>zs[i]-wz[i]/2)blocked++;}
  if(blocked)errors.push(`${blocked} building/road conflicts`);
  return{ok:!errors.length,errors,ownedSurfaces:compiled.ground.length+compiled.decks.length,coplanarOverlapPairs:pairs.length,roadConflicts:blocked,districts:data.districts.map(d=>({name:d.name,blocks:d.blocks.length})),blocks:data.blocks.length,links:data.upperLinks.length};
}
