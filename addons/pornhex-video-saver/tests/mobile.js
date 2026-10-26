const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname,'..');
const nodes = [];
class Element {
  constructor(tag) {this.tagName=tag;this.className='';this.textContent='';this.hidden=false;this.children=[];this.handlers={};nodes.push(this);}
  append(...children){this.children.push(...children);}
  attachShadow(){this.shadow=new Element('shadow');return this.shadow;}
  addEventListener(name,listener){this.handlers[name]=listener;}
  setAttribute(name,value){this[name]=value;}
  remove(){this.removed=true;}
  click(){throw Error('Synthetic click was used');}
}
const document = {createElement:tag=>new Element(tag),documentElement:new Element('html'),title:'Test clip - Pornhex'};
const TestURL = class extends URL {};
let blobCount=0;
TestURL.createObjectURL = ()=>'blob:https://pornhex.com/'+(++blobCount);
TestURL.revokeObjectURL = ()=>{};
let handler, contentLength='16';
const browser={runtime:{onMessage:{addListener:f=>{handler=f;}}}};
const win={};win.top=win;
const context=vm.createContext({
  window:win,document,browser,location:{href:'https://pornhex.com/video/abc'},URL:TestURL,
  AbortController,Blob,DOMException,Uint8Array,BigInt,crypto:require('node:crypto').webcrypto,
  fetch:async()=>new Response('some video bytes',{status:200,headers:{'content-length':contentLength,'content-type':'video/mp4'}})
});
for (const file of ['shared.js','hls.js','mobile.js']) vm.runInContext(fs.readFileSync(path.join(dir,file),'utf8'),context);
const find=(tag,text)=>nodes.filter(x=>x.tagName===tag&&(text===undefined||x.textContent.includes(text))).at(-1);
(async()=>{
  const result=await handler({action:'OPEN_MOBILE_SAVER',url:'https://cdn.test/file.mp4',kind:'video',filename:'Clip.mp4'});
  assert.equal(result.ok,true);
  assert.equal(find('a','try direct download').href,'https://cdn.test/file.mp4');
  await find('button','Prepare file for saving').handlers.click();
  const link=find('a','Tap here to save');
  assert.equal(link.hidden,false);
  assert.equal(link.download,'Clip.mp4');
  assert.equal(blobCount,1);
  find('button','×').handlers.click();
  contentLength=String(170*1024*1024);
  await handler({action:'OPEN_MOBILE_SAVER',url:'https://cdn.test/file.mp4',kind:'video',filename:'Big.mp4'});
  await find('button','Prepare file for saving').handlers.click();
  assert.match(find('p','160 MiB').textContent,/160 MiB/);
  assert.equal(blobCount,1);
  const invalid=await handler({action:'OPEN_MOBILE_SAVER',url:'javascript:alert(1)',kind:'video',filename:'x'});
  assert.match(invalid.error,/cannot be saved/);
  console.log('PASS: Android native links, blob prep, size cap, URL safety');
})().catch(e=>{console.error(e);process.exitCode=1;});
