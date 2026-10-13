'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createHash } = crypto;
const root = path.resolve(__dirname, '../..');
const expected = {
    'assets/js/tront-system.js': 'fd835c85a2d4c4f0ee779023d9f6cb0c80348ec9',
    'assets/js/tront-theme-editor.js': '1d2bd90bbdd0dd9b8f29edfd0cc4523e0ff70afe',
    'assets/css/tront-theme-editor.css': 'a17241890ccc42b0f94f24c28ba7a41973e110a7',
    'assets/css/tront-navbar.css': '4ce4315939fdc2b16cbdf8664413311cb9b0432e'
};
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = Object.entries(expected).map(([file, hash]) => {
    const source = fs.readFileSync(path.join(__dirname, 'upstream', file));
    const shipped = fs.readFileSync(path.join(root, file));
    if (gitBlob(source) !== hash) throw new Error(`Upstream source hash mismatch: ${file}`);
    return { path: file, upstreamGitBlob: hash, upstreamSha256: sha256(source),
        shippedGitBlob: gitBlob(shipped), shippedSha256: sha256(shipped),
        modified: !source.equals(shipped) };
});
const testSource = fs.readFileSync(path.join(__dirname, 'upstream-test.cjs.txt'));
if (gitBlob(testSource) !== '03604657134dba7cd4c79e0f022aa755f4ab124c') throw new Error('Upstream test source hash mismatch');
const manifest = { schema: 1, upstreamRepository: 'TrentSterling/trentsterling.github.io',
    upstreamCommit: '91d0a6874fbb4769d546574870e25c406a81608d',
    runtimeSourcing: 'same-origin committed assets; no runtime upstream fetch',
    files, testBasis: { path: 'tools/theme-editor/test.cjs', gitBlob: gitBlob(testSource), sha256: sha256(testSource) } };
fs.writeFileSync(path.join(__dirname, 'vendor-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Verified immutable source hashes and recorded shipped asset hashes.');
