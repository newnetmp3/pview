# PView — Firefox add-ons

A source repository for independent Firefox extensions. Each add-on is stored in `addons/<name>/`.

## Pornhex Video Saver

Source: [addons/pornhex-video-saver](addons/pornhex-video-saver)

The extension detects downloadable direct video files and certain HLS streams on Pornhex. Playback against the live site remains unverified. Use it only for videos you are permitted to download.

### Mozilla unlisted signing through GitHub Actions

1. Obtain Mozilla Add-ons API credentials from https://addons.mozilla.org/en-US/developers/addon/api/key/ .
2. In this repository, open **Settings → Secrets and variables → Actions** and create:
   - `AMO_JWT_ISSUER` — Mozilla API issuer/key
   - `AMO_JWT_SECRET` — Mozilla API secret
3. Open **Actions → Sign Firefox add-on → Run workflow** on the `main` branch.
4. Download the artifact named `pornhex-video-saver-signed` from the successful run. Extract it and install the signed `.xpi` using Firefox. The GitHub workflow requests the **unlisted** distribution channel, so this is not a public AMO listing.

**Never commit or paste signing credentials.** Mozilla must approve/sign the add-on before it can be permanently installed in standard Firefox.

### Updating

Bump `addons/pornhex-video-saver/manifest.json`'s version, commit changes, and manually run the signing workflow. A previously submitted version cannot be signed again under the same version number.

## Development

The repository contains no embedded credentials or automatic publication of adult-site content. A CI push validates source; manually running the workflow signs it if the developer secrets are present.
