import {spawn} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'..');
async function healthy(){try{const r=await fetch('http://127.0.0.1:4173/__preview',{signal:AbortSignal.timeout(800)});return r.ok&&(await r.json()).site==='lyverne'}catch{return false}}
if(await healthy()){console.log('Lyverne is already running: http://127.0.0.1:4173/');process.exit(0)}
await mkdir(path.join(cwd,'.preview'),{recursive:true});
const log=await open(path.join(cwd,'.preview/server.log'),'a');
const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd,detached:true,stdio:['ignore',log.fd,log.fd]});
child.unref();
await writeFile(path.join(cwd,'.preview/server.pid'),String(child.pid));
await log.close();
for(let i=0;i<20;i++){if(await healthy()){console.log('Lyverne is running independently: http://127.0.0.1:4173/');process.exit(0)}await new Promise(r=>setTimeout(r,150))}
console.error('The preview did not become ready. Check .preview/server.log.');process.exit(1);
