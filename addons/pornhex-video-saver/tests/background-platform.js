const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
async function run(android) {
  let receiver, handoff=null, downloadCalls=0;
  const addListener=()=>{};
  const browser={
    runtime:{getPlatformInfo:async()=>({os:android?'android':'linux'}),onMessage:{addListener:fn=>{receiver=fn;}}},
    webRequest:{onBeforeRequest:{addListener},onResponseStarted:{addListener}},
    tabs:{
      get:async id=>({id,url:'https://pornhex.com/watch/example',title:'Movie | Pornhex'}),
      sendMessage:async(id,msg)=>{handoff={id,msg};return {ok:true};},
      onRemoved:{addListener},onUpdated:{addListener}
    }
  };
  if (!android) browser.downloads={download:async()=>{downloadCalls++;return 77;},onChanged:{addListener}};
  const context=vm.createContext({browser,navigator:{userAgent:android?'Android Firefox':'Desktop Firefox'},URL,Map,Number,AbortController,console});
  for(const file of ['shared.js','background.js']) vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
  const url='https://video.cdn.test/movie.mp4';
  const sender={tab:{id:5},url:'https://pornhex.com/watch/example',frameId:0};
  assert.equal(await receiver({action:'REPORT',title:'Movie | Pornhex',candidates:[{url}]},sender),true);
  const state=await receiver({action:'GET_STATE',tabId:5},{});
  assert.equal(state.candidates.length,1);
  assert.equal(state.platform.android,android);
  const result=await receiver({action:'DOWNLOAD',tabId:5,url},{});
  assert.equal(result.error,undefined);
  if (android) {
    assert.equal(result.job.mobile,true);
    assert.equal(handoff.id,5);
    assert.equal(handoff.msg.action,'OPEN_MOBILE_SAVER');
    assert.equal(handoff.msg.filename,'Movie.mp4');
    assert.equal(downloadCalls,0);
  } else {
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(downloadCalls,1);
    const next=await receiver({action:'GET_STATE',tabId:5},{});
    assert.equal(next.job.downloadId,77);
    assert.equal(next.job.state,'complete');
  }
}
(async()=>{await run(true);await run(false);console.log('PASS: Android downloads-free initialization and desktop download regression');})()
  .catch(e=>{console.error(e);process.exitCode=1;});
