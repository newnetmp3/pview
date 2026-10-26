# Pornhex Video Saver (Firefox)

A local Firefox WebExtension for detecting downloadable video streams on `pornhex.com` and its language subdomains. Designed as a privacy-respecting utility: no login, no tracking, no uploads, no analytics, no remote service.

## Features

- Detects direct MP4/WebM video files, HLS (`.m3u8`) streams, and MPEG-DASH (`.mpd`) manifests.
- Scans the video element, structured page metadata, initialization scripts, and the video network requests. Can find CDN URLs, even if the player uses a `blob:` URL.
- Downloads direct files using Firefox's Download Manager into `Downloads/Pornhex/`.
- Downloads ordinary on-demand HLS streams by collecting their media segments and saving `.ts` (MPEG-TS) or `.mp4` (fragmented MP4). Supports HLS master playlist quality selection, byte ranges, AES-128 segment encryption, and cancellation.
- Offers a Copy FFmpeg command for HLS and DASH streams (recommended for huge downloads, unusual playlists, or separate audio).
- Shows status and progress; downloads continue when the popup closes.
- Restricts media discovery to Pornhex tabs; does not access page data on other sites. No tracking or external APIs.

## Install (unsigned development build)

1. In desktop Firefox open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose the supplied `pornhex-video-saver.zip` (or `manifest.json` from the extracted source).
4. Open a video page on Pornhex and start the player, then click the add-on's toolbar icon.
5. Select a direct file or an HLS stream, choose quality for HLS if available, and click **Download**.

Temporary installation expires when Firefox restarts. Permanent installation on standard Firefox requires Mozilla signing; merely renaming this ZIP to XPI does not make it signed.

## Optional FFmpeg fallback (Arch Linux)

```bash
sudo pacman -S ffmpeg
```

For HLS or DASH streams where the browser download is unavailable, click **FFmpeg** to copy a command that tries stream-copying the source to an `.mp4` file. Paste it into a terminal. Some streams may require a different output format, access cookies, or a valid signed URL. FFmpeg does not defeat DRM.

## Permissions

- **Access your data for all websites** (`<all_urls>`): required to recognize and read video streams served from unknown third-party CDN hosts while Pornhex is open. Collection/storage of candidates is restricted to verified Pornhex tabs. It is not used to scan other visited websites.
- **webRequest**: identifies media and playlists that may not appear in page markup.
- **tabs**: confirms the active tab is on Pornhex and collects its title.
- **downloads**: saves files via Firefox's download manager.

## Limitations

- **Not validated against a live playback session on Pornhex**. Player code and CDN formats may change.
- The browser HLS routine handles on-demand HLS with muxed audio and video. Separate audio playlists, MPEG-DASH, DRM-protected streams, discontinuities, and some unusual HLS formats need a dedicated tool (e.g., FFmpeg) and may still be inaccessible.
- In-browser HLS assembly buffers the downloaded media in browser memory before saving. Long/high-quality videos can exhaust memory; use the FFmpeg option instead.
- Some CDN links require cookies/referrers/short-lived signed URLs. Direct Firefox downloads may fail in these cases.
- The in-browser HLS routine preserves the stream's container. A `.ts` file is intentional for MPEG-TS streams, not a broken MP4.
- Use only for content you are authorized to download, subject to applicable laws and site terms.

## Development

Plain HTML, CSS, and JavaScript; no build dependency. Run `node tests/run.js && node tests/hls-integration.js` to test URL handling, playlist parsing, HLS segment assembly, and AES-128 processing. `zip` contents from this directory to package. The archive in the deliverables directory is ready to load temporarily in Firefox.

## Submitting to Mozilla for permanent installation (unlisted)

1. Sign in to https://addons.mozilla.org/developers/addon/submit/ with **your** Mozilla developer account.
2. Choose **On your own** (self-distributed / unlisted), not the public Add-ons listing.
3. Upload `pornhex-video-saver-AMO-upload.zip`. This contains only the installable extension files.
4. Follow Mozilla's questions about permissions and data collection. The extension declares `none` because it has no telemetry or data transmission to the developer. Downloads go to the media host requested by the user, and the downloaded file is stored locally.
5. Download the **Mozilla-signed `.xpi`** from the Developer Hub after review/signing, then open the `.xpi` with Firefox and approve the installation.

Optional terminal signing: on Arch, install the `web-ext` Node CLI (`npm install --global web-ext`), create personal API credentials at https://addons.mozilla.org/en-US/developers/addon/api/key/, and run `sign-unlisted.sh` from this source directory after setting the `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` environment variables. Never put these keys into a repo or send them in chat.

The AMO submission ZIP is **not signed until Mozilla returns the signed XPI**. This project has not undergone AMO validation or live site playback testing.
