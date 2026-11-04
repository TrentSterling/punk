"""Embed the pinned renderer modules into an offline, single-file HTML."""
from pathlib import Path
import re, json, base64, sys
ROOT=Path(__file__).resolve().parent
imports={}; visited=set()
def key(p):
 return 'three' if p==ROOT/'vendor/build/three.module.js' else '@city/'+p.relative_to(ROOT).as_posix()
def collect(p):
 p=p.resolve(); k=key(p)
 if p in visited:return k
 visited.add(p)
 text=p.read_text()
 def replace(m):
  spec=m.group(3)
  if spec=='three':dep=ROOT/'vendor/build/three.module.js'
  elif spec.startswith('three/addons/'):dep=ROOT/'vendor/addons'/spec[len('three/addons/'):]
  elif spec.startswith('.'):dep=p.parent/spec
  else:return m.group(0)
  if not dep.exists():return m.group(0)
  dk=collect(dep)
  return m.group(1)+m.group(2)+dk+m.group(2)
 text=re.sub(r'(\bfrom\s*|\bimport\s*\(\s*)([\'\"])([^\'\"]+)\2',replace,text)
 imports[k]='data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
 return k
entry=collect(ROOT/'citylab.js')
html=(ROOT/'index.html').read_text()
html=re.sub(r'<script type="importmap">.*?</script>','<script type="importmap">'+json.dumps({'imports':imports})+'</script>',html,flags=re.S)
html=html.replace('<script type="module" src="./citylab.js"></script>',f'<script type="module">import "{entry}";</script>')
html=html.replace('This hosted version needs access to cdn.jsdelivr.net. The downloadable build includes its dependencies.','This offline build includes its renderer; check that WebGL 2 is enabled.')
license_text=(ROOT/'vendor/THREE-LICENSE').read_text()
html=html.replace('</head>','<!-- Three.js license notice:\n'+license_text.replace('--','- -')+'\n-->\n</head>')
out=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'HACKERPUNK-Citylab-v0.1.html'
out.write_text(html)
print(f'Built {out}: {out.stat().st_size:,} bytes, {len(imports)} modules')
