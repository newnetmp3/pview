/* Android fallback: browser.downloads is not implemented on Firefox Android.
 * Use an in-page panel with genuine, user-tapped links, never synthetic clicks.
 */
'use strict';
(() => {
  if (window !== window.top) return;
  const LIMIT = 160 * 1024 * 1024;
  let host, root, controller, blobUrl, token = 0;
  let statusNode, ready, prepareBtn, cancelBtn;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const status = text => { if (statusNode) statusNode.textContent = text; };
  function close() {
    token++;
    controller?.abort();
    controller = null;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    host?.remove();
    host = root = statusNode = ready = prepareBtn = cancelBtn = null;
  }
  function busy(value) {
    if (prepareBtn) prepareBtn.disabled = value;
    if (cancelBtn) cancelBtn.hidden = !value;
  }
  function finish(blob, name) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(blob);
    ready.href = blobUrl;
    ready.download = name;
    ready.hidden = false;
    ready.textContent = 'Tap here to save ' + name;
    status('Ready: ' + (blob.size / 1048576).toFixed(1) + ' MiB. Tap the Save link, and keep this tab open until the download finishes.');
  }
  async function fetchDirect(url, signal, progress) {
    const response = await fetch(url, {credentials:'include',signal,cache:'no-store'});
    if (!response.ok || response.type === 'opaque') throw Error('File fetch failed (HTTP ' + response.status + '). Try the direct link or desktop Firefox.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > LIMIT) throw Error('File exceeds the 160 MiB Android preparation limit. Try a direct link or desktop Firefox.');
    if (!response.body?.getReader) {
      const blob = await response.blob();
      if (blob.size > LIMIT) throw Error('File exceeds the 160 MiB limit.');
      return blob;
    }
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        bytes += result.value.byteLength;
        if (bytes > LIMIT) {
          await reader.cancel().catch(() => {});
          throw Error('File exceeds the 160 MiB Android preparation limit.');
        }
        chunks.push(result.value);
        progress(bytes,length);
      }
    } finally { reader.releaseLock(); }
    return new Blob(chunks,{type:response.headers.get('content-type') || 'application/octet-stream'});
  }
  async function prepare(url, kind, quality, name) {
    if (controller) return;
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    ready.hidden = true;
    const seq = ++token;
    controller = new AbortController();
    busy(true);
    status('Preparing video on this device…');
    try {
      let blob, saveName = name;
      if (kind === 'hls') {
        const result = await HLS.download(url, detail => {
          if (token === seq) status('Collecting HLS: ' + detail.done + '/' + detail.total + ' (' + (detail.bytes / 1048576).toFixed(1) + ' / 160 MiB)');
        }, controller.signal, quality, {maxBytes:LIMIT});
        blob = result.blob;
        saveName = name.replace(/\.[a-z0-9]+$/i, '.' + result.ext);
      } else {
        blob = await fetchDirect(url, controller.signal, (bytes, length) => {
          if (token === seq) status('Preparing ' + (bytes / 1048576).toFixed(1) + (length ? ' / ' + (length / 1048576).toFixed(1) : '') + ' MiB…');
        });
      }
      if (token !== seq || controller.signal.aborted) return;
      finish(blob, saveName);
    } catch (error) {
      if (token === seq) status(controller?.signal.aborted ? 'Cancelled.' : 'Unable to prepare: ' + (error.message || String(error)));
    } finally {
      if (token === seq) {controller = null; busy(false);}
    }
  }
  function show(data) {
    if (!PH.isPornhex(location.href)) return {error:'Open a Pornhex page to save video.'};
    const url = PH.resolve(data.url, location.href);
    if (!url || (data.kind !== 'video' && data.kind !== 'hls')) return {error:'This media URL cannot be saved.'};
    if (data.selectedUrl && !PH.resolve(data.selectedUrl, location.href)) return {error:'Invalid quality.'};
    close();
    host = el('div');
    root = host.attachShadow({mode:'closed'});
    const style = el('style');
    style.textContent = [
      ':host{all:initial;position:fixed!important;bottom:12px!important;left:12px!important;right:12px!important;z-index:2147483647!important;display:block!important}',
      '*{box-sizing:border-box}section{font:14px/1.45 system-ui,sans-serif;color:#dce7ff;background:#171b2d;border:1px solid #65739b;border-radius:12px;max-width:460px;max-height:78vh;overflow:auto;margin:auto;padding:16px;box-shadow:0 12px 32px #000a}',
      'h2{font:700 17px system-ui;margin:0 38px 10px 0;color:white}p{font:12px/1.5 system-ui;color:#afc0e4;overflow-wrap:anywhere}',
      'button,a.action{display:block;width:100%;min-height:44px;line-height:22px;padding:11px 12px;border-radius:8px;text-decoration:none;text-align:center;font:700 13px system-ui;touch-action:manipulation;cursor:pointer}',
      'button{background:#7aa2f7;color:#151a2c;border:0}button:disabled{opacity:.6}a.action{background:#a4e2c6;color:#17291f}a.secondary{background:#35415e;color:white}',
      '.buttons{display:grid;gap:9px}.close{position:absolute;right:12px;top:12px;width:44px;height:44px;background:#35415e;color:white;font-size:18px}',
      '.wrapper{position:relative}small{display:block;font:12px/1.5 system-ui;color:#a9b7d8}button[hidden],a[hidden]{display:none}'
    ].join('');
    const card = el('section','wrapper');
    const closeBtn = el('button','close','×');closeBtn.setAttribute('aria-label','Close saver');
    closeBtn.addEventListener('click',close);
    card.append(closeBtn,el('h2','', 'Save video on Android'),el('p','',PH.cleanTitle(document.title)));
    const controls = el('div','buttons');
    if (data.kind === 'video') {
      const native = el('a','action secondary','Tap here to try direct download');
      native.href = url;
      native.download = data.filename;
      native.target = '_blank';
      native.rel = 'noopener noreferrer';
      controls.append(native,el('small','','If the video plays instead, return here and use Prepare file.'));
    }
    prepareBtn = el('button','', 'Prepare file for saving');
    prepareBtn.addEventListener('click',() => prepare(url,data.kind,data.selectedUrl,data.filename));
    cancelBtn = el('button','','Cancel preparation');cancelBtn.hidden = true;
    cancelBtn.addEventListener('click',() => controller?.abort());
    ready = el('a','action','');ready.hidden = true;
    // Android only honors a real user tap on this anchor, not element.click().
    controls.append(prepareBtn,cancelBtn,ready);
    statusNode = el('p');statusNode.setAttribute('role','status');statusNode.setAttribute('aria-live','polite');
    statusNode.textContent = 'Tap a download link or prepare a local file. Large files may require desktop Firefox.';
    card.append(controls,statusNode);root.append(style,card);
    document.documentElement.append(host);
    return {ok:true};
  }
  browser.runtime.onMessage.addListener(message => {
    if (message?.action === 'OPEN_MOBILE_SAVER') return Promise.resolve(show(message));
    return undefined;
  });
})();