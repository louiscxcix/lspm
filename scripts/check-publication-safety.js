'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const patterns=[
 ['Google API key',/AIza[0-9A-Za-z_-]{35}/g],
 ['Supabase personal token',/\bsbp_[A-Za-z0-9_-]{20,}/g],
 ['Supabase secret key',/\bsb_secret_[A-Za-z0-9_-]{20,}/g],
 ['GitHub access token',/\bgh[pousr]_[A-Za-z0-9]{20,}/g],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
 ['OpenAI secret key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}/g]
];
function inspectFile(filename,content){
 const problems=[];
 if(/\.(?:sqlite3?|db)(?:-(?:wal|shm))?$/i.test(filename)||/(?:^|\/)\.env(?:\..+)?$/.test(filename)&&!filename.endsWith('.env.example'))problems.push('plaintext database or environment file');
 const text=content.toString('utf8');
 for(const [name,pattern] of patterns){pattern.lastIndex=0;if(pattern.test(text))problems.push(name);}
 for(const token of text.match(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role')problems.push('Supabase service-role token');}catch{}}
 return problems;
}
function check(){
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean),failures=[];
 for(const file of files){if(!fs.existsSync(file))continue;for(const problem of inspectFile(file,fs.readFileSync(file)))failures.push(file+': '+problem);}
 const assets=require('../client-assets');
 for(const file of assets){if(!/\.(?:html|css|js)$/.test(file)||path.basename(file)!==file)failures.push('Unexpected browser asset: '+file);}
 if(assets.includes('firebase-store.js'))failures.push('Legacy Firebase adapter must not be published.');
 if(failures.length)throw Error('Publication safety check failed:\n'+failures.join('\n'));
 console.log('Publication safety passed: '+files.length+' tracked files; no plaintext database or detected secret patterns; browser assets are allowlisted.');
}
if(require.main===module){try{check();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={inspectFile,check};
