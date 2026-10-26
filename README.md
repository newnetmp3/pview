# PView — Firefox add-ons

PView is a source repository for Firefox extensions, with each add-on located in `addons/<name>/`.

## Pornhex Video Saver (desktop + Android, v1.0.1)

- Source: [addons/pornhex-video-saver](addons/pornhex-video-saver)
- Continuous tests and lint: [PView validation workflow](.github/workflows/sign-firefox.yml)
- Mozilla unlisted signing: [R20eb PView signing workflow](https://github.com/newnetmp3/roll20embetterment/actions/workflows/pview-firefox-sign.yml)

Desktop Firefox uses the browser's Downloads API. Firefox for Android uses an on-page, user-tapped download link because the extension downloads API is unavailable on Android. The Android panel can locally prepare video files and HLS streams up to 160 MiB; very large files need desktop Firefox. Neither live-site playback nor physical Android compatibility has been verified yet. Only download media you have permission to save.

## Signing Firefox extensions

The Mozilla signing credentials already exist in the R20eb GitHub repository under its `firefox-signing` environment. GitHub environment secrets cannot be read by other repositories; **no copies, personal access tokens, or new credentials are needed** for this build.

1. Commit the extension changes to `main` in PView.
2. Open **[R20eb → Actions → PView Firefox unlisted signed build](https://github.com/newnetmp3/roll20embetterment/actions/workflows/pview-firefox-sign.yml)**.
3. Click **Run workflow**, select `main`, and run it.
4. Open the completed run. Download its `pview-pornhex-video-saver-mozilla-signed` artifact. Extract the ZIP to obtain a Mozilla-signed XPI, then install it in Firefox.

The signing job checks out PView's main branch, runs desktop and Android regression tests and Mozilla lint, signs as an **unlisted** extension, and uploads the signed XPI. It does not publish this extension to Mozilla's public listing.

### Future versions

Increase `addons/pornhex-video-saver/manifest.json`'s `version` for each signing attempt after a successful Mozilla submission. Keep the Gecko extension ID stable to allow normal updates.

### Separation and credentials

The R20eb signing workflow reuses credentials only **inside R20eb**; it does not expose them or make them accessible to PView. PView's own Actions workflow validates source without signing secrets. The Firefox release process for R20eb itself remains unchanged.
