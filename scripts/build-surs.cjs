#!/usr/bin/env node
'use strict';
// Conservative whitespace/comment compaction preserving JS tokens and CSS templates.
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
function compact(source) {
let inTemplate=false;
return source.split(String.fromCharCode(10)).map(line=>{
const insideAtStart=inTemplate; let quote='', block=false;
for(let i=0;i<line.length;i++){
const c=line[i],n=line[i+1];
if(inTemplate){if(c.charCodeAt(0)===92){i++;continue;}if(c.charCodeAt(0)===96)inTemplate=false;continue;}
if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
if(quote){if(c.charCodeAt(0)===92){i++;continue;}if(c===quote)quote='';continue;}
if(c==='/'&&n==='/')break;
if(c==='/'&&n==='*'){block=true;i++;continue;}
if(c.charCodeAt(0)===34||c.charCodeAt(0)===39){quote=c;continue;}
if(c.charCodeAt(0)===96)inTemplate=true;
}
if(insideAtStart)return line;
if(/^\s*\/\//.test(line))return '';
return line.replace(/^[ \t]+/,'').replace(/[ \t]+$/,'');
}).join(String.fromCharCode(10));
}
const input=path.join(root,'build','surs.source.txt'),output=path.join(root,'surs.js');
const original=fs.readFileSync(input,'utf8'),built=compact(original);
new Function(built);
if(process.argv.includes('--check')){
if(fs.readFileSync(output,'utf8')!==built){process.stderr.write('surs.js differs from source');process.exitCode=1;}
else process.stdout.write('Build reproducible');
}else{fs.writeFileSync(output,built);process.stdout.write('Compacted '+original.length+' to '+built.length+' chars');}
