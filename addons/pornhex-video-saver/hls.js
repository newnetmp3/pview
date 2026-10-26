/* Simple VOD HLS reader. Saves standard MPEG-TS or fragmented-MP4 streams as-is. */
'use strict';
const HLS = (() => {
  const byLine = (text) => String(text).replace(/\r/g, '').split('\n').map(x=>x.trim());
  function attributes(text) {
    const out = {};
    const rx = /([A-Z0-9-]+)=("(?:[^"]|\\")*"|[^,]*)/g;
    let m;
    while ((m = rx.exec(text))) {
      let value = m[2];
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      out[m[1]] = value;
    }
    return out;
  }
  function parse(text, address) {
    const lines = byLine(text);
    if (lines[0] !== '#EXTM3U') throw new Error('Not an HLS playlist.');
    const variants = [], segments = [];
    let stream = null, key = null, map = null, range = null, seq = 0, nextSequence = 0;
    let isLive = true, separateAudio = false, discontinuity = false;
    let lastSegmentRangeEnd = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF:')) stream = attributes(line.substring(18));
      else if (line.startsWith('#EXT-X-MEDIA:')) {
        const a = attributes(line.substring(13));
        if (a.TYPE === 'AUDIO' && a.URI) separateAudio = true;
      }
      else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) { seq = Number(line.substring(22)); nextSequence = seq; }
      else if (line.startsWith('#EXT-X-KEY:')) {
        const a = attributes(line.substring(11));
        key = a.METHOD === 'NONE' ? null : {method:a.METHOD, url:a.URI ? new URL(a.URI,address).href : '', iv:a.IV || null};
      }
      else if (line.startsWith('#EXT-X-MAP:')) {
        const a = attributes(line.substring(11));
        map = {url:new URL(a.URI, address).href, range:a.BYTERANGE || null};
      }
      else if (line.startsWith('#EXT-X-BYTERANGE:')) range = line.substring(17);
      else if (line === '#EXT-X-ENDLIST') isLive = false;
      else if (line.startsWith('#EXT-X-DISCONTINUITY')) discontinuity = true;
      else if (line && !line.startsWith('#')) {
        const url = new URL(line, address).href;
        if (stream) {
          variants.push({url, bandwidth:Number(stream.BANDWIDTH || 0),
            resolution:stream.RESOLUTION || '', codecs:stream.CODECS || '', audio:stream.AUDIO || ''});
          stream = null;
        } else {
          let parsedRange = null;
          if (range) {
            const [length, offset] = range.split('@').map(Number);
            const start = Number.isFinite(offset) ? offset : lastSegmentRangeEnd;
            if (!Number.isFinite(length) || length <= 0) throw new Error('Invalid HLS byte range.');
            parsedRange = {start, end:start + length - 1};
            lastSegmentRangeEnd = start + length;
          } else lastSegmentRangeEnd = 0;
          segments.push({url, key:key ? {...key} : null, map:map ? {...map} : null,
            range:parsedRange, sequence:nextSequence++});
          range = null;
        }
      }
    }
    if (variants.length) return {variants, segments:[], separateAudio, isLive:false};
    return {variants:[], segments, separateAudio, isLive, discontinuity};
  }
  function ivBytes(iv, sequence) {
    if (iv) {
      if (!/^0x[0-9a-fA-F]{32}$/.test(iv)) throw new Error('Unsupported HLS initialization vector.');
      return Uint8Array.from(iv.slice(2).match(/../g), x => parseInt(x, 16));
    }
    const value = BigInt(sequence);
    const bytes = new Uint8Array(16);
    for (let i=0; i<8; i++) bytes[15-i] = Number((value >> BigInt(i*8)) & 255n);
    return bytes;
  }
  async function readUrl(url, {signal, range}={}) {
    const headers = {};
    if (range) headers.Range = `bytes=${range.start}-${range.end}`;
    const resp = await fetch(url, {credentials:'include', headers, signal, cache:'no-store'});
    if (!resp.ok) throw new Error(`HTTP ${resp.status} retrieving media`);
    let data = new Uint8Array(await resp.arrayBuffer());
    if (range && resp.status === 200) {
      if (data.length < range.end+1) throw new Error('Server ignored Range header.');
      data = data.subarray(range.start,range.end+1);
    }
    return data;
  }
  async function readPlaylist(url, signal) {
    const response = await fetch(url, {credentials:'include', signal, cache:'no-store'});
    if (!response.ok) throw new Error(`Playlist HTTP ${response.status}`);
    return parse(await response.text(), response.url || url);
  }
  function bestVariant(variants) {
    return [...variants].sort((a,b)=>b.bandwidth-a.bandwidth)[0];
  }
  async function download(playlistUrl, onProgress, signal, selectedUrl) {
    let url = playlistUrl;
    let playlist;
    for (let level=0; level<4; level++) {
      playlist = await readPlaylist(url, signal);
      if (!playlist.variants.length) break;
      const chosen = (level===0 && selectedUrl && playlist.variants.find(v=>v.url===selectedUrl)) || bestVariant(playlist.variants);
      if (!chosen) throw new Error('No playable HLS variant found.');
      // When audio is a separate HLS track, raw segments cannot produce a complete video.
      if (chosen.audio && playlist.separateAudio) throw new Error('This stream has separate audio. Use Copy FFmpeg command to merge it.');
      url = chosen.url;
    }
    if (!playlist || playlist.variants.length) throw new Error('Nested HLS playlists exceed supported depth.');
    if (!playlist.segments.length) throw new Error('No video segments found.');
    if (playlist.isLive) throw new Error('Live HLS streams are not supported.');
    if (playlist.discontinuity) throw new Error('Discontinuous HLS requires FFmpeg. Use Copy FFmpeg command.');
    const hasMap = playlist.segments.some(s=>s.map);
    const encrypted = playlist.segments.some(s=>!!s.key);
    if (hasMap && encrypted) throw new Error('Encrypted fragmented MP4 requires FFmpeg.');
    const pieces = [], keyCache = new Map();
    let currentMap = '';
    for (let i=0; i<playlist.segments.length; i++) {
      if (signal?.aborted) throw new DOMException('Download cancelled.', 'AbortError');
      const segment = playlist.segments[i];
      if (segment.map && currentMap !== `${segment.map.url}|${segment.map.range}`) {
        let mapRange;
        if (segment.map.range) {
          const [len,offset] = segment.map.range.split('@').map(Number);
          if (!Number.isFinite(offset) || !Number.isFinite(len)) throw new Error('Unsupported initialization range.');
          mapRange = {start:offset,end:offset+len-1};
        }
        pieces.push(await readUrl(segment.map.url,{signal,range:mapRange}));
        currentMap = `${segment.map.url}|${segment.map.range}`;
      }
      let bytes = await readUrl(segment.url,{signal,range:segment.range});
      if (segment.key) {
        if (segment.key.method !== 'AES-128' || !segment.key.url) throw new Error('Protected or unsupported HLS encryption.');
        if (!keyCache.has(segment.key.url)) {
          const raw = await readUrl(segment.key.url,{signal});
          if (raw.length!==16) throw new Error('Invalid AES-128 HLS key.');
          keyCache.set(segment.key.url, await crypto.subtle.importKey('raw',raw,'AES-CBC',false,['decrypt']));
        }
        bytes = new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:ivBytes(segment.key.iv, segment.sequence)},keyCache.get(segment.key.url),bytes));
      }
      pieces.push(bytes);
      onProgress?.({done:i+1,total:playlist.segments.length});
    }
    return {blob:new Blob(pieces,{type:hasMap?'video/mp4':'video/mp2t'}),ext:hasMap?'mp4':'ts', segments:playlist.segments.length};
  }
  return {parse,attributes,ivBytes,bestVariant,readPlaylist,download};
})();
