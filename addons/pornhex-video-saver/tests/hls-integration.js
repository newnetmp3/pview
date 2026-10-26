const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto').webcrypto;
const encoder=new TextEncoder();
const fixtures=new Map();
const base='https://example.test/';
function fixture(file,data){fixtures.set(base+file,typeof data==='string'?encoder.encode(data):data);}
fixture('master.m3u8','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900000\nmedia.m3u8');
fixture('media.m3u8','#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:2,\na.ts\n#EXTINF:2,\nb.ts\n#EXT-X-ENDLIST');
fixture('a.ts','A'); fixture('b.ts','B');
fixture('fmp4.m3u8','#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\nfrag1.m4s\n#EXT-X-ENDLIST');
fixture('init.mp4','INIT');fixture('frag1.m4s','FRAGMENT');
const fetched=[];
const mockFetch=async(url,opts)=>{
 fetched.push(url);
 const data=fixtures.get(url);
 if(!data)return new Response('Missing',{status:404});
 return new Response(data,{status:200,headers:{'Content-Type':'application/octet-stream'}});
};
const context=vm.createContext({URL,BigInt,Uint8Array,Blob,DOMException,crypto,fetch:mockFetch});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../hls.js'),'utf8'),context);
const download=vm.runInContext('HLS.download',context);
(async()=>{
 let steps=[];
 let result=await download(base+'master.m3u8',x=>steps.push(x.done),new AbortController().signal);
 assert.equal(result.ext,'ts');
 assert.equal(await result.blob.text(),'AB');
 assert.deepEqual(steps,[1,2]);
 assert(!fetched.includes(base+'low.m3u8'));
 result=await download(base+'fmp4.m3u8');
 assert.equal(result.ext,'mp4');
 assert.equal(await result.blob.text(),'INITFRAGMENT');
 // AES-128 segment encryption/decryption, with media sequence IV.
 const key=crypto.getRandomValues(new Uint8Array(16));
 const rawKey=await crypto.subtle.importKey('raw',key,'AES-CBC',false,['encrypt']);
 const iv=new Uint8Array(16);iv[15]=12;
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv},rawKey,encoder.encode('decrypted segment')));
 fixture('key.bin',key);fixture('enc.ts',ciphertext);
 fixture('aes.m3u8','#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:12\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:2,\nenc.ts\n#EXT-X-ENDLIST');
 result=await download(base+'aes.m3u8');
 assert.equal(await result.blob.text(),'decrypted segment');
 await assert.rejects(download(base+'media.m3u8', undefined, undefined, undefined, {maxBytes:1}), /memory limit/);
 console.log('PASS: HLS VOD master selection, MPEG-TS assembly, fMP4 init map, AES-128 segments and mobile memory limits');
})().catch(e=>{console.error(e);process.exitCode=1;});
