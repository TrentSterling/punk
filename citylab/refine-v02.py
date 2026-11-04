"""Repair near-coplanar detail surfaces with asserted preimages."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'districts.js';s=p.read_text()
def swap(old,new):
 global s
 assert s.count(old)==1,(old[:90],s.count(old))
 s=s.replace(old,new)
swap("B.box(xx,y+.7,zz,2.4,1.4,2.3,'steel',true);flat(xx,zz,2.05,1.95,y+1.405,'black');", """B.box(xx,y+.58,zz,2.4,1.16,2.3,'steel',true);
      B.box(xx,y+1.28,zz-1.075,2.4,.24,.15,'steel',false,true);B.box(xx,y+1.28,zz+1.075,2.4,.24,.15,'steel',false,true);
      B.box(xx-1.125,y+1.28,zz,.15,.24,2,'steel',false,true);B.box(xx+1.125,y+1.28,zz,.15,.24,2,'steel',false,true);
      flat(xx,zz,2.1,2,y+1.22,'black');""")
swap("B.box(x,y+.23,z,w,.46,d,'dark',true);flat(x,z,w-.24,d-.24,y+.47,'green');", """B.box(x,y+.14,z,w,.28,d,'dark',true);
    B.box(x,y+.37,z-d/2+.08,w,.18,.16,'dark',false,true);B.box(x,y+.37,z+d/2-.08,w,.18,.16,'dark',false,true);
    B.box(x-w/2+.08,y+.37,z,.16,.18,d-.32,'dark',false,true);B.box(x+w/2-.08,y+.37,z,.16,.18,d-.32,'dark',false,true);
    flat(x,z,w-.32,d-.32,y+.34,'green');""")
swap("B.box(x,.5,poolZ,ww*.7,.45,6,'ceramic',true);flat(x,poolZ,ww*.7-1,5,.73,'water');", """const pw=ww*.7;B.box(x,.32,poolZ,pw,.08,6,'ceramic',true);
    B.box(x,.55,poolZ-2.75,pw,.5,.5,'ceramic',true);B.box(x,.55,poolZ+2.75,pw,.5,.5,'ceramic',true);
    B.box(x-pw/2+.25,.55,poolZ,.5,.5,5,'ceramic',true);B.box(x+pw/2-.25,.55,poolZ,.5,.5,5,'ceramic',true);
    flat(x,poolZ,pw-1,5,.56,'water');""")
p.write_text(s)
p=ROOT/'citylab.js';s=p.read_text();old="x-Math.sin(rot)*.11,y,z-Math.cos(rot)*.11";assert old in s;s=s.replace(old,"x-Math.sin(rot)*.2,y,z-Math.cos(rot)*.2");p.write_text(s)
print('Recessed intakes, planter soil and basin water; increased sign backing clearance.')
