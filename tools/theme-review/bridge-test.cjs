'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('page RGB bridge only recolors custom state, settles, and restores native roles', () => {
  const values = new Map([['--te-accent','#abcdef'],['--te-secondary','#123456'],['--te-orange','#fedcba'],['--te-grid-x','#102030'],['--te-panel','#202020'],['--te-bg','#101010']]);
  let state = 'native', sync, writes = 0;
  const html = { getAttribute: () => state, style: {
    getPropertyValue: k => values.get(k) || '', setProperty(k,v) { writes++; values.set(k,v); }, removeProperty(k) { writes++; values.delete(k); }
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../assets/js/project-theme.js'),'utf8'), {
    document: {documentElement:html}, MutationObserver: class {constructor(f){sync=f;} observe(){}}
  });
  assert.equal(writes,0,'native load never overwrites native RGB roles');
  state='custom'; sync(); assert.ok(writes > 0); assert.equal(values.get('--project-bg-rgb'),'16, 16, 16');
  const settled=writes; sync(); assert.equal(writes,settled,'observer is stable, not a mutation loop');
  state='native'; sync(); assert.equal(values.has('--project-bg-rgb'),false);
  assert.ok([...values.keys()].every(k=>k.startsWith('--te-')),'native reset removes only adapter-owned inline roles');
});
