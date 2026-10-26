/* Finds candidates in Pornhex page markup without affecting the original player. */
'use strict';
(() => {
  let scanTimer=null;
  const seen=new Set();
  const SEND_CAP=80;
  function report(url, label, found) {
    const resolved=PH.resolve(url,document.baseURI);
    if (!resolved || !PH.classify(resolved) || seen.has(resolved)) return;
    seen.add(resolved);
    found.push({url:resolved,label:label||''});
  }
  function scan() {
    if (!document.documentElement) return;
    const found=[];
    for (const video of document.querySelectorAll('video,video source,source[type^="video"],source[type*="mpegurl"]')) {
      report(video.currentSrc || video.src || video.getAttribute('src'), 'Video player', found);
      if (video.tagName === 'VIDEO') {
        for (const source of video.querySelectorAll('source')) report(source.src || source.getAttribute('src'), 'Player source',found);
      }
    }
    for (const meta of document.querySelectorAll('meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"],meta[name="twitter:player:stream"]')) {
      report(meta.content,'Page metadata',found);
    }
    for (const element of document.querySelectorAll('[data-src],[data-video],[data-file],[data-hls],[data-stream]')) {
      for (const attr of ['data-src','data-video','data-file','data-hls','data-stream'])
        report(element.getAttribute(attr),'Player data',found);
    }
    // Many players embed source URLs inside initialization JSON or scripts.
    for (const script of document.querySelectorAll('script:not([src])')) {
      const str=script.textContent || '';
      if (str.length > 500000) continue;
      const normalized=str.replace(/\\\//g,'/').replace(/\\u0026/gi,'&').replace(/&amp;/g,'&');
      const urlRx=/(?:https?:\/\/|\/\/)[^\s"'<>\\]+?\.(?:mp4|webm|m4v|mov|m3u8|mpd)(?:\?[^\s"'<>\\]*)?/gi;
      let match;
      while ((match=urlRx.exec(normalized)) && found.length<SEND_CAP) report(match[0],'Page script',found);
    }
    if (found.length) browser.runtime.sendMessage({action:'REPORT',title:document.title,candidates:found.slice(0,SEND_CAP)}).catch(()=>{});
  }
  function schedule() { if (scanTimer!==null) return; scanTimer=setTimeout(()=>{scanTimer=null;scan();},500); }
  browser.runtime.onMessage.addListener(msg=>{if(msg?.action==='SCAN') {scan();return Promise.resolve(true);} });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();
  // Observe changed player sources; mutations are coalesced to avoid heavy scans.
  const observe=()=>{ if (document.documentElement) new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-src','data-file','data-hls','data-video']}); };
  if (document.documentElement) observe();
  else document.addEventListener('DOMContentLoaded',observe,{once:true});
  window.addEventListener('load',schedule,{once:true});
})();
