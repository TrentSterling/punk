'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {rangeFor, startServer} = require('./server.cjs');
test('safe single byte ranges clamp ends and reject malformed/multipart ranges', () => {
  assert.equal(rangeFor(null, 10), null);
  assert.deepEqual(rangeFor('bytes=2-4', 10), {start:2,end:4});
  assert.deepEqual(rangeFor('bytes=-3', 10), {start:7,end:9});
  assert.deepEqual(rangeFor('bytes=6-', 10), {start:6,end:9});
  assert.deepEqual(rangeFor('bytes=0-99', 10), {start:0,end:9});
  for (const value of ['bytes=10-', 'bytes=5-3', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'units=0-1', 'bytes=Infinity-']) assert.equal(rangeFor(value, 10), false, value);
});
test('index.htm, immutable overrides, HEAD, binary ranges and path confinement', async () => {
  const output=process.env.PROJECT_SCREENSHOTS||path.join(__dirname,'artifacts');fs.mkdirSync(output,{recursive:true});
  const root = fs.mkdtempSync(path.join(output, '.server-test-'));
  const outside = path.join(root, '..', path.basename(root) + '.outside');
  fs.writeFileSync(path.join(root, 'index.htm'), 'current'); fs.writeFileSync(path.join(root, 'video.mp4'), Buffer.from('0123456789'));
  fs.writeFileSync(outside, 'secret'); fs.symlinkSync(outside, path.join(root, 'escape'));
  const server = await startServer({root, overrides:{'index.htm':'baseline'}});
  try {
    let response = await fetch(server.origin); assert.equal(await response.text(), 'baseline');
    response = await fetch(server.origin + '/video.mp4', {headers:{Range:'bytes=2-5'}}); assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/10'); assert.equal(await response.text(), '2345');
    response = await fetch(server.origin + '/video.mp4', {headers:{Range:'bytes=-2'}}); assert.equal(await response.text(), '89');
    response = await fetch(server.origin + '/video.mp4', {method:'HEAD',headers:{Range:'bytes=0-1'}}); assert.equal(response.status, 206); assert.equal(response.headers.get('content-length'), '2'); assert.equal(await response.text(), '');
    response = await fetch(server.origin + '/video.mp4', {headers:{Range:'bytes=100-'}}); assert.equal(response.status, 416);
    assert.equal((await fetch(server.origin + '/escape')).status, 403);
    assert.equal((await fetch(server.origin + '/%2e%2e%2foutside')).status, 403);
    assert.equal((await fetch(server.origin + '/video.mp4', {method:'POST'})).status, 405);
  } finally { await server.close(); fs.rmSync(root, {recursive:true,force:true}); fs.rmSync(outside, {force:true}); }
});

const {stripAllowed}=require('./source.cjs');
test('source normalization permits only root opt-in, one head block and the navbar',()=>{
  const before='<html lang="en">\n<head>\n<style>x</style>\n</head><body><nav id="magic-navbar-container">old</nav><p>keep</p></body></html>';
  const after=before.replace('<html lang="en">','<html lang="en" data-tront-theme-editor data-tront-theme-surface="project" data-te-project="native">').replace('</head>','\n    <!-- PROJECT THEME START: pinned local editor, native page adapter -->\n<script>config</script>\n    <!-- PROJECT THEME END -->\n</head>').replace('>old</nav>','>new</nav>');
  assert.equal(stripAllowed(before),stripAllowed(after));
  assert.notEqual(stripAllowed(before),stripAllowed(after.replace('<body>','<body data-te-project="native">')));
  assert.notEqual(stripAllowed(before),stripAllowed(after.replace('keep','changed')));
});

const {punkCanonical,stripCanonical,sha}=require('./source.cjs');
test('Punk self-canonical preserves every other released page byte and the existing identity',()=>{
  const root=path.resolve(__dirname,'../..'), html=fs.readFileSync(path.join(root,'index.htm'),'utf8');
  assert.equal((html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)||[]).length,1);
  assert.ok(html.match(/<head>[\s\S]*?<\/head>/)[0].includes(punkCanonical));
  assert.equal(fs.readFileSync(path.join(root,'CNAME'),'utf8').trim(),'punk.tront.xyz');
  assert.ok(html.includes('<meta property="og:url" content="https://punk.tront.xyz">'));
  assert.equal(sha(stripCanonical(html,'punk')),'2f82d197b3c5e1d151c4d2e28f22a4a96f276d7d400ec5913b4d729491ebc526');
});
test('canonical normalization is literal, head-only, project-only and cannot conceal other edits',()=>{
  const before='<html><head>\n<title>Keep</title>\n</head><body>Original copy</body></html>';
  const after=before.replace('</head>',punkCanonical+'</head>');
  assert.equal(stripCanonical(after,'punk'),before);
  assert.equal(stripCanonical(before,'punk'),before);
  assert.equal(stripCanonical(after,'monke'),after);
  assert.equal(stripCanonical(stripCanonical(after,'punk'),'punk'),before);
  for(const changed of [after.replace(punkCanonical,punkCanonical+punkCanonical),after.replace('https://punk.tront.xyz/','https://tront.xyz/'),after.replace('Original copy','Changed copy'),before.replace('</body>',punkCanonical+'</body>')]) assert.notEqual(stripCanonical(changed,'punk'),before);
});
