'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const BASES = {punk:'cad83d925ad2ef79b1efad4ad7da726f58535543',monke:'91091d1f00ce3dc3d3a25f4ee9881c3050d96632'};
function argumentsFor(argv = process.argv.slice(2)) {
  const result = {project:process.env.PROJECT_ID, root:process.env.PROJECT_ROOT, baselineRoot:process.env.PROJECT_BASELINE_ROOT, output:process.env.PROJECT_SCREENSHOTS}; for (let i = 0; i < argv.length; i += 2) {if (!argv[i].startsWith('--') || argv[i+1] === undefined) throw Error('Expected --name value arguments'); result[argv[i].slice(2)] = argv[i+1];}
  if (!BASES[result.project]) throw Error('--project must be punk or monke');
  result.root = path.resolve(result.root || '.'); if(result.baselineRoot) result.baselineRoot=path.resolve(result.baselineRoot); result.baseline ||= BASES[result.project]; result.output = path.resolve(result.output || path.join(__dirname, 'artifacts',result.project));
  return result;
}
function git(root, args, opts = {}) {return execFileSync('git', ['-C', root, ...args], {maxBuffer:128*1024*1024, ...opts});}
function gitText(root, args) {return git(root,args).toString('utf8');}
function sha(value) {return crypto.createHash('sha256').update(value).digest('hex');}
const headBlock = /\n[ \t]*<!-- PROJECT THEME START: pinned local editor, native page adapter -->[\s\S]*?<!-- PROJECT THEME END -->\r?\n/;
const navBlock = /<nav\b[^>]*\bid=["']magic-navbar-container["'][^>]*>[\s\S]*?<\/nav>/;
function stripAllowed(html) {
  return html.replace(headBlock, '').replace(navBlock,'<nav data-test-allowed-replacement></nav>').replace(/<html\b[^>]*>/,tag=>tag.replace(/\sdata-tront-theme-editor(?:="[^"]*")?/g,'').replace(/\sdata-tront-theme-surface="project"/g,'').replace(/\sdata-te-project="native"/g,''));
}
function blocks(html, name) {return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'gi'))].map(match => match[0]);}
function sourceCheck(options) {
  const {root,project,baseline} = options;
  const report = {project,baseline,checks:[],media:[],errors:[],limitations:[]};
  const check = (name, pass, details) => {report.checks.push({name,pass,...(details === undefined ? {} : {details})});if(!pass)report.errors.push(name);};
  const baselineRoot = options.baselineRoot || root;
  const baselineRef = options.baselineRoot ? 'HEAD' : baseline;
  if(options.baselineRoot) check('baseline checkout matches pinned original commit',gitText(baselineRoot,['rev-parse','HEAD']).trim()===BASES[project]);
  const original = gitText(baselineRoot,['show',`${baselineRef}:index.htm`]);
  const current = fs.readFileSync(path.join(root,'index.htm'),'utf8');
  check('exactly one allowed head injection', (current.match(/<!-- PROJECT THEME START:/g)||[]).length === 1 && headBlock.test(current));
  check('page outside html opt-in, injected head and navbar is byte-identical',stripAllowed(current) === stripAllowed(original),{baselineSha256:sha(stripAllowed(original)),currentSha256:sha(stripAllowed(current))});
  const withoutInjection = current.replace(headBlock,'');
  for (const tag of ['style','script']) check(`original ${tag} blocks are byte-identical`,JSON.stringify(blocks(original,tag)) === JSON.stringify(blocks(withoutInjection,tag)));
  for (const tag of ['iframe','video','source','img']) {
    const tags = html => [...html.replace(navBlock,'').matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))].map(m=>m[0]);
    check(`${tag} attributes outside navbar unchanged`,JSON.stringify(tags(original)) === JSON.stringify(tags(current)));
  }
  check('project opt-in attributes', /<html\b[^>]*data-tront-theme-editor/.test(current) && /data-tront-theme-surface="project"/.test(current) && /data-te-project="native"/.test(current));
  const nav = current.match(navBlock)?.[0] || '';
  check('four canonical absolute links', ['https://tront.xyz/','https://tront.xyz/games/','https://tront.xyz/blog/','https://tront.xyz/discord/'].every(url=>nav.includes(`href="${url}"`)) && (nav.match(/<a\b/g)||[]).length === 4);
  check('five nav controls including hidden progressive-enhancement Theme button', (nav.match(/<(?:a|button)\b/g)||[]).length === 5 && /<button\b[^>]*id="tront-theme-btn"[^>]*hidden/.test(nav));
  const tree = gitText(baselineRoot,['ls-tree','-r','--full-tree',baselineRef]).trim().split('\n').filter(Boolean).map(line=>{const m=/^(\d+) (\w+) ([a-f\d]+)\t(.+)$/.exec(line);return {mode:m[1],type:m[2],oid:m[3],file:m[4]};});
  for (const entry of tree.filter(e=>e.type==='blob'&&e.file!=='index.htm')) {
    const target = path.join(root,entry.file); let oid = null;
    if(fs.existsSync(target)) oid = gitText(root,['hash-object','--',target]).trim();
    check(`protected original file: ${entry.file}`,oid===entry.oid,{baseBlob:entry.oid,currentBlob:oid});
    if (/\.(mp4|jpe?g|png|webp)$/i.test(entry.file)) report.media.push({file:entry.file,baseBlob:entry.oid,currentBlob:oid,unchanged:oid===entry.oid});
  }
  if(project==='monke') for(const file of ['monke_slide.jpg','video1.mp4','video2.mp4']) check(`baseline contains protected ${file}`,report.media.some(item=>item.file===file));
  report.baselineHtmlSha256=sha(original); report.currentHtmlSha256=sha(current); report.pass=!report.errors.length;
  return {report,original,current};
}
if (require.main === module) {
  let options;
  try {options=argumentsFor();fs.mkdirSync(options.output,{recursive:true});const {report}=sourceCheck(options);fs.writeFileSync(path.join(options.output,'source.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;}
  catch(error){if(options){fs.mkdirSync(options.output,{recursive:true});fs.writeFileSync(path.join(options.output,'source-error.json'),JSON.stringify({error:error.stack},null,2));}console.error(error.stack);process.exitCode=1;}
}
module.exports={BASES,argumentsFor,gitText,sha,stripAllowed,sourceCheck};
