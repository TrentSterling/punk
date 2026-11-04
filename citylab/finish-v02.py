"""Corrections from the actual district browser captures."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'citylab.js';s=p.read_text();assert "const VERSION='0.2.0'" in s
s=s.replace('new THREE.SphereGeometry(1400,24,12)','new THREE.SphereGeometry(900,32,16)')
s=s.replace('scene.environment=envRT.texture;','scene.environment=envRT.texture;scene.environmentIntensity=.55;')
s=s.replace('hemi.intensity=1.55','hemi.intensity=1.05').replace('sun.intensity=3.1','sun.intensity=3.55').replace('fill.intensity=.45','fill.intensity=.25').replace('scene.fog.density=.00135','scene.fog.density=.0009')
s=s.replace('stepPlayer(dt);if(!url.searchParams','stepPlayer(dt);sky.position.copy(camera.position);if(!url.searchParams');assert 'sky.position.copy(camera.position)' in s
p.write_text(s)
p=ROOT/'districts.js';s=p.read_text();s=s.replace('floors=h/3.3;','floors=Math.max(1,Math.round(h/3.3));').replace('outer*=mix(.60,1.,seam);','outer*=mix(.87,1.,seam);').replace("'.375,.34'","'.345,.315'").replace('step(.79,seed)','step(.87,seed)').replace('vec3(.46,.24,.08)*opening','vec3(.16,.08,.025)*opening')
needle='    B.structures++;buildings.push(';assert needle in s
addition='''    // Physical sill profiles and mullions outside the single owned facade.
    if(solid && mat.startsWith('fac') && base<.6 && h>8){
      const nr=Math.max(1,Math.round(h/3.3)),story=h/nr;
      for(let i=0;i<p.length;i++){
        const j=(i+1)%p.length,[ax,az]=p[i],[bx,bz]=p[j],len=Math.hypot(bx-ax,bz-az);if(len<4)continue;
        const nx=(bz-az)/len,nz=-(bx-ax)/len;
        const at=(u,y0,off=.18)=>{const t=(y0-base)/h,scale=1+(topScale-1)*t;return V(x+(ax+(bx-ax)*u)*scale+shift*t+nx*off,y0,z+(az+(bz-az)*u)*scale+nz*off);};
        for(let row=1;row<nr;row++){const yy=base+row*story;B.beam(at(.025,yy),at(.975,yy),mat==='facGlass'?.09:.23,mat==='facGlass'?'steel':'concrete',true);}
        const bays=Math.max(1,Math.round(len/(mat==='facGlass'?2.6:3.1)));
        for(let k=1;k<bays;k+=mat==='facGlass'?1:2)B.beam(at(k/bays,base+.3,.10),at(k/bays,base+h-.3,.10),mat==='facGlass'?.075:.12,'steel',true);
      }
    }
'''
s=s.replace(needle,addition+needle)
needle='    roofkit(xx,zz,ww*.8,dd*.8,y,r);';assert needle in s
s=s.replace(needle,"    for(const side of[-1,1])for(let level=0;level<segs;level++)for(let f=0;f<6;f++)B.box(xx,5+level*hh+f*.45,zz+side*(dd/2+.72),ww-6,.12,.42,'steel',false,true);\n"+needle)
p.write_text(s)
print('Fixed sky clipping, added facade relief and cooling fins, adjusted daylight contrast.')
