import * as THREE from './vendor/build/three.module.js';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./districts.js',import.meta.url),'utf8').replace("from 'three'",`from '${new URL('./vendor/build/three.module.js',import.meta.url).href}'`);
const {planCity,compileDistricts,auditDistricts}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const reports=[];
for(const height of[.55,1,1.6])for(const seed of['HACKERPUNK-02','HP-QA-1','HP-QA-2','HP-QA-3','HP-QA-99']){
 const B={merge:new Map(),structures:0,box(){},instance(){},beam(){}};
 const p=planCity(seed,height),c=compileDistricts({B,mats:{},sign(){},rail(){},pipe(){},indexCollider(){}},p),a=auditDistricts(p,c);
 const d=JSON.stringify(p)===JSON.stringify(planCity(seed,height));
 for(const gs of B.merge.values())for(const g of gs)g.dispose();
 reports.push({seed,height,deterministic:d,buildings:c.buildings.length,...a});
}
console.log(JSON.stringify(reports,null,2));fs.mkdirSync('qa-v02',{recursive:true});fs.writeFileSync('qa-v02/geometry.json',JSON.stringify(reports,null,2));if(reports.some(a=>!a.ok||!a.deterministic))process.exitCode=1;
