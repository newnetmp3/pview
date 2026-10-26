'use strict';
(() => {
  const $ = (id)=>document.getElementById(id);
  let tabId=null, previousSignature='',variants=new Map(),android=false;
  function message(text){ $('message').textContent=text; $('message').classList.toggle('hidden',!text); }
  function textEl(tag,cls,value){const e=document.createElement(tag);if(cls)e.className=cls;e.textContent=value;return e;}
  function showJob(job){
    $('job').classList.toggle('hidden',!job);
    if (!job) return;
    $('jobTitle').textContent=job.label;
    $('jobPercent').textContent=job.progress+'%';
    $('jobBar').style.width=job.progress+'%';
    $('jobError').textContent=job.error||'';
    $('jobError').classList.toggle('hidden',!job.error);
    $('cancel').classList.toggle('hidden',job.state!=='working');
  }
  async function call(action,extra={}) {
    return browser.runtime.sendMessage({action,tabId,...extra});
  }
  function candidateCard(item){
    const card=textEl('article','media','');
    const head=textEl('div','mediaHead','');
    const badge=textEl('span','mediaBadge '+item.kind,item.kind==='video'?'VIDEO':item.kind==='hls'?'HLS':'DASH');
    const info=textEl('div','mediaInfo','');
    const quality=item.quality || (item.kind==='video'?'Direct file':'Stream');
    info.append(textEl('div','mediaTitle',quality),textEl('div','mediaSub',item.url));
    head.append(badge,info);card.append(head);
    let select=null;
    if (item.kind==='hls') {
      select=document.createElement('select'); select.className='quality';select.title='Choose stream quality';
      select.append(new Option('Best available quality',''));
      select.addEventListener('focus',()=>loadVariants(item.url,select),{once:true});
      card.append(select);
    }
    const actions=textEl('div','mediaActions','');
    const button=document.createElement('button');button.textContent=item.kind==='dash'?'Copy FFmpeg command':android?'Save on page':'Download';
    button.addEventListener('click',async()=>{
      if(item.kind==='dash') return copyCommand(item.url);
      message(''); const result=await call('DOWNLOAD',{url:item.url,selectedUrl:select?.value||undefined});
      if(result?.error) message(result.error);
      else if(result?.job?.mobile) message('The mobile save panel is open on the video page. Return to the page to tap Save or Prepare file.');
      await refresh();
    });
    actions.append(button);
    if (item.kind !== 'video') {
      const ff=document.createElement('button');ff.className='secondary';ff.textContent='FFmpeg';ff.title='Copy an FFmpeg command for this stream';
      ff.addEventListener('click',()=>copyCommand(item.url));actions.append(ff);
    }
    const copy=document.createElement('button');copy.className='secondary';copy.textContent='Copy URL';copy.title='Copy video link';
    copy.addEventListener('click',()=>navigator.clipboard.writeText(item.url).then(()=>message('Media URL copied.')).catch(()=>message('Clipboard write was blocked.')));
    actions.append(copy);card.append(actions);
    return card;
  }
  async function loadVariants(url,select) {
    if (variants.has(url)) {fillVariants(select,variants.get(url));return;}
    const result=await call('OPTIONS',{url});
    if (result?.error) {message('Could not read qualities: '+result.error);return;}
    variants.set(url,result.variants||[]);fillVariants(select,result.variants||[]);
  }
  function fillVariants(select,items){
    const chosen=select.value;
    select.replaceChildren(new Option('Best available quality',''));
    for (const v of items) {
      const bitrate=v.bandwidth ? (v.bandwidth/1000000).toFixed(1)+' Mbps' : '';
      select.append(new Option((v.resolution||'Variant')+' '+bitrate,v.url));
    }
    select.value=chosen;
  }
  async function copyCommand(url) {
    const tabs=await browser.tabs.get(tabId);
    const title=$('pageTitle').textContent;
    const command=PH.ffmpegCommand(url,tabs.url,title);
    try {await navigator.clipboard.writeText(command);message('FFmpeg command copied. Paste it into a terminal with FFmpeg installed.');}
    catch {message('Could not copy to clipboard.');}
  }
  async function refresh() {
    if(tabId===null) return;
    let response;
    try {response=await call('GET_STATE');}
    catch(e){message(e.message);return;}
    if(response?.error){message(response.error);return;}
    const updatedAndroid=!!response.platform?.android || response.platform?.nativeDownloads===false;
    if (updatedAndroid!==android) { android=updatedAndroid;previousSignature=''; }
    $('platformHint').textContent=android
      ? 'Android: tap Save on page, then use the real download link. For HLS, prepare the file first.'
      : 'Desktop: files save through Firefox Downloads.';
    $('pageTitle').textContent=PH.cleanTitle(response.title);
    const items=response.candidates||[];
    $('count').textContent=items.length+' '+(items.length===1?'stream':'streams');
    const signature=JSON.stringify(items);
    if(signature!==previousSignature){
      previousSignature=signature;
      const list=$('list');list.replaceChildren();
      if (!items.length) list.append(textEl('p','empty','No video source detected yet. Play the video, then click the refresh button.'));
      else {
        items.sort((a,b)=>({video:0,hls:1,dash:2}[a.kind]-{video:0,hls:1,dash:2}[b.kind]));
        for(const item of items) list.append(candidateCard(item));
      }
    }
    showJob(response.job);
  }
  $('refresh').addEventListener('click',async()=>{
    message('Scanning player…');const r=await call('RESCAN');
    if(r?.error) message(r.error);else message('Scan complete. Start playback if no media is shown.');
    await refresh();
  });
  $('cancel').addEventListener('click',async()=>{const r=await call('CANCEL');if(r?.error)message(r.error);await refresh();});
  (async()=>{
    const tabs=await browser.tabs.query({active:true,currentWindow:true});
    if (!tabs.length || !PH.isPornhex(tabs[0].url)) {
      $('pageTitle').textContent='Not on Pornhex';
      message('Open a video on pornhex.com to detect downloads.');return;
    }
    tabId=tabs[0].id;
    await call('RESCAN');await refresh();
    setInterval(refresh,800);
  })().catch(e=>message(e.message));
})();
