#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if [[ -z "${WEB_EXT_API_KEY:-}" || -z "${WEB_EXT_API_SECRET:-}" ]]; then
  echo 'Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET from your Mozilla Add-ons developer account.' >&2
  echo 'https://addons.mozilla.org/en-US/developers/addon/api/key/' >&2
  exit 2
fi
if ! command -v web-ext >/dev/null 2>&1; then
  echo 'web-ext is required: npm install --global web-ext' >&2
  exit 3
fi
mkdir -p ../signed
web-ext lint --source-dir .
web-ext sign --channel=unlisted --source-dir . --artifacts-dir ../signed \
 --ignore-files 'tests/**' 'README.md' 'sign-unlisted.sh'
echo 'Look in ../signed for the signed .xpi; install that file in Firefox.'
