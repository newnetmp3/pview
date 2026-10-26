/* Shared no-dependency URL and filename helpers. */
'use strict';
const PH = (() => {
  const MEDIA = /\.(mp4|m4v|webm|mov|m3u8|mpd)(?:$|[?#])/i;
  const SEGMENT = /\.(?:ts|m4s|aac|mp3|vtt|jpg|png|webp)(?:$|[?#])/i;
  function isPornhex(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host === 'pornhex.com' || host.endsWith('.pornhex.com');
    } catch { return false; }
  }
  function resolve(raw, base) {
    try {
      const url = new URL(raw, base);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }
  function typeForUrl(url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (/\.m3u8$/.test(path)) return 'hls';
      if (/\.mpd$/.test(path)) return 'dash';
      if (/\.(mp4|m4v|webm|mov)$/.test(path)) return 'video';
      return null;
    } catch { return null; }
  }
  function classify(url, contentType='') {
    if (!resolve(url)) return null;
    const mime = contentType.toLowerCase().split(';')[0].trim();
    if (/^(application\/vnd\.apple\.mpegurl|application\/x-mpegurl|audio\/mpegurl)$/.test(mime)) return 'hls';
    if (mime === 'application/dash+xml') return 'dash';
    if (/^video\/(mp4|webm|quicktime|x-m4v)$/.test(mime)) return 'video';
    if (SEGMENT.test(url)) return null;
    return typeForUrl(url);
  }
  function quality(url) {
    const text = decodeURIComponentSafe(url);
    const match = text.match(/(?:^|[^\d])(2160|1440|1080|720|480|360|240)p?(?:[^\d]|$)/i);
    return match ? `${match[1]}p` : '';
  }
  function decodeURIComponentSafe(text) { try { return decodeURIComponent(text); } catch { return text; } }
  function cleanTitle(title) {
    const cleaned = String(title || 'video')
      .replace(/\s*[|•·–-]\s*Pornhex.*$/i, '')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')
      .replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim();
    return (cleaned || 'video').slice(0, 110);
  }
  function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function ffmpegCommand(url, referer, title) {
    const basename = cleanTitle(title);
    return `ffmpeg -hide_banner -loglevel warning -user_agent 'Mozilla/5.0' -referer ${shellQuote(referer)} -i ${shellQuote(url)} -c copy ${shellQuote(basename + '.mp4')}`;
  }
  return { isPornhex, resolve, typeForUrl, classify, quality, cleanTitle, ffmpegCommand, MEDIA };
})();
