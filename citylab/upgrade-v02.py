"""Apply the reviewed v0.2 renderer integration to the exact v0.1.1 preimage."""
from pathlib import Path
from hashlib import sha1
ROOT=Path(__file__).resolve().parent
p=ROOT/'citylab.js';raw=p.read_bytes()
assert sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()=='58ef7f052127edb966cd08dd9958a14612ad89c8','Source changed; refusing stale patch'
s=raw.decode()
s=s.replace("import * as THREE from 'three';", "import * as THREE from 'three';\nimport { DISTRICTS, planCity, compileDistricts, auditDistricts, addDistrictMaterials } from './districts.js';")
s=s.replace("const VERSION='0.1.1'","const VERSION='0.2.0'").replace("'HACKERPUNK-01'","'HACKERPUNK-02'")
s=s.replace('62,innerWidth/innerHeight,.12,2000','65,innerWidth/innerHeight,.25,1400')
s=s.replace('shadow.camera.left=-190;sun.shadow.camera.right=190;sun.shadow.camera.top=190;sun.shadow.camera.bottom=-190','shadow.camera.left=-335;sun.shadow.camera.right=335;sun.shadow.camera.top=335;sun.shadow.camera.bottom=-335')
s=s.replace('sun.shadow.camera.far=550','sun.shadow.camera.far=850').replace('sun.position.set(-95,160,75)','sun.position.set(-200,340,210)')
s=s.replace('const originalEmissive=', 'addDistrictMaterials(mats,surface);\nconst originalEmissive=')
s=s.replace('float grain=cityHash(floor(vCityP*28.));', 'float grain=mix(.5,cityHash(floor(vCityP*28.)),1.-clamp(length(fwidth(vCityP*28.)),0.,1.));')
s=s.replace('this.structures=0;', 'this.structures=0;this.seen=new Set();this.duplicatesRemoved=0;')
old="const key=[shape,mat,dress].join('|');"
new="const signature=[shape,x,y,z,w,h,d,rot,...(q?q.toArray():[])].map(n=>typeof n==='number'?n.toFixed(5):n).join('|');if(this.seen.has(signature)){this.duplicatesRemoved++;return;}this.seen.add(signature);const key=[shape,mat,dress].join('|');"
assert old in s;s=s.replace(old,new)
s=s.replace('m.castShadow=m.receiveShadow=true;m.userData={dress:false,original:mats[mat]};',"m.castShadow=mat!=='paint';m.receiveShadow=true;m.renderOrder=mat==='paint'?2:0;m.userData={dress:mat==='paint',original:mats[mat]};")
a=s.index('function makeRecipe(');e=s.index('function applyAppearance(');part=s[a:e];helpers=[]
for name in ['sign','pipe','rail','disposeCity']:
 start=part.index('function '+name+'(');helpers.append(part[start:part.index('\n',start)])
regen="""let compiled=null;
function makeRecipe(seed,height=1){return planCity(seed,height);}
function regenerate(seed=config.seed){
  const start=performance.now();config.seed=String(seed).slice(0,80)||'HACKERPUNK-02';
  disposeCity();recipe=planCity(config.seed,config.height);city=new THREE.Group();city.name='HACKERPUNK / '+config.seed;scene.add(city);B=new Builder(city);
  compiled=compileDistricts({B,mats,sign,rail,pipe,indexCollider},recipe);B.finish();applyAppearance();
  generationMs=performance.now()-start;hudDirty=true;const next=new URL(location.href);next.searchParams.set('seed',config.seed);try{history.replaceState(null,'',next);}catch{}
  if(player)player.grapple=null;renderer.shadowMap.needsUpdate=true;return getStats();
}
"""
s=s[:a]+'\n'.join(helpers)+'\n'+regen+s[e:]
s=s.replace('scene.fog.density=.0023','scene.fog.density=.00135').replace('hemi.intensity=2.15','hemi.intensity=1.55').replace('sun.intensity=3.6','sun.intensity=3.1')
s=s.replace('hemi.groundColor.set(0x455059)','hemi.groundColor.set(0x303d48)').replace('bloom.strength=.23','bloom.strength=.16')
s=s.replace('Math.abs(player.feet.x)>150||Math.abs(player.feet.z)>150','Math.abs(player.feet.x)>270||Math.abs(player.feet.z)>270').replace('player.feet.y>25','player.feet.y>220')
start=s.index('const views=[');end=s.index('\nfunction setView',start)
s=s[:start]+"""const views=[
{name:'Central avenue',p:[-6,3.1,42],look:[25,38,-72]},
{name:'District overview',p:[318,255,370],look:[0,18,0]},
{name:'Upper city',p:[0,18,34],look:[-55,28,-45]},
{name:'The Foundry',p:[-179,25,-87],look:[-206,10,-120]},
{name:'Corporate Crown',p:[-35,38,15],look:[34,70,-40]},
{name:'Relay data ward',p:[172,30,-64],look:[124,26,-110]},
{name:'The Stacks',p:[-172,25,105],look:[-211,18,110]},
{name:'Nightmarket',p:[-6,4.1,106],look:[-42,14,103]},
{name:'Garden Terraces',p:[170,32,131],look:[121,12,110]}
];
let districtView=0;
function visitDistrict(n){districtView=(n+6)%6;setView(districtView+3);}
"""+s[end:]
s=s.replace('config.seed}   /   WASD','config.seed}   /   B next district   /   WASD').replace('CITYLAB 0.1.1 / ','CITYLAB 0.2 / ')
s=s.replace('`${recipe?.blocks.length||0} BLOCKS','`${recipe?.districts.length||0} DISTRICTS   ${recipe?.blocks.length||0} BLOCKS')
s=s.replace("setView(Number(url.searchParams.get('view')||1))","setView(Number(url.searchParams.get('view')||0))")
s=s.replace("case'KeyF':startWalk();","case'KeyB':visitDistrict(districtView+1);break;case'KeyF':startWalk();")
s=s.replace("'V / Tab       Next viewpoint / hide UI'","'V / B         Viewpoint / district tour','Tab           Hide UI'")
s=s.replace('const dt=Math.min((now-last)/1000,.05);last=now;','const elapsed=(now-last)/1000,dt=Math.min(elapsed,.05);last=now;').replace('frameCount++;frameTime+=dt;','frameCount++;frameTime+=elapsed;')
s=s.replace('const y=H-64;',"""const mapX=W-204,mapY=80,scale=.29;hc.fillStyle='rgba(9,19,27,.84)';hc.fillRect(mapX-9,mapY-9,187,183);
for(const b of recipe.blocks){hc.fillStyle=DISTRICTS[b.district].color;hc.globalAlpha=.48;hc.fillRect(mapX+(b.x+260)*scale,mapY+(b.z+240)*scale,b.w*scale,b.d*scale);}hc.globalAlpha=1;
hc.fillStyle='#ffffff';hc.beginPath();hc.arc(mapX+(camera.position.x+260)*scale,mapY+(camera.position.z+240)*scale,3,0,Math.PI*2);hc.fill();
hc.fillStyle='#cad9df';hc.font='11px monospace';hc.fillText('B  DISTRICT TOUR',mapX+5,mapY+166);
const local=recipe.blocks.find(b=>Math.abs(camera.position.x-b.x)<b.w/2+12&&Math.abs(camera.position.z-b.z)<b.d/2+12);
if(local){hc.fillStyle=DISTRICTS[local.district].color;hc.font='13px monospace';hc.fillText(DISTRICTS[local.district].name,44,87);}
const y=H-64;""")
s=s.replace('version:VERSION,seed:config.seed,blocks:','version:VERSION,seed:config.seed,districts:recipe?.districts.length,duplicatesRemoved:B?.duplicatesRemoved,buildings:compiled?.buildings.length,blocks:')
a=s.index('function validate(){');e=s.index("window.addEventListener('keydown'",a)
s=s[:a]+"function validate(){const audit=auditDistricts(recipe,compiled);const deterministic=JSON.stringify(planCity(config.seed,config.height))===JSON.stringify(planCity(config.seed,config.height));return{...audit,deterministic,ok:audit.ok&&deterministic};}\n"+s[e:]
s=s.replace('ready:true,version:VERSION,regenerate,setView,lighting','ready:true,version:VERSION,regenerate,setView,visitDistrict,lighting')
s=s.replace('config};requestAnimationFrame(frame);','config,getCompiled:()=>compiled,renderer,scene,camera};requestAnimationFrame(frame);')
s=s.replace('const doc={...recipe,settings:','const doc={...recipe,compiledArchitecture:compiled.buildings,settings:')
p.write_text(s)
p=ROOT/'index.html';s=p.read_text().replace('Citylab 0.1','Citylab 0.2').replace('./citylab.js"','./citylab.js?v=0.2.0"');p.write_text(s)
p=ROOT/'build_standalone.py';s=p.read_text().replace('<script type="module" src="./citylab.js"></script>','<script type="module" src="./citylab.js?v=0.2.0"></script>').replace('HACKERPUNK-Citylab-v0.1.html','HACKERPUNK-Citylab-v0.2.html');p.write_text(s)
print('Applied Citylab v0.2 integration')
