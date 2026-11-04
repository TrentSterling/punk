import * as THREE from './vendor/build/three.module.js';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./citylab.js',import.meta.url),'utf8');
const movement=src.slice(src.indexOf('const player={'),src.indexOf('const grappleGeo='));
const fn=new Function('THREE', `
const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),clamp=THREE.MathUtils.clamp;
const camera=new THREE.PerspectiveCamera(62,1,.1,1000);camera.rotation.order='YXZ';let hudDirty=false;
const collision=[],spatial=new Map();
function add(c){const id=collision.length;collision.push(c);for(let x=Math.floor(c.min.x/12);x<=Math.floor(c.max.x/12);x++)for(let z=Math.floor(c.min.z/12);z<=Math.floor(c.max.z/12);z++){const key=x+','+z;if(!spatial.has(key))spatial.set(key,[]);spatial.get(key).push(id);}}
add(new THREE.Box3(v3(-100,-1,-100),v3(100,0,100)));
add(new THREE.Box3(v3(-5,0,-2),v3(5,10,2)));
${movement}
player.mode='walk';player.feet.set(0,.1,2.6);keys.add('KeyW');keys.add('KeyE');
let climbPeak=0;for(let i=0;i<240;i++){stepPlayer(1/60);climbPeak=Math.max(climbPeak,player.feet.y);}
const climb={feet:player.feet.toArray(),peak:climbPeak,climbed:climbPeak>9.9};
keys.clear();player.feet.set(15,.1,15);player.velocity.set(0,0,0);
for(let i=0;i<60;i++)stepPlayer(1/60);
const ground={feet:player.feet.toArray(),grounded:player.grounded};
keys.add('Space');let peak=0;for(let i=0;i<120;i++){stepPlayer(1/60);peak=Math.max(peak,player.feet.y);}
const jump={peak,landed:player.grounded};
return {climb,ground,jump};`);
const r=fn(THREE);console.log(JSON.stringify(r,null,2));if(!r.climb.climbed||!r.ground.grounded||r.jump.peak<.7||!r.jump.landed)process.exitCode=1;
