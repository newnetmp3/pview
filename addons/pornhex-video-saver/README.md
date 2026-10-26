# Pornhex Video Saver — desktop Firefox and Firefox for Android

A Firefox extension that detects video sources on Pornhex pages without telemetry, third-party upload services, or tracking.

## Desktop Firefox

The popup identifies direct MP4/WebM, standard on-demand HLS, and DASH manifest URLs. Direct video uses Firefox Downloads to save under `Downloads/Pornhex/`. Supported HLS playlists assemble locally into MPEG-TS or fragmented MP4, including variant choice, byte ranges, AES-128 segments, progress, and cancellation. Unsupported DASH, DRM, live HLS, discontinuities, and separate audio tracks need an external downloader.

## Firefox Android (v1.0.1)

The `browser.downloads.download()` extension API is not supported on Android; automatic synthetic clicks from extension popups also may fail. Android therefore uses a **real, user-activated save link on the Pornhex page**.

1. Open the video page and start playback if necessary.
2. Open the add-on from Firefox Android's Extensions menu and select **Save on page** for a detected video or HLS quality.
3. Return to the web page. A removable **Save video on Android** panel will appear.
4. For a direct file, first tap **Try direct download**. If Firefox opens the video instead, use **Prepare file for saving**.
5. For HLS, tap **Prepare file for saving** to assemble the on-demand stream. Once ready, **tap the Save link** to start Android's native download. Keep the page open while downloading.

The Android preparation path holds media in tab memory and **refuses downloads over 160 MiB** to reduce out-of-memory crashes. Android cannot choose a `Downloads/Pornhex` subfolder through WebExtensions. Stream/CDN CORS policies can prevent preparation, and some media hosts open direct links instead of downloading them. Neither a live Pornhex playback session nor an Android hardware test has been completed; mobile success is therefore not guaranteed.

## Permissions and privacy

- `<all_urls>` lets the extension detect video hosted by unknown third-party CDNs, but its registry only collects sources associated with Pornhex tabs.
- `webRequest` watches for video and manifest requests in those tabs.
- `tabs` verifies site context, returns source information, and opens the on-page Android panel.
- `downloads` serves desktop Firefox; Android guards the unavailable API.

No login, automatic uploads, advertising, remote storage, or DRM bypass. Download only media you're entitled to save.

## Tests and signing

```bash
node tests/run.js
node tests/hls-integration.js
node tests/mobile.js
node tests/background-platform.js
```

The add-on uses the same Gecko extension ID on both operating systems. Build signatures via the [R20eb-backed PView unlisted signing workflow](https://github.com/newnetmp3/roll20embetterment/actions/workflows/pview-firefox-sign.yml). Signing credentials remain in R20eb's existing `firefox-signing` environment; do not put API tokens into PView. The XPI produced by Mozilla is the installable artifact. Unsigned source ZIPs are development-only.
