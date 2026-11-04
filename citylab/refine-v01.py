"""One-time, preimage-checked visual corrections from the first rendered review."""
from pathlib import Path
from hashlib import sha256
p=Path(__file__).with_name('citylab.js')
s=p.read_text()
assert sha256(p.read_bytes()).hexdigest()=='3b4830c877c6ddea97d72a1a5216e62e2f744def15d86bc43b397903bf2c2b8a', 'Unexpected source revision; refusing to overwrite it.'
def replace(old,new):
 global s
 assert s.count(old)==1, (old[:100],s.count(old))
 s=s.replace(old,new)
replace("const VERSION='0.1.0'", "const VERSION='0.1.1'")
replace("renderer.shadowMap.type=THREE.PCFSoftShadowMap;", "renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;")
replace("m.castShadow=m.receiveShadow=true;g.add(m);", "m.castShadow=false;m.receiveShadow=true;g.add(m);")
replace("B.box(xa,y-1.15,za,alongX?len:.4,.7,alongX?.4:len,'steel');", "B.box(xa,y-1.15,za,alongX?len:.4,.7,alongX?.4:len,'steel');B.box(xa,y-3.2,za,alongX?len:.24,.26,alongX?.24:len,'steel');for(const end of[-1,1])B.box(xa+(alongX?end*len/2:0),y-2.1,za+(alongX?0:end*len/2),.23,2.2,.23,'steel');")
replace("B.box(0,-.5,0,320,1,320,'asphalt',true);", "B.box(0,-1.1,0,2048,1,2048,'asphalt',false);B.box(0,-.5,0,320,1,320,'asphalt',true);")
replace("{name:'Upper streets',p:[-21,19.1,38],look:[31,33,-32]}", "{name:'Upper streets',p:[0,18,31],look:[31,29,-22]}")
replace("setView(Number(url.searchParams.get('view')||0))", "setView(Number(url.searchParams.get('view')||1))")
replace("CITYLAB 0.1 / ", "CITYLAB 0.1.1 / ")
replace("recipe.blocks.forEach(block);recipe.upperLinks", "recipe.blocks.forEach(block);recipe.blocks.forEach(refineBlock);contextCity();recipe.upperLinks")
extra=r'''
// The first screenshot review exposed blank support faces, missing truss chords,
// an inside-building camera and a skyline with no ground. This pass addresses
// those measured issues while leaving street reservations and recipes unchanged.
function techPanel(x,y,z,w,h,nx,nz){
  const side=nx!==0;
  const plate=(u,v,depth,pw,ph,pd,mat)=>B.box(x+(side?nx*depth:u),y+v,z+(side?u:nz*depth),side?pd:pw,ph,side?pw:pd,mat,false,true);
  plate(0,0,0,w,h,.12,'dark');
  plate(0,0,.08,w-.18,h-.18,.1,'panel');
  plate(0,h*.31,.15,w*.76,.16,.06,'steel');
  plate(-w*.22,-h*.1,.16,w*.35,h*.38,.08,'black');
  for(let i=0;i<4;i++)plate(-w*.22,-h*.24+i*h*.09,.22,w*.28,.045,.06,'steel');
  plate(w*.22,-h*.08,.17,w*.22,h*.42,.08,'sand');
  plate(w*.22,-h*.31,.23,w*.2,.075,.04,'amber');
  for(const a of[-1,1])for(const b of[-1,1])plate(a*w*.4,b*h*.4,.17,.08,.08,.05,'copper');
}
function refineBlock(b){
  const {x,z,w,d}=b;
  if(b.deck){
    for(const sx of[-1,1])for(const sz of[-1,1]){
      const px=x+sx*(w/2-2),pz=z+sz*(d/2-2);
      for(const y of[5.1,10.2]){techPanel(px+sx*1.29,y,pz,1.85,2.5,sx,0);techPanel(px,y,pz+sz*1.29,1.85,2.5,0,sz);}
      for(const y of[3,7.7,12.6])B.box(px,y,pz,2.64,.14,2.64,'steel',false,true);
    }
    for(const sz of[-1,1])for(let t=-w/2+4;t<w/2-2;t+=6){
      B.box(x+t,14.93,z+sz*(d/2+.07),3.8,.68,.1,'dark',false,true);
      B.box(x+t,14.98,z+sz*(d/2+.15),3.45,.35,.1,'steel',false,true);
      B.box(x+t-1.25,14.96,z+sz*(d/2+.22),.22,.2,.04,'amber',false,true);
    }
    for(const sx of[-1,1])for(let t=-d/2+4;t<d/2-2;t+=6){
      B.box(x+sx*(w/2+.07),14.93,z+t,.1,.68,3.8,'dark',false,true);
      B.box(x+sx*(w/2+.15),14.98,z+t,.1,.35,3.45,'steel',false,true);
    }
  }
  techPanel(x-w*.28,1.55,z+d*.28+1.96,3.7,1.5,0,1);
  if(b.hero)for(const side of[-1,1]){
    B.beam(v3(x+side*18,16,z+5.1),v3(x+side*15.8,36,z+5.1),.85,'steel');
    B.box(x+side*15.8,47,z+5.4,1.15,20,.8,'dark',false,true);
    B.box(x+side*15.8,47,z+5.85,.26,17,.1,'amber',false,true);
  }
}
function contextCity(){
  const r=random(config.seed+':context');
  // Background-only urban fabric; the playable district stays at 16 blocks.
  for(let gx=-4;gx<=4;gx++)for(let gz=-4;gz<=4;gz++){
    if(Math.abs(gx)<=2&&Math.abs(gz)<=2)continue;
    const x=gx*60+24,z=gz*60+23,w=22+r()*10,d=22+r()*9,h=18+r()*44;
    const tone=pick(r,['panel','concrete','dark','sand']);
    B.box(x,.1,z,42,1.2,42,'pavement');
    B.box(x,h/2,z,w,h,d,tone);
    B.box(x,h+.2,z,w+1,.5,d+1,'steel');
    B.box(x,h+1.3,z,w*.32,2.4,d*.3,'dark');
    for(let y=3;y<h-2;y+=4)for(const sign of[-1,1]){
      B.box(x,y,z+sign*(d/2+.08),w-2,1.3,.13,'glass',false,true);
      B.box(x+sign*(w/2+.08),y,z,.13,1.3,d-2,'glass',false,true);
      if(r()>.75)B.box(x-w*.22,y,z+sign*(d/2+.16),3,.8,.06,'warm',false,true);
    }
    for(const sign of[-1,1]){
      B.box(x+sign*(w/2-.8),h/2,z+d/2+.2,.3,h,.4,'steel',false,true);
      B.box(x+sign*(w/2-.8),h/2,z-d/2-.2,.3,h,.4,'steel',false,true);
    }
  }
}
'''
replace('function regenerate(seed=config.seed){',extra+'\nfunction regenerate(seed=config.seed){')
p.write_text(s)
print('Refined renderer source:',sha256(p.read_bytes()).hexdigest())
