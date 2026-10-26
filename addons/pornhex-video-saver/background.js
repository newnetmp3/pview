/* Firefox persistent background: candidate registry and download engine. */
'use strict';
const mediaByTab = new Map();
const jobsByTab = new Map();
const blobDownloads = new Map();
let nextJobId = 1;
let capabilitiesPromise = null;
function capabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      let android = /Android/i.test(navigator.userAgent || '');
      try {
        const info = await browser.runtime.getPlatformInfo();
        android = info.os === 'android';
      } catch { /* Older runtimes may lack platform information. */ }
      return {android, nativeDownloads:!android && typeof browser.downloads?.download === 'function'};
    })();
  }
  return capabilitiesPromise;
}

function state(tabId) {
  if (!mediaByTab.has(tabId)) mediaByTab.set(tabId, {candidates:new Map(),title:'',pageUrl:''});
  return mediaByTab.get(tabId);
}
async function allowedTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return null;
  try {
    const tab = await browser.tabs.get(tabId);
    return PH.isPornhex(tab.url) ? tab : null;
  } catch { return null; }
}
async function addCandidate(tabId, rawUrl, metadata={}) {
  const tab = await allowedTab(tabId);
  if (!tab) return false;
  const url = PH.resolve(rawUrl, tab.url);
  if (!url) return false;
  const kind = metadata.kind || PH.classify(url, metadata.contentType);
  if (!['video','hls','dash'].includes(kind)) return false;
  const entry = state(tabId);
  if (entry.pageUrl && entry.pageUrl!==tab.url) {
    entry.candidates.clear();
  }
  entry.pageUrl=tab.url;
  entry.title = metadata.title && metadata.title.length <= 250 ? metadata.title : (entry.title || tab.title || 'video');
  const existing = entry.candidates.get(url);
  if (existing) {
    if (!existing.label && metadata.label) existing.label = metadata.label;
    return false;
  }
  // Keep the registry bounded. First detected candidates are generally useful.
  if (entry.candidates.size >= 50) return false;
  entry.candidates.set(url, {url, kind, quality:PH.quality(url), label:metadata.label || ''});
  browser.browserAction?.setBadgeText?.({tabId,text:String(entry.candidates.size)}).catch(()=>{});
  browser.browserAction?.setBadgeBackgroundColor?.({tabId,color:'#5277d4'}).catch(()=>{});
  return true;
}
function candidateArray(tabId) { return [...state(tabId).candidates.values()]; }
function publicJob(job) {
  if (!job) return null;
  return {id:job.id,state:job.state,label:job.label,progress:job.progress,error:job.error || null,downloadId:job.downloadId || null};
}
async function detectFromRequest(req, mime) {
  if (req.tabId === -1) return;
  const kind = PH.classify(req.url,mime);
  if (!kind) return;
  await addCandidate(req.tabId,req.url,{kind});
}
browser.webRequest.onBeforeRequest.addListener((req)=>{
  // Firefox observes requests from all sites due to CDN host permissions;
  // addCandidate restricts storage strictly to Pornhex tabs.
  if (PH.typeForUrl(req.url)) detectFromRequest(req).catch(()=>{});
}, {urls:['<all_urls>'], types:['media','xmlhttprequest','other','object','sub_frame']});
browser.webRequest.onResponseStarted.addListener((req)=>{
  const header = (req.responseHeaders || []).find(h=>h.name.toLowerCase()==='content-type');
  if (header) detectFromRequest(req,header.value||'').catch(()=>{});
}, {urls:['<all_urls>'], types:['media','xmlhttprequest','other','object','sub_frame']}, ['responseHeaders']);
browser.tabs.onRemoved.addListener((tabId)=>{
  mediaByTab.delete(tabId);
  const job=jobsByTab.get(tabId);
  if (job && job.state==='working') job.controller.abort();
  jobsByTab.delete(tabId);
});
browser.tabs.onUpdated.addListener((tabId, changeInfo)=>{
  if (changeInfo.url) {
    mediaByTab.delete(tabId);
    browser.browserAction?.setBadgeText?.({tabId,text:''}).catch(()=>{});
  }
});
browser.downloads?.onChanged?.addListener((change)=>{
  if (change.state && ['complete','interrupted'].includes(change.state.current)) {
    const url=blobDownloads.get(change.id);
    if (url) { URL.revokeObjectURL(url); blobDownloads.delete(change.id); }
  }
});

function filename(title,kind,quality,ext) {
  const name = PH.cleanTitle(title);
  const q = quality ? ` - ${quality}` : '';
  return `Pornhex/${name}${q}.${ext}`;
}
async function startDownload(tabId,media,selectedUrl) {
  const tab=await allowedTab(tabId);
  if (!tab) throw new Error('Open a Pornhex video page first.');
  const entry=state(tabId);
  const candidate=entry.candidates.get(media);
  if (!candidate) throw new Error('This media URL is no longer available; rescan the page.');
  const running=jobsByTab.get(tabId);
  if (running && running.state==='working') throw new Error('A download is already in progress for this tab.');
  if (candidate.kind === 'dash') throw new Error('DASH needs FFmpeg. Use Copy FFmpeg command.');
  const platform = await capabilities();
  if (!platform.nativeDownloads) {
    // Android has no extension downloads API: display a real link on the video page.
    const title = entry.title || tab.title || 'video';
    const ext = candidate.kind === 'hls' ? 'ts' : new URL(candidate.url).pathname.match(/\.(mp4|m4v|webm|mov)$/i)?.[1]?.toLowerCase() || 'mp4';
    const name = PH.cleanTitle(title) + (candidate.quality ? ` - ${candidate.quality}` : '') + '.' + ext;
    try {
      const response = await browser.tabs.sendMessage(tabId, {
        action:'OPEN_MOBILE_SAVER',url:candidate.url,kind:candidate.kind,
        filename:name,selectedUrl:selectedUrl || ''
      }, {frameId:0});
      if (response?.error) throw new Error(response.error);
      return {mobile:true};
    } catch(err) {
      throw new Error(`Could not open the mobile saver on this page: ${err.message || err}. Reload the tab and try again.`);
    }
  }
  const controller=new AbortController();
  const job={id:nextJobId++,state:'working',label:'Starting download…',progress:0,controller,error:'',downloadId:null};
  jobsByTab.set(tabId,job);
  // Async worker continues after popup closes.
  (async()=>{
    try {
      const title=entry.title || tab.title || 'video';
      const q = candidate.quality;
      let id;
      if (candidate.kind === 'video') {
        const ext=new URL(candidate.url).pathname.match(/\.(mp4|m4v|webm|mov)$/i)?.[1]?.toLowerCase() || 'mp4';
        job.label='Handing direct video to Firefox…';
        id=await browser.downloads.download({url:candidate.url,filename:filename(title,candidate.kind,q,ext),saveAs:false,conflictAction:'uniquify'});
      } else {
        job.label='Reading HLS playlist…';
        const result=await HLS.download(candidate.url,({done,total})=>{
          job.progress=Math.round(done/total*100);
          job.label=`Collecting HLS segments ${done}/${total}`;
        },controller.signal,selectedUrl);
        if (controller.signal.aborted) throw new Error('Cancelled');
        job.label='Saving assembled stream…';
        const objectUrl=URL.createObjectURL(result.blob);
        try {
          id=await browser.downloads.download({url:objectUrl,filename:filename(title,'hls',q,result.ext),saveAs:false,conflictAction:'uniquify'});
          blobDownloads.set(id,objectUrl);
        } catch(err) { URL.revokeObjectURL(objectUrl); throw err; }
      }
      job.downloadId=id;
      job.progress=100;
      job.state='complete';
      job.label='Download sent to Firefox';
    } catch(err) {
      job.state = controller.signal.aborted ? 'cancelled' : 'error';
      job.label = job.state==='cancelled' ? 'Cancelled' : 'Could not download';
      job.error=err.message || String(err);
    }
  })();
  return publicJob(job);
}
browser.runtime.onMessage.addListener(async(message,sender)=>{
  if (!message || typeof message.action!=='string') return undefined;
  if (message.action==='REPORT') {
    if (!sender.tab || !PH.isPornhex(sender.url || '')) return false;
    const list=Array.isArray(message.candidates)?message.candidates.slice(0,80):[];
    for (const c of list) if (c && typeof c.url==='string') {
      await addCandidate(sender.tab.id,c.url,{label:String(c.label||'').slice(0,80),title:sender.frameId===0 ? message.title : undefined});
    }
    return true;
  }
  const tabId = Number(message.tabId);
  const tab=await allowedTab(tabId);
  if (!tab) return {error:'Open a Pornhex video page and try again.'};
  if (message.action==='GET_STATE') {
    const entry=state(tabId);
    return {title:entry.title || tab.title || '', candidates:candidateArray(tabId),job:publicJob(jobsByTab.get(tabId)),platform:await capabilities()};
  }
  if (message.action==='OPTIONS') {
    const candidate=state(tabId).candidates.get(message.url);
    if (!candidate || candidate.kind!=='hls') return {error:'Not an HLS playlist.'};
    try {
      const playlist=await HLS.readPlaylist(candidate.url);
      return {variants:playlist.variants.map(x=>({url:x.url,resolution:x.resolution,bandwidth:x.bandwidth}))};
    } catch(e) {return {error:e.message||String(e)};}
  }
  if (message.action==='DOWNLOAD') {
    try {return {job:await startDownload(tabId,message.url,message.selectedUrl)};}
    catch(e){return {error:e.message||String(e)};}
  }
  if (message.action==='CANCEL') {
    const job=jobsByTab.get(tabId);
    if (job && job.state==='working') {job.controller.abort();return {ok:true};}
    return {error:'Nothing to cancel.'};
  }
  if (message.action==='RESCAN') {
    try {await browser.tabs.sendMessage(tabId,{action:'SCAN'});return {ok:true};}
    catch(e) {return {error:'Could not scan this page. Refresh it and try again.'};}
  }
  return undefined;
});
