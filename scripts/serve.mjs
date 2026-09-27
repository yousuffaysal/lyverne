import {localApi} from './local-api.mjs';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const previewPort=Number(process.env.LYVERNE_PORT||4173);
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.webm':'video/webm','.mp4':'video/mp4'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  if(pathname==='/__preview'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"site":"lyverne","status":"ok"}');return}
  if(await localApi(req,res))return;
  let file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  if((await stat(file)).isDirectory()){
   if(!pathname.endsWith('/')){res.writeHead(308,{Location:pathname+'/'+url.search}).end();return}
   file=path.join(file,'index.html');
  }
  const info=await stat(file);
  if(path.extname(file)==='.mp4'){
   const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Lyverne-Preview':'1'};
   const range=req.headers.range;
   if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return}
    const start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;
    if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return}
    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);return;
   }
   res.writeHead(200,{...headers,'Content-Length':info.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);return;
  }
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Lyverne-Preview':'1'});res.end(data);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found')}
}).listen(previewPort,'127.0.0.1',()=>console.log(`Lyverne preview: http://127.0.0.1:${previewPort}`));
