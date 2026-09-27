import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readdir,stat} from 'node:fs/promises';
const run=promisify(execFile),ffmpeg=process.argv[2];
if(!ffmpeg)throw Error('Pass a trusted local FFmpeg binary path.');
for(const file of await readdir('public/assets')){
 if(!file.endsWith('.png')||(await stat('public/assets/'+file)).size<500000)continue;
 const target='public/assets/'+file.replace(/\.png$/,'.webp');
 await run(ffmpeg,['-y','-loglevel','error','-i','public/assets/'+file,'-c:v','libwebp','-lossless','0','-compression_level','6','-quality','92',target]);
 console.log(file, '→',Math.round((await stat(target)).size/1024)+' KB');
}
